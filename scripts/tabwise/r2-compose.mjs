// R2-L2 S5a: capability-free guarded composition (design §1.2, §1.3, §2.4, §5, §6, §7, §11 S5a). Injection only:
// this module composes already-built handles with the merged R2 pieces (S2 page source, R2-L1 journal, frozen R1
// pageAck, M2A receipt ledger, captureJourney, S3 writer) and imports nothing that launches a browser, starts NVDA,
// spawns the foreground helper, opens a socket or sends input. It assigns no provenance or evidence class: its
// result is JSON-only and the S3 writer/verifier class a page it sealed as 'synthetic' (or 'incomplete'). Only the
// later authentic S5b session may attach provenance. No entry imports this module.
//
// §1.2 reconciliation: r2-compose may not import the guarded executor module, yet §5 drives createGuardedPressExecutor. The
// factory is therefore injected (handles.createExecutor); S5b passes the real one after its brand check. Whatever
// the factory returns, every send must pass the supplied guard's admit/commit/release to produce the receipt
// ledger's complete receipt, which captureJourney requires per action; a send that bypasses the guard fails closed.
import {pageAck} from '../../src/speech/sendguard.mjs';
import {captureJourney, gateLive, invalidateForGateStop} from '../../src/r2/capture.mjs';
import {createPageJournal} from '../../src/r2/page-journal.mjs';
import {createR2PageSource, serializePageViews} from '../../src/r2/page-source.mjs';
import {createSendReceiptLedger} from '../../src/r2/send-receipt.mjs';
import {speechLaneRecord} from '../../src/r2/speech-payload.mjs';
import {buildR2StepMap, planR2EvidenceCaps} from './r2-evidence.mjs';

const COMPOSE_SCHEMA = 'tabwise-r2-compose-result/1';
const HANDLE_KEYS = ['clock', 'createExecutor', 'foreground', 'getGate', 'guard', 'nvda', 'observer', 'page', 'writer'];
const METHODS = Object.freeze({nvda: ['press', 'start', 'stop'], observer: ['open', 'read', 'close'], foreground: ['check', 'close'],
  page: ['evaluate', 'screenshot', 'axe', 'close'], clock: ['now', 'wait'],
  guard: ['setCheck', 'setAck', 'onIntent', 'arm', 'disarm', 'idle', 'quiesce', 'stop', 'isStopped', 'status']});
const DATA_KEYS = ['approved', 'fixture_id', 'focusWaitMs', 'handleTimeoutMs', 'nonce', 'session', 'spec'];
const QUIESCE_MS = 1000; // design §7.3 step 1, as createQualificationTeardown.
const REASON_CAP = 512, REASONS = 64;

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => JSON.stringify(value, (k, v) => object(v) ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);
const message = error => error?.message ?? String(error);
const refuse = detail => { throw Error(`R2 compose refused before input: ${detail}`); };

// JSON-only, detached result. Anything that JSON would drop or coerce is refused, never silently serialized away.
function jsonOnly(value, path = '$', seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw Error(`R2 compose result: non-finite number at ${path}`); return; }
  if (typeof value !== 'object') throw Error(`R2 compose result: ${typeof value} at ${path}`);
  if (seen.has(value)) throw Error(`R2 compose result: cycle at ${path}`);
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype) || Object.getOwnPropertySymbols(value).length) throw Error(`R2 compose result: non-plain object at ${path}`);
  seen.add(value);
  for (const [key, d] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (array && key === 'length') continue;
    if (!('value' in d) || d.value === undefined) throw Error(`R2 compose result: accessor or undefined at ${path}.${key}`);
    if (['provenance', 'class'].includes(key)) throw Error(`R2 compose result: ${key} is assigned only by the authentic session or verifier`);
    jsonOnly(d.value, `${path}.${key}`, seen);
  }
  seen.delete(value);
}

// Every handle and datum is validated before any handle method runs. Throws; touches nothing.
function validate(handles, data) {
  if (!object(handles) || canonical(Object.keys(handles).sort()) !== canonical(HANDLE_KEYS)) refuse(`handles must be exactly {${HANDLE_KEYS.join(', ')}}`);
  for (const [name, methods] of Object.entries(METHODS)) {
    for (const method of methods) if (typeof handles[name]?.[method] !== 'function') refuse(`handle ${name}.${method} missing`);
  }
  if (typeof handles.getGate !== 'function' || typeof handles.createExecutor !== 'function') refuse('getGate and createExecutor must be functions');
  const {guard, writer} = handles;
  if (!Object.isFrozen(guard) || !Number.isSafeInteger(guard.bounds?.ackMs) || guard.bounds.ackMs <= 0) refuse('guard must be a frozen send gate with an ackMs bound');
  if (!Object.isFrozen(writer) || typeof writer.append !== 'function' || typeof writer.put !== 'function' || typeof writer.seal !== 'function' ||
    typeof writer.failure !== 'function' || !object(writer.identity)) refuse('writer must be a frozen R2 evidence writer');
  if (!object(data) || canonical(Object.keys(data).sort()) !== canonical(DATA_KEYS)) refuse(`data must be exactly {${DATA_KEYS.join(', ')}}`);
  if (!object(data.approved) || !/^[0-9a-f]{64}$/.test(data.approved.fixture_sha256 ?? '')) refuse('approved fixture hash missing');
  if (typeof data.nonce !== 'string' || !/^[0-9a-f]{8}$/.test(data.nonce)) refuse('nonce must be 8 lowercase hex characters');
  for (const k of ['handleTimeoutMs', 'focusWaitMs']) if (!Number.isSafeInteger(data[k]) || data[k] <= 0 || data[k] > 60000) refuse(`${k} must be 1..60000`);
  let step_map, caps;
  try { step_map = buildR2StepMap(data.approved.task); } catch (error) { refuse(message(error)); }
  try { caps = planR2EvidenceCaps(data.spec); } catch (error) { refuse(message(error)); }
  if (data.spec.actions !== step_map.actions.length) refuse('evidence spec actions differs from the step map');
  if (data.spec.ackMs !== guard.bounds.ackMs) refuse('evidence spec ackMs differs from the guard bound');
  const id = writer.identity;
  if (writer.failure() !== null) refuse('evidence writer already failed');
  if (id.fixture_id !== data.fixture_id || id.session !== data.session) refuse('writer page identity differs from the task fixture or session');
  if (id.transform?.fixture_sha256 !== data.approved.fixture_sha256) refuse('served fixture hash differs from the approved fixture');
  if (id.transform?.nonce !== data.nonce || id.title !== `${id.transform?.original_title} ${data.nonce}`) refuse('served title transformation differs from the run nonce');
  if (canonical(id.step_map) !== canonical(step_map)) refuse('writer step map differs from the approved task list');
  if (canonical(id.caps) !== canonical(caps)) refuse('writer evidence caps differ from the run spec');
  if (handles.getGate() !== guard) refuse('guard is not the registered gate');
  const s = guard.status();
  if (guard.isStopped() || s?.stopped !== false || s.sends !== 0 || s.live !== 0) refuse('guard already stopped, used or busy');
  return {step_map, actions: step_map.actions, served: {title: id.title, url: id.url}};
}

/**
 * composeR2Page(handles, data) -> JSON-only result. handles = {guard, getGate, createExecutor, nvda:{press,start,stop},
 * observer:{open,read,close}, foreground:{check,close}, page:{evaluate,screenshot,axe,close}, writer, clock:{now,wait}}.
 * data = {fixture_id, session, approved:{fixture_sha256, task}, nonce, spec:{actions, ackMs, timeoutMs, observationMs,
 * pollMs}, handleTimeoutMs, focusWaitMs}. Throws (touching no handle) when validation fails; otherwise always runs
 * the §7.3 teardown and returns. completed is true only for a complete capture, a live gate after the final read, a
 * quiet teardown with no error or pending operation, and evidence that sealed and verified.
 */
export async function composeR2Page(handles, input) {
  // Detached once: a getter or later mutation of the caller's object cannot change what was validated.
  let data;
  try { data = structuredClone(input); } catch (error) { refuse(`data is not plain data: ${message(error)}`); }
  const plan = validate(handles, data);
  const {guard, getGate, nvda, observer, foreground, page, writer, clock} = handles;
  const {actions} = plan, journey = actions.map(a => ({step: a.action, press: a.press}));
  const reasons = [], order = [], teardownErrors = [], active = new Set(), intents = [];
  let source, views, ack, ledger, capture = null, receipt = null, nvdaStarted = false, observerOpened = false, finalAck = null;

  const reason = text => { if (!reasons.includes(text)) reasons.push(text); };
  const stop = (why, kind) => { if (!guard.isStopped()) guard.stop(why, kind ?? (guard.status().sends > 0 ? 'send' : 'pre')); };
  // Bounded handle call; a call still running at the bound stays listed in active (pending_operations).
  let opId = 0;
  const bounded = (label, fn) => {
    const id = `${label}#${++opId}`;
    active.add(id);
    let timer;
    const operation = Promise.resolve().then(fn);
    operation.then(() => active.delete(id), () => active.delete(id));
    return Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${label}: timed out after ${data.handleTimeoutMs} ms`)), data.handleTimeoutMs); })])
      .finally(() => clearTimeout(timer));
  };
  // Unbounded tracking for an operation another layer already bounds (captureJourney bounds execute by timeoutMs).
  const track = (label, fn) => {
    const id = `${label}#${++opId}`;
    active.add(id);
    const operation = Promise.resolve().then(fn);
    operation.then(() => active.delete(id), () => active.delete(id));
    return operation;
  };
  const event = record => writer.append('events', record);

  // §5 step 7: foreground verdicts are the session-built foregroundMismatch result, appended to the focus lane.
  const check = async context => {
    let errors;
    try { errors = await bounded('foreground check', () => foreground.check(context ?? null)); } catch (error) { errors = [`foreground check failed: ${message(error)}`]; }
    if (!Array.isArray(errors) || errors.some(e => typeof e !== 'string')) errors = ['foreground check returned no verdict'];
    writer.append('focus', {context: context === undefined ? null : structuredClone(context), errors: [...errors], observed_at: clock.now()});
    return errors;
  };
  // Synchronous intent recorder (send-receipt.mjs:108-119): the intents lane and the page source's accounting view.
  const recordIntent = token => {
    const label = token?.action?.label;
    if (typeof label !== 'string' || !label.startsWith('tabwise:')) throw Error('intent: action label is not tabwise:<action>');
    const entry = {action: label.slice('tabwise:'.length), keys: (token.info?.keys ?? []).map(k => k.vk)};
    writer.append('intents', entry);
    intents.push(entry);
  };

  try {
    event({phase: 'compose-start', fixture_id: data.fixture_id, session: data.session, actions: actions.length});
    // §3.6: one page source and one journal; both views through one single-flight queue.
    source = createR2PageSource({evaluate: fn => bounded('page evaluate', () => page.evaluate(fn)), session: data.session, served: plan.served,
      journey: actions.map(({action, press}) => ({action, press})), intents: () => intents, writer, now: () => clock.now()});
    views = serializePageViews(createPageJournal({source, writer}));
    ack = pageAck({read: cursor => views.keys(cursor), ackMs: guard.bounds.ackMs});
    const reader = async token => {
      const value = await ack(token);
      writer.append('acks', {send: token.id, action: token.action.label, ack: value.ack, reasons: [...value.reasons]});
      return value;
    };
    reader.before = token => ack.before(token);
    guard.setCheck(check);
    // §5 step 8: the ledger installs the gate's ack reader and intent hook; this module never replaces them.
    ledger = createSendReceiptLedger({gate: guard, getGate, ackReader: Object.freeze(reader), onIntent: recordIntent, actions: journey, now: () => clock.now()});

    nvdaStarted = true;
    receipt = await bounded('NVDA start', () => nvda.start());
    if (!Number.isSafeInteger(receipt?.pid) || receipt.pid <= 0 || receipt.relay_pid !== receipt.pid || receipt.reset_confirmed !== true) throw Error('NVDA start receipt missing or not owned');
    event({phase: 'nvda-start', pid: receipt.pid, reset_confirmed: true});

    // §2.2 step 4: pre-input identity. Foreground (pid + nonce, waited for), then one page read through the
    // page source, which refuses a wrong session, title, URL or missing network restriction, before any arm.
    let errors = await check({phase: 'pre-input'});
    const until = clock.now() + data.focusWaitMs;
    while (errors.length && clock.now() < until) {
      const before = clock.now();
      await bounded('foreground wait', () => clock.wait(data.spec.pollMs));
      if (!(clock.now() > before)) throw Error('pre-input foreground: clock did not advance during the foreground wait');
      errors = await check({phase: 'pre-input'});
    }
    if (errors.length) throw Error(`pre-input foreground: ${errors.join('; ')}`);
    let keys;
    try { keys = await views.keys(0); } catch (error) { throw Error(`pre-input page identity: ${message(error)}`); }
    if (keys.length) throw Error('pre-input page identity: keydowns before the first input');
    const id = writer.identity;
    event({phase: 'pre-input-identity', fixture_sha256: id.transform.fixture_sha256, served_sha256: id.transform.served_sha256, pid: receipt.pid, title: id.title, url: id.url});

    // §8.3 pre-journey visual and axe evidence; neither sends input.
    writer.append('axe', {phase: 'pre', result: await bounded('axe pre', () => page.axe())});
    writer.put('visual/pre.png', await bounded('screenshot pre', () => page.screenshot()));

    // §6.1: the observer is created after the NVDA start receipt; its first read is the cumulative baseline.
    observerOpened = true;
    await bounded('observer open', () => observer.open(structuredClone(receipt)));
    const initial = await bounded('observer read', () => observer.read());
    if (initial?.connected !== true || initial.complete !== true || !Array.isArray(initial.phrases)) throw Error('observer initial journal not connected and complete');
    event({phase: 'observer-initial', phrases: initial.phrases.length});

    const executor = handles.createExecutor({steps: journey.map(a => ({step: a.step, key: a.press})), nvda: {press: (key, options) => nvda.press(key, options)},
      guard, checkForeground: () => check({phase: 'executor'}),
      persistActionIntent: async ({step, press}) => { event({phase: 'action-intent', action: step, press}); }});
    if (!Object.isFrozen(executor) || typeof executor.execute !== 'function') throw Error('executor factory did not return a frozen guarded executor');

    capture = await captureJourney({fixture_id: data.fixture_id, actions: journey,
      speech: {read: () => observer.read()}, page: {read: () => views.snapshot()},
      // An execution still running when capture returns stays in active (an unsettled operation).
      execute: (action, context) => track('executor', () => executor.execute(action, context)),
      clock, observationMs: data.spec.observationMs, pollMs: data.spec.pollMs, timeoutMs: data.spec.timeoutMs, receipts: ledger});
    const state = ledger.gateState();
    if (capture.completed === true && !gateLive(state)) invalidateForGateStop(capture, 'compose return boundary', state);
    if (capture.completed !== true) reason(`capture: ${capture.reasons[0] ?? 'not completed'}`);
  } catch (error) {
    reason(message(error));
  }
  // The original stop identity (kind and reason) is reported as recorded by the gate, never replaced.
  if (guard.isStopped()) { const s = guard.status(); reason(`gate stopped (${s.kind}): ${s.reason}`); }
  if (!capture?.completed) stop(`R2 compose: ${reasons[0] ?? 'capture incomplete'}`);

  // ---- §7.3 teardown: each step runs even if an earlier one failed; the order is recorded. ----
  const attempt = async (label, fn) => { order.push(label); try { return await fn(); } catch (error) { teardownErrors.push(`${label}: ${message(error)}`); return undefined; } };
  await attempt('disarm', () => guard.disarm());
  const quiet = await attempt('quiesce', () => bounded('quiesce', () => guard.quiesce(QUIESCE_MS)));
  if (quiet?.quiet !== true) await attempt('stop', () => stop('R2 compose teardown has live sends', 'timeout'));
  if (source) {
    await attempt('final page read', async () => {
      source.markFinal();
      finalAck = await bounded('final acknowledgement', () => ack.final());
      writer.append('acks', {phase: 'final', errors: [...finalAck]});
      if (finalAck.length) throw Error(finalAck.join('; '));
      if (source.pending()) throw Error(`pending Shift at seq ${source.pending().seq} at the final read`);
    });
    await attempt('page reads flush', () => source.flush());
  }
  if (capture?.completed === true) {
    await attempt('gate check', () => {
      const state = ledger.gateState();
      if (!gateLive(state)) { invalidateForGateStop(capture, 'compose final read', state); throw Error('gate not live after the final read'); }
    });
  }
  if (capture) await attempt('axe post', async () => writer.append('axe', {phase: 'post', result: await bounded('axe post', () => page.axe())}));
  if (capture) await attempt('screenshot post', async () => writer.put('visual/post.png', await bounded('screenshot post', () => page.screenshot())));
  if (observerOpened) await attempt('speech lane', async () => writer.append('speech', speechLaneRecord(await bounded('observer final read', () => observer.read()))));
  await attempt('observer close', () => bounded('observer close', () => observer.close()));
  await attempt('foreground close', () => bounded('foreground close', () => foreground.close()));
  if (quiet?.quiet === true) await attempt('page close', () => bounded('page close', () => page.close()));
  if (nvdaStarted) await attempt('NVDA stop', () => bounded('NVDA stop', () => nvda.stop()));
  if (ledger) await attempt('receipts lane', () => writer.append('receipts', ledger.read()));
  if (capture) await attempt('capture.json', () => writer.put('capture.json', JSON.stringify(capture)));
  const pending = [...active].sort();
  for (const r of [...reasons, ...teardownErrors]) await attempt('refusal record', () => event({phase: 'refusal', reason: r}));
  if (pending.length) await attempt('refusal record', () => event({phase: 'refusal', reason: `operations pending at teardown: ${pending.join(', ')}`}));
  const incomplete = [...reasons, ...teardownErrors, ...(pending.length ? [`operations pending at teardown: ${pending.join(', ')}`] : []),
    ...(quiet?.quiet === true ? [] : ['LIVE_AT_TEARDOWN'])];
  const evidence = {sealed: false, manifest_sha256: null, verified: false, verdict: null, errors: []};
  await attempt('seal', async () => {
    const capped = incomplete.slice(0, REASONS).map(r => r.length > REASON_CAP ? `${r.slice(0, REASON_CAP - 12)} [truncated]` : r);
    const sealed = await writer.seal({incomplete: capped});
    Object.assign(evidence, {sealed: true, manifest_sha256: sealed.manifest_sha256, verified: sealed.verification.ok === true,
      verdict: sealed.verification.class, errors: [...sealed.verification.errors]});
  });
  if (!evidence.sealed) evidence.errors.push(...teardownErrors.filter(e => e.startsWith('seal:')));

  const done = capture?.completed === true && !reasons.length && !teardownErrors.length && !pending.length && quiet?.quiet === true &&
    !guard.isStopped() && evidence.sealed && evidence.verified && evidence.verdict === 'synthetic';
  // Fail closed: a page that is not complete never hands its gate back live (an earlier stop keeps its identity).
  if (!done) stop(`R2 compose incomplete: ${[...reasons, ...teardownErrors][0] ?? 'evidence not sealed and verified'}`, 'protocol');
  const status = guard.status();
  const result = {
    schema: COMPOSE_SCHEMA, fixture_id: data.fixture_id, session: data.session,
    completed: false, outcome: 'INSUFFICIENT_EVIDENCE', reasons: [...reasons],
    step_map: structuredClone(plan.step_map),
    actions: (capture?.records ?? []).map(r => ({action: r.step, press: r.press, capture_status: r.capture_status, ack_seq: r.ack_seq, raw_seq: [...r.raw_seq],
      execution: {...r.execution}})),
    capture: capture ? {completed: capture.completed, outcome: capture.outcome, reasons: [...capture.reasons], gate_stop: capture.gate_stop ?? null} : null,
    gate: {stopped: status.stopped, kind: status.kind, reason: status.reason, sends: status.sends, misdelivered: status.misdelivered, refused: status.refused},
    final: {ack_errors: finalAck === null ? null : [...finalAck], pending_shift: source?.pending() ?? null, shift_prefix: source ? source.prefixes() : []},
    teardown: {order: [...order], quiescence: quiet?.quiet === true ? 'QUIET_AT_TEARDOWN' : 'LIVE_AT_TEARDOWN', physical_quiescence_verified: false, errors: [...teardownErrors]},
    pending_operations: pending, guarded_execution_verified: false, evidence,
  };
  result.completed = done && !status.stopped;
  if (result.completed) result.outcome = 'COMPLETE';
  // A value from an injected handle can still make the result non-JSON after completion was decided. Fail closed:
  // stop the gate (an earlier stop keeps its identity) and return nothing.
  try {
    jsonOnly(result);
    return structuredClone(result);
  } catch (error) {
    const why = `R2 compose result refused: ${message(error)}`;
    stop(why, 'protocol');
    throw Error(why);
  }
}
