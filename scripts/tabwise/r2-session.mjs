// R2-L2 S5b: authentic session (design §1.2-§1.5, §2.2, §5, §7.3). Exports runR2Session only; only the default-blocked
// entry (scripts/tabwise-r2.mjs --page) imports it, dynamically, after its gates and its own brand check.
//
// Boundary: the first statement refuses any runtime the one-shot qualification loader did not brand. There is no
// synthetic branch, no test brand and no fallback: offline tests reach composition only through composeR2Page with
// their own handles. Every capability module (browser, axe, network isolation, observer, executor, page recorder,
// loopback listener) is imported dynamically after the brand check. The guard, getGate, NVDA instance and foreground
// factory come from the branded runtime; this module builds no gate and no other send path.
//
// Evidence: composeR2Page seals with no authenticity claim, so the S3 verdict is 'synthetic' or 'incomplete' even for a
// real run. This module adds no claim and no class (no hosted-run attestation exists yet: owner decision O-10) and
// reports genuine_evidence:false. The result is JSON only; no live handle leaves this function.
import {isQualificationRuntime} from './qualification-loader.mjs';
import {composeR2Page} from './r2-compose.mjs';

const SESSION_SCHEMA = 'tabwise-r2-session-result/1';
const DATA_KEYS = ['approved', 'evidenceDir', 'fixture', 'fixture_id', 'focusWaitMs', 'handleTimeoutMs', 'spec'];
const CLEANUP_MS = 10000;
const AXE_RULES = 200;
const REASONS = 64;
let used = false;

const message = error => error?.message ?? String(error);
const within = (label, operation, ms) => {
  let timer;
  return Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${label}: timed out after ${ms} ms`)), ms); })])
    .finally(() => clearTimeout(timer));
};
// axe results are reduced to rule ids, impact and node targets so the axe lane stays within its cap.
const summarizeAxe = result => ({
  violations: (result?.violations ?? []).slice(0, AXE_RULES).map(v => ({id: String(v.id), impact: v.impact ?? null, nodes: (v.nodes ?? []).slice(0, 50).map(n => structuredClone(n.target ?? null))})),
  counts: {violations: result?.violations?.length ?? 0, passes: result?.passes?.length ?? 0, incomplete: result?.incomplete?.length ?? 0, inapplicable: result?.inapplicable?.length ?? 0},
});

/**
 * runR2Session(runtime, data) -> JSON-only result. runtime: the branded loader runtime. data = {fixture_id, fixture (bytes),
 * approved:{fixture_sha256, task}, spec:{actions, ackMs, timeoutMs, observationMs, pollMs}, evidenceDir (absolute),
 * handleTimeoutMs, focusWaitMs}. One call per process. Throws only before any effect (brand, reuse, data shape,
 * runtime authenticity, fixture/plan validation); afterwards it always cleans up and returns.
 */
export async function runR2Session(runtime, data) {
  if (!isQualificationRuntime(runtime)) throw Error('R2 session requires the owned vendored runtime');
  if (used) throw Error('R2 session: one page per process');
  used = true;
  const {guard, getGate} = runtime;
  const authentic = () => {
    runtime.assertAuthentic();
    if (getGate() !== guard) throw Error('R2 session: registered gate identity changed');
  };
  if (data === null || typeof data !== 'object' || Array.isArray(data) || JSON.stringify(Object.keys(data).sort()) !== JSON.stringify(DATA_KEYS))
    throw Error(`R2 session: data must be exactly {${DATA_KEYS.join(', ')}}`);
  // Detached once: a getter or later mutation of the caller's object cannot change what is validated and used.
  let input;
  try { input = structuredClone(data); } catch (error) { throw Error(`R2 session: data is not plain data: ${message(error)}`); }
  input.fixture = input.fixture instanceof Uint8Array ? Buffer.from(input.fixture) : null;
  if (!input.fixture || typeof input.evidenceDir !== 'string') throw Error('R2 session: fixture bytes and evidence directory required');
  authentic();

  const [{randomBytes, randomUUID}, {createServer}, {isAbsolute}, {chromium}, {AxeBuilder}, network, {createSpeechObserver}, {createGuardedPressExecutor},
    {foregroundMismatch}, {settingsMismatch}, evidence, {installR2PageRecorder}] = await Promise.all([
    import('node:crypto'), import('node:http'), import('node:path'), import('@playwright/test'), import('@axe-core/playwright'), import('./network.mjs'),
    import('./observer.mjs'), import('./executor.mjs'), import('../../src/speech/foreground.mjs'), import('../../src/speech/validate.mjs'),
    import('./r2-evidence.mjs'), import('../../src/r2/page-recorder.mjs')]);
  authentic();
  // Pure validation before any effect: served copy, step map and caps exactly as the writer and compose recompute them.
  if (!isAbsolute(input.evidenceDir)) throw Error('R2 session: evidence directory must be absolute');
  const nonce = randomBytes(4).toString('hex'), session = randomUUID();
  const {record} = evidence.applyTitleNonce(input.fixture, nonce);
  if (record.fixture_sha256 !== input.approved?.fixture_sha256) throw Error('R2 session: fixture differs from the approved hash');
  evidence.buildR2StepMap(input.approved.task);
  evidence.planR2EvidenceCaps(input.spec);

  const reasons = [], cleanup = [], unexpected = [];
  const reason = text => { if (reasons.length < REASONS) reasons.push(text); };
  const clock = Object.freeze({now: () => performance.now(), wait: ms => new Promise(done => setTimeout(done, ms))});
  let loopback = null, writer = null, owned = null, probe = null, speech = null, compose = null, composeError = null, refusedBeforeInput = false;

  let observerAcquisition = null, observerClosing = null, observerClose = null, observerTeardown = false;
  let observerOwned = null;
  const closeOwnedObserver = () => {
    if (!observerOwned) return Promise.resolve();
    observerClose ??= Promise.resolve().then(() => observerOwned.close());
    observerClose.catch(() => {}); // retain rejection for every cleanup caller
    return observerClose;
  };
  const closeObserver = () => {
    observerTeardown = true;
    observerClosing ??= (async () => {
      if (observerAcquisition) await observerAcquisition;
      await closeOwnedObserver();
    })();
    observerClosing.catch(() => {});
    return observerClosing;
  };

  try {
    // 127.0.0.1 listener: owns the port the isolated context fulfils from memory; any request reaching it is recorded.
    loopback = createServer((request, response) => { if (unexpected.length < 64) unexpected.push({method: request.method, url: String(request.url).slice(0, 256)}); response.writeHead(410); response.end(); });
    await within('loopback listen', () => new Promise((ok, fail) => { loopback.once('error', fail); loopback.listen(0, '127.0.0.1', ok); }), input.handleTimeoutMs);
    const port = loopback.address().port;
    writer = evidence.createR2EvidenceWriter({enabled: true, dir: input.evidenceDir, page: {fixture_id: input.fixture_id, session, port}, fixture: input.fixture,
      approved: input.approved, nonce, spec: input.spec});

    const launching = (async () => {
      const server = await chromium.launchServer({headless: false, args: [...network.BROWSER_ARGS], handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false});
      let browser, context;
      try {
        const pid = server.process()?.pid;
        if (!Number.isSafeInteger(pid) || pid <= 0) throw Error('owned Chromium PID missing');
        browser = await chromium.connect(server.wsEndpoint());
        context = await network.createIsolatedContext(browser, {port, source: writer.identity.served});
        await context.addInitScript(installR2PageRecorder, {session});
        const page = await context.newPage();
        await page.goto(writer.identity.url, {waitUntil: 'load', timeout: input.handleTimeoutMs});
        await page.bringToFront();
        let closing;
        return {pid, version: browser.version(), page,
          close: () => closing ??= (async () => { try { await context.close(); } finally { try { await browser.close(); } finally { await server.close(); } } })()};
      } catch (error) {
        await context?.close().catch(() => {}); await browser?.close().catch(() => {}); await server.kill().catch(() => {});
        throw error;
      }
    })();
    // A launch that outlives its bound is closed when it settles; it is never handed to composition.
    try { owned = await within('owned browser', () => launching, input.handleTimeoutMs); }
    catch (error) { launching.then(late => late.close()).catch(() => {}); throw error; }
    authentic();
    probe = runtime.createForeground();

    // The S5a handle contract (r2-compose.mjs HANDLE_KEYS / METHODS), built only from the branded runtime and owned objects.
    const handles = {
      guard, getGate, clock, writer,
      createExecutor: options => {
        const inner = createGuardedPressExecutor({...options, checkForeground: async () => { authentic(); return options.checkForeground(); }});
        const refuse = error => { if (!guard.isStopped()) guard.stop(`R2 session: ${message(error)}`, guard.status().sends > 0 ? 'send' : 'pre'); };
        return Object.freeze({
          execute: async (action, context) => {
            try { authentic(); } catch (error) { refuse(error); throw error; }
            let failed = false;
            try { return await inner.execute(action, context); } catch (error) { failed = true; throw error; }
            finally {
              // Revalidated after disarm; a failure stops the gate and never replaces an earlier executor error.
              try { authentic(); } catch (error) { refuse(error); if (!failed) throw error; }
            }
          },
          snapshot: () => inner.snapshot(),
        });
      },
      nvda: {
        press: (key, options) => runtime.nvda.press(key, options),
        start: async () => {
          authentic();
          const receipt = await runtime.nvda.start({settings: structuredClone(runtime.cfg.nvda_settings)});
          const settings = runtime.nvda.getSettings();
          const readback = Object.fromEntries(Object.entries(runtime.cfg.nvda_settings).flatMap(([section, values]) => Object.keys(values).map(key => [`${section}.${key}`, settings?.[section]?.[key] ?? null])));
          const mismatch = settingsMismatch(runtime.cfg.nvda_settings, readback);
          if (mismatch.length) throw Error(`NVDA settings read-back: ${mismatch.join('; ')}`);
          const relay = await runtime.relayOwnerPid();
          if (relay !== receipt?.pid) throw Error('NVDA relay owner differs from the owned process');
          return {pid: receipt.pid, relay_pid: receipt.relay_pid, reset_confirmed: receipt.reset_confirmed};
        },
        stop: () => runtime.nvda.stop(),
      },
      observer: {
        open: async receipt => {
          if (observerAcquisition || observerTeardown) throw Error('observer already opened or teardown started');
          observerAcquisition = Promise.resolve().then(async () => {
            const acquired = await createSpeechObserver({NVDAClient: runtime.NVDAClient, guard, getGate, relayOwnerPid: runtime.relayOwnerPid, startupReceipt: receipt,
              deadlineMs: clock.now() + input.handleTimeoutMs, now: clock.now});
            observerOwned = acquired;
            if (observerTeardown) {
              await closeOwnedObserver();
              throw Error('observer acquired after teardown started; closed');
            }
            speech = acquired;
          });
          observerAcquisition.catch(() => {});
          await observerAcquisition;
        },
        read: () => { if (!speech || observerTeardown) throw Error('observer not open'); return speech.read(); },
        close: closeObserver,
      },
      foreground: {check: async () => foregroundMismatch(await probe.check(), {pid: owned.pid, nonce}), close: () => probe.close()},
      page: {
        evaluate: fn => owned.page.evaluate(fn),
        screenshot: () => owned.page.screenshot({type: 'png'}),
        axe: async () => summarizeAxe(await new AxeBuilder({page: owned.page}).analyze()),
        close: () => owned.close(),
      },
    };
    try {
      compose = await composeR2Page(handles, {approved: input.approved, fixture_id: input.fixture_id, focusWaitMs: input.focusWaitMs,
        handleTimeoutMs: input.handleTimeoutMs, nonce, session, spec: input.spec});
    } catch (error) {
      composeError = message(error);
      refusedBeforeInput = /^R2 compose refused before input:/.test(composeError);
    }
  } catch (error) {
    reason(message(error));
  }
  if (composeError) reason(composeError);
  if (compose && !compose.completed) for (const r of compose.reasons) reason(`compose: ${r}`);

  // Bounded cleanup; each step runs. The browser is closed only with no live send (compose leaves it open otherwise).
  const step = async (label, fn) => { try { await within(label, fn, CLEANUP_MS); } catch (error) { cleanup.push(`${label}: ${message(error)}`); } };
  const observerCleanup = closeObserver();
  let live = null;
  try { live = guard.status().live; } catch (error) { cleanup.push(`gate status: ${message(error)}`); }
  if (owned && live === 0) await step('browser close', () => owned.close());
  else if (owned) cleanup.push('browser left open: live sends at session teardown');
  await step('observer close (pending acquisition or unconfirmed close)', () => observerCleanup);
  await step('foreground close', () => probe?.close());
  if (writer && !compose && !composeError?.startsWith('R2 compose result refused')) {
    await step('unsealed evidence', async () => { if (writer.failure() === null) await writer.seal({incomplete: [reasons[0] ?? 'session failed before composition']}); });
  }
  if (loopback) await step('loopback close', () => new Promise(done => loopback.close(() => done())));
  let post = true;
  try { authentic(); } catch (error) { post = false; reason(`post-session authenticity: ${message(error)}`); }
  if (unexpected.length) reason('unexpected network request reached the loopback listener');

  const order = compose?.teardown?.order ?? [], stopErrors = (compose?.teardown?.errors ?? []).filter(e => e.startsWith('NVDA stop'));
  const nvda = compose ? (order.includes('NVDA stop') ? (stopErrors.length ? 'unconfirmed' : 'stopped') : 'not-started')
    : (composeError && !refusedBeforeInput ? 'unconfirmed' : 'not-started');
  const completed = compose?.completed === true && post && !unexpected.length && !cleanup.length && !reasons.length && !guard.isStopped();
  if (!completed && !guard.isStopped()) guard.stop(`R2 session incomplete: ${reasons[0] ?? cleanup[0] ?? 'not completed'}`, 'protocol');
  const result = {
    schema: SESSION_SCHEMA, fixture_id: input.fixture_id, completed, nvda,
    evidence_verdict: compose?.evidence?.verdict ?? null, manifest_sha256: compose?.evidence?.manifest_sha256 ?? null,
    attestation: 'unavailable (O-10)', genuine_evidence: false,
    runtime_checks: {brand: true, post_session_authentic: post},
    browser: owned ? {pid: owned.pid, version: String(owned.version)} : null,
    unexpected_loopback_requests: unexpected.length, cleanup_errors: cleanup, reasons, compose,
  };
  return JSON.parse(JSON.stringify(result));
}
