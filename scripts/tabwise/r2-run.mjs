// R2-L2 S6: capability-free helpers for the default-blocked entry (scripts/tabwise-r2.mjs; design §1.2, §1.5, §2.2, §9).
// Strict CLI, the run-plan schema (tabwise-r2-plan/1), fixture loading bound to the approved plan, the ordered gate
// sequence up to (not including) any runtime import, the run directory, the child environment allowlist, the page
// child command and the sequential run coordinator over an injected launcher. Nothing here imports the qualification
// loader, the session, the composition seam, a browser, a socket or child_process: the entry injects git and the
// launcher, and is the only module that can load a runtime (and only in --page mode, after these gates).
import {readFileSync, lstatSync, realpathSync} from 'node:fs';
import {basename, dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {pageHash} from '../../src/r2/contract.mjs';
import {checkR2Approval, r2Digest} from './r2-policy.mjs';
import {buildR2StepMap, planR2EvidenceCaps} from './r2-evidence.mjs';
import {createPageCustody, processBaseline, wallMicros} from './r2-proctree.mjs';

export const PLAN_SCHEMA = 'tabwise-r2-plan/1';
export const PAGE_EXIT_SCHEMA = 'tabwise-r2-page-exit/1';
// One --page child is bounded by its own deadline; the coordinator allows a margin for bounded teardown and exit.
export const PAGE_DEADLINE_MS = 600_000;
export const CHILD_TIMEOUT_MS = PAGE_DEADLINE_MS + 120_000;
export const KILL_GRACE_MS = 10_000;
export const MAX_CHILD_OUTPUT = 65_536;
// R-1/R-2 custody: tree sample interval while a child runs, and the census bound before a kill.
export const CUSTODY_SAMPLE_MS = 5_000;
export const CENSUS_MS = 5_000;
// Coordinator status recorded as the page exit code when the child's own code is not the verdict.
export const EXIT = Object.freeze({timeout: 124, refused: 125, spawn: 126, unconfirmed: 127, signal: 128, residue: 129, cancelled: 130});

const PAGE_ID = /^[a-z][a-z0-9-]{0,63}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const FIXTURE_PATH = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/;
const PLAN_KEYS = ['focusWaitMs', 'handleTimeoutMs', 'pages', 'schema', 'spec', 'split'];
const PAGE_KEYS = ['fixture', 'fixture_sha256', 'id', 'task'];
const SPEC_KEYS = ['ackMs', 'observationMs', 'pollMs', 'timeoutMs'];
const EXIT_KEYS = ['completed', 'manifest_sha256', 'nvda', 'page', 'reasons', 'schema'];
const NVDA_STATES = ['stopped', 'not-started', 'unconfirmed'];
const MAX_PLAN = 1_000_000, MAX_FIXTURE = 100_000, MAX_PAGES = 64, REASONS = 64, REASON_CAP = 512;
// Child environment: exact names (case-insensitive, as Windows treats them) plus three prefixes. Never NODE_*, R1T_*,
// the qualification or observer opt-ins, or anything that looks like a credential.
const CHILD_NAMES = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE',
  'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432', 'COMMONPROGRAMFILES',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS', 'USERNAME', 'LANG', 'CI', 'PLAYWRIGHT_BROWSERS_PATH']);
const CHILD_PREFIXES = ['GITHUB_', 'RUNNER_', 'TABWISE_R2_'];
const CREDENTIAL = /TOKEN|SECRET|PASSWORD|CREDENTIAL|_KEY$/;

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const sameKeys = (value, keys) => JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys);
const int = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const message = error => error?.message ?? String(error);
const usage = detail => { throw Error(`R2 usage: ${detail}`); };
const planFail = detail => { throw Error(`R2 plan: ${detail}`); };
const block = detail => { throw Error(`BLOCK: ${detail}`); };

// JSON.parse remains the grammar oracle; scan valid tokens iteratively to reject duplicate decoded names.
// Both callers bound their document before parsing. No recursive descent or regexp string parsing.
function parseUniqueJson(text) {
  const parsed = JSON.parse(text), stack = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') stack.push(new Set());
    else if (c === '[') stack.push(null);
    else if (c === '}' || c === ']') stack.pop();
    else if (c === '"') {
      const start = i++;
      while (text[i] !== '"') { if (text[i] === '\\') i++; i++; }
      let next = i + 1;
      while (' \t\r\n'.includes(text[next]) && next < text.length) next++;
      if (text[next] === ':') {
        const name = JSON.parse(text.slice(start, i + 1)), names = stack.at(-1);
        if (names.has(name)) throw Error('duplicate JSON object member');
        names.add(name);
      }
    }
  }
  return parsed;
}

/** Exactly one mode (--check-only | --page <id> | --run) and exactly one --plan <path>; no other token. */
export function parseR2Args(argv) {
  if (!Array.isArray(argv) || argv.length > 5) usage('expected --check-only|--page <id>|--run and --plan <path>');
  let mode = null, page = null, plan = null;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--check-only' || token === '--run' || token === '--page') {
      if (mode !== null) usage('exactly one mode');
      mode = token.slice(2);
      if (token === '--page') {
        page = argv[++i];
        if (typeof page !== 'string' || !PAGE_ID.test(page)) usage('--page needs a plan page id');
      }
    } else if (token === '--plan') {
      if (plan !== null) usage('--plan given twice');
      plan = argv[++i];
      if (typeof plan !== 'string' || !plan || plan.startsWith('--') || plan.includes('\0') || plan.length > 4096) usage('--plan needs a file path');
    } else usage(`unexpected argument ${JSON.stringify(String(token)).slice(0, 80)}`);
  }
  if (mode === null) usage('a mode is required');
  if (plan === null) usage('--plan is required');
  return {mode, page, plan};
}

/** tabwise-r2-plan/1 from the approved bytes. Exact keys at every level; every page's step map and evidence caps are planned now. */
export function parseR2Plan(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_PLAN) planFail(`must be 1..${MAX_PLAN} bytes`);
  let plan;
  try { plan = parseUniqueJson(Buffer.from(bytes).toString('utf8')); } catch (error) { planFail(`not JSON: ${message(error)}`); }
  if (!object(plan) || !sameKeys(plan, PLAN_KEYS)) planFail(`must be exactly {${PLAN_KEYS.join(', ')}}`);
  if (plan.schema !== PLAN_SCHEMA) planFail('schema');
  if (!['development', 'withheld'].includes(plan.split)) planFail('split must be development or withheld');
  if (!object(plan.spec) || !sameKeys(plan.spec, SPEC_KEYS)) planFail(`spec must be exactly {${SPEC_KEYS.join(', ')}}`);
  for (const k of ['handleTimeoutMs', 'focusWaitMs']) if (!int(plan[k], 1, 60000)) planFail(`${k} must be 1..60000`);
  if (!Array.isArray(plan.pages) || !plan.pages.length || plan.pages.length > MAX_PAGES) planFail(`pages must list 1..${MAX_PAGES} pages`);
  const pages = plan.pages.map((page, i) => {
    if (!object(page) || !sameKeys(page, PAGE_KEYS)) planFail(`page ${i + 1} must be exactly {${PAGE_KEYS.join(', ')}}`);
    if (!PAGE_ID.test(page.id ?? '')) planFail(`page ${i + 1} id`);
    if (typeof page.fixture !== 'string' || page.fixture.length > 256 || !FIXTURE_PATH.test(page.fixture) || page.fixture.split('/').some(s => s === '.' || s === '..'))
      planFail(`page ${page.id} fixture must be a relative path inside the plan directory`);
    if (!SHA256.test(page.fixture_sha256 ?? '')) planFail(`page ${page.id} fixture_sha256`);
    if (!Array.isArray(page.task) || page.task.some(t => !object(t) || !sameKeys(t, ['press', 'step']))) planFail(`page ${page.id} task entries must be exactly {step, press}`);
    try { buildR2StepMap(page.task); planR2EvidenceCaps({...plan.spec, actions: page.task.length}); } catch (error) { planFail(`page ${page.id}: ${message(error)}`); }
    return Object.freeze({id: page.id, fixture: page.fixture, fixture_sha256: page.fixture_sha256, task: Object.freeze(page.task.map(t => Object.freeze({step: t.step, press: t.press})))});
  });
  if (new Set(pages.map(p => p.id)).size !== pages.length) planFail('duplicate page id');
  return Object.freeze({schema: plan.schema, split: plan.split, spec: Object.freeze({...plan.spec}), handleTimeoutMs: plan.handleTimeoutMs,
    focusWaitMs: plan.focusWaitMs, pages: Object.freeze(pages)});
}

/** Fixture bytes for one plan page: a regular file whose real path is inside the plan's real directory, hash-bound (CRLF→LF). */
export function loadR2Fixture(planPath, page) {
  try {
    const base = realpathSync(dirname(resolve(planPath))), path = join(base, ...page.fixture.split('/'));
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FIXTURE) throw Error(`not a regular file of at most ${MAX_FIXTURE} bytes`);
    const real = realpathSync(path);
    if (!real.startsWith(base + sep)) throw Error('resolves outside the plan directory');
    const bytes = readFileSync(real);
    if (bytes.length > MAX_FIXTURE) throw Error('grew past the document cap');
    if (pageHash(bytes) !== page.fixture_sha256) throw Error('hash differs from the approved plan');
    return bytes;
  } catch (error) { return planFail(`fixture ${page.id}${/^hash /.test(message(error)) ? ' ' : ': '}${message(error)}`); }
}

function hookErrors(env, execArgv) {
  const names = Object.keys(env).map(k => k.toUpperCase());
  const found = names.filter(k => ['NODE_OPTIONS', 'NODE_PATH', 'NODE_TEST_CONTEXT'].includes(k) || k.startsWith('R1T_'));
  if (!Array.isArray(execArgv) || execArgv.length) found.push('execArgv');
  return found;
}

/**
 * The ordered S6 gates, before any runtime import: (1) strict arguments, (2) exact TABWISE_R2_ENABLED opt-in and no
 * inherited loader hooks, (3) R2 status, the approved plan bytes and checkR2Approval, (4) clean checkout at the approved
 * revision, (5) frozen R1 integrity and the R2 reviewed digest, then the selected fixtures. git and frozen are injected
 * by the entry (real git, checkFrozenIntegrity). Throws on the first failed gate; returns a frozen record otherwise.
 */
export function checkR2Entry({argv, env, execArgv, root, platform, git, frozen, readStatus}) {
  const args = parseR2Args(argv);
  if (!env || env.TABWISE_R2_ENABLED !== 'true') block('R2 disabled by default (TABWISE_R2_ENABLED is not exactly "true")');
  const hooks = hookErrors(env, execArgv);
  if (hooks.length) block(`inherited runtime hooks refused (${hooks.join(', ')})`);
  const status = readStatus();
  if (status?.enabled !== true || status?.verdict !== 'PASS') block('R2 status is disabled/BLOCK');
  const planPath = resolve(args.plan);
  let planBytes;
  try {
    const stat = lstatSync(planPath);
    if (!stat.isFile() || stat.size > MAX_PLAN) throw Error('not a regular file within the plan cap');
    planBytes = readFileSync(planPath);
  } catch (error) { block(`run plan unreadable: ${message(error)}`); }
  const plan = parseR2Plan(planBytes);
  if (args.page !== null && !plan.pages.some(p => p.id === args.page)) block(`page ${args.page} is not in the approved plan`);
  const head = git('rev-parse', 'HEAD');
  const approval = checkR2Approval({env, head, status, plan: planBytes, root, platform});
  if (!approval.ok) block(approval.errors.join('; '));
  if (git('status', '--porcelain', '--untracked-files=all') !== '') block('checkout is not clean');
  const integrity = frozen(root);
  if (integrity?.ok !== true) block((integrity?.errors ?? ['frozen integrity unavailable']).join('; '));
  if (r2Digest(root) !== status.reviewed_sha256) block('R2 content changed after approval');
  const pages = args.page === null ? plan.pages : plan.pages.filter(p => p.id === args.page);
  const fixtures = new Map(pages.map(p => [p.id, loadR2Fixture(planPath, p)]));
  return Object.freeze({mode: args.mode, page: args.page, planPath, planBytes, plan, pages, fixtures, head, status});
}

/** RUNNER_TEMP/tabwise-r2/<run>-1, required to be outside the checkout (an evidence write must never dirty it). */
export function r2RunDir(env, root) {
  const temp = env?.RUNNER_TEMP, id = env?.GITHUB_RUN_ID;
  if (typeof temp !== 'string' || !isAbsolute(temp)) block('R2 run directory needs an absolute RUNNER_TEMP');
  if (!/^[1-9][0-9]{0,19}$/.test(id ?? '') || env.GITHUB_RUN_ATTEMPT !== '1') block('R2 run directory needs a single initial hosted attempt');
  const dir = join(temp, 'tabwise-r2', `${id}-1`);
  const inside = (base, target) => {
    const fold = p => process.platform === 'win32' ? p.toLowerCase() : p;
    const rel = relative(fold(base), fold(target));
    return !rel || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel));
  };
  // Resolve the nearest existing ancestor, refusing dangling aliases, files, and inaccessible ancestry.
  const ancestry = path => {
    let current = resolve(path); const suffix = [];
    for (;;) {
      let stat;
      try { stat = lstatSync(current); }
      catch (error) {
        if (error.code !== 'ENOENT' || dirname(current) === current) throw error;
        const name = basename(current);
        if (process.platform === 'win32' && /[. :]/.test(name.slice(-1))) throw Error('ambiguous Windows path component');
        suffix.unshift(name); current = dirname(current); continue;
      }
      const real = realpathSync.native(current);
      if (!(stat.isDirectory() || stat.isSymbolicLink()) || !lstatSync(real).isDirectory()) throw Error('ancestor is not a directory');
      return join(real, ...suffix);
    }
  };
  try {
    const checkout = realpathSync.native(resolve(root));
    if (!lstatSync(checkout).isDirectory()) throw Error('checkout is not a directory');
    if (inside(resolve(root), dir) || inside(checkout, ancestry(dir))) throw Error('inside the checkout');
  } catch (error) { block(`R2 run directory ancestry refused: ${message(error)}`); }
  return dir;
}

/** Allowlisted child environment (null prototype). */
export function r2ChildEnv(env) {
  const out = Object.create(null);
  for (const [name, value] of Object.entries(env ?? {})) {
    const upper = name.toUpperCase();
    if (typeof value !== 'string' || CREDENTIAL.test(upper)) continue;
    if (CHILD_NAMES.has(upper) || CHILD_PREFIXES.some(p => upper.startsWith(p))) out[name] = value;
  }
  return out;
}

/** One --page child: argument vector, no shell, no inherited execArgv. */
export function r2PageCommand({entry, page, planPath, env, cwd}) {
  if (typeof page !== 'string' || !PAGE_ID.test(page)) usage('page child needs a plan page id');
  return {file: process.execPath, args: [entry, '--page', page, '--plan', planPath],
    options: {cwd, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']}};
}

/** The session data for one plan page; the session generates the nonce and session id itself. */
export function r2SessionData(plan, page, fixture, evidenceDir) {
  return {fixture_id: page.id, fixture, approved: {fixture_sha256: page.fixture_sha256, task: page.task.map(t => ({step: t.step, press: t.press}))},
    spec: {actions: page.task.length, ...plan.spec}, evidenceDir, handleTimeoutMs: plan.handleTimeoutMs, focusWaitMs: plan.focusWaitMs};
}

/** The one stdout line a --page child prints. Reasons are capped; nothing else (no class or provenance) is carried. */
export function r2PageExit({page, completed, nvda, manifest_sha256, reasons}) {
  const capped = reasons.slice(0, REASONS).map(r => String(r).length > REASON_CAP ? `${String(r).slice(0, REASON_CAP - 12)} [truncated]` : String(r));
  return {schema: PAGE_EXIT_SCHEMA, page, completed: completed === true, nvda: NVDA_STATES.includes(nvda) ? nvda : 'unconfirmed',
    manifest_sha256: SHA256.test(manifest_sha256 ?? '') ? manifest_sha256 : null, reasons: capped};
}

/** Accepts a child's stdout only if it is exactly one complete, successful page-exit line for the expected page. */
export function parseR2PageExit(text, page) {
  if (typeof text !== 'string' || !text.endsWith('\n') || text.slice(0, -1).includes('\n')) throw Error('expected exactly one result line');
  let result;
  if (Buffer.byteLength(text) > MAX_CHILD_OUTPUT) throw Error('result exceeds stdout cap');
  try { result = parseUniqueJson(text.slice(0, -1)); } catch (error) { throw Error(`result is not JSON: ${message(error)}`); }
  if (!object(result) || !sameKeys(result, EXIT_KEYS) || result.schema !== PAGE_EXIT_SCHEMA) throw Error('result schema or fields');
  if (result.page !== page) throw Error('result names another page');
  if (!Array.isArray(result.reasons) || result.reasons.length > REASONS || result.reasons.some(r => typeof r !== 'string' || r.length > REASON_CAP)) throw Error('result reasons');
  if (result.completed !== true || result.reasons.length) throw Error('page did not complete');
  if (result.nvda !== 'stopped') throw Error(`NVDA termination not reported (${String(result.nvda)})`);
  if (!SHA256.test(result.manifest_sha256 ?? '')) throw Error('sealed manifest digest missing');
  return result;
}

/**
 * Sequential coordinator. launch(page) returns a child ({pid, stdout, stderr, on('error'|'close'), kill}); the next page
 * is launched only after the previous child emitted 'close' and its result was accepted. Stops at the first page that
 * is not accepted. A child that does not close within killGraceMs after a kill is reported exit-unconfirmed.
 *
 * processes (R-1/R-2; the entry always supplies the Windows tools): before each launch the OS must show no NVDA image or
 * relay listener; the child's tree is sampled while it runs and censused before any kill; after every ending (accepted,
 * failed, timeout, overflow, spawn error, cancel) the tree is reaped and confirmed gone by a later OS snapshot. An
 * unconfirmed reap is exit-unconfirmed (never sealed); a confirmed reap that found live descendants or any NVDA turns an
 * accepted page into process-residue. The child's own nvda:'stopped' never substitutes for this. signal: an AbortSignal
 * that cancels the running child the same way and launches nothing more.
 */
export async function runR2Pages({pages, launch, timeoutMs = CHILD_TIMEOUT_MS, killGraceMs = KILL_GRACE_MS, maxOutputBytes = MAX_CHILD_OUTPUT, onStderr = null,
  processes = null, signal = null, protect = [], sampleMs = CUSTODY_SAMPLE_MS, censusMs = CENSUS_MS, wallClock = Date.now}) {
  if (!Array.isArray(pages) || !pages.length || pages.length > MAX_PAGES || pages.some(p => !PAGE_ID.test(p ?? '')) || new Set(pages).size !== pages.length) throw Error('R2 run: invalid page order');
  if (typeof launch !== 'function') throw Error('R2 run: launcher missing');
  for (const v of [timeoutMs, killGraceMs, maxOutputBytes, sampleMs, censusMs]) if (!int(v, 1, 3_600_000)) throw Error('R2 run: invalid bound');
  if (processes !== null && (typeof processes?.snapshot !== 'function' || typeof processes?.terminate !== 'function')) throw Error('R2 run: process tools need snapshot and terminate');
  if (signal !== null && (typeof signal?.aborted !== 'boolean' || typeof signal?.addEventListener !== 'function')) throw Error('R2 run: signal must be an AbortSignal');
  if (!Array.isArray(protect) || typeof wallClock !== 'function') throw Error('R2 run: invalid custody options');
  const results = [];
  for (const id of pages) {
    if (processes) {
      const baseline = await processBaseline(processes);
      if (!baseline.quiescent) {
        results.push({id, exit_code: EXIT.residue, outcome: 'not-quiescent', reason: `not launched: ${baseline.errors.join('; ')}`, custody: baseline});
        return {pages: results, stopped_after: id};
      }
    }
    // Checked after the baseline, so a cancel that arrives while it runs still launches nothing.
    if (signal?.aborted) {
      results.push({id, exit_code: EXIT.cancelled, outcome: 'cancelled', reason: 'run cancelled before launch'});
      return {pages: results, stopped_after: id};
    }
    const result = await runPageChild(id, {launch, timeoutMs, killGraceMs, maxOutputBytes, onStderr, processes, signal, protect, sampleMs, censusMs, wallClock});
    results.push(result);
    if (result.exit_code !== 0) return {pages: results, stopped_after: id};
  }
  return {pages: results, stopped_after: null};
}

/** False when a child's exit was never confirmed: its directory may still change, so the run must not be sealed. */
export function r2RunSealable(outcome) {
  return Array.isArray(outcome?.pages) && outcome.pages.every(p => p?.outcome !== 'exit-unconfirmed');
}

// The reap verdict over a settled child result: unconfirmed termination is never sealable; residue refuses an accepted page.
function withCustody(value, custody) {
  if (!custody.confirmed) {
    return {...value, exit_code: EXIT.unconfirmed, outcome: 'exit-unconfirmed', custody,
      reason: `process tree termination unconfirmed (${custody.errors[0] ?? 'no confirming snapshot'}); was ${value.outcome}: ${value.reason ?? 'no reason'}`};
  }
  if (value.exit_code === 0 && (custody.residue.length || !custody.quiescent)) {
    const why = custody.residue.length ? `${custody.residue.length} live process(es) in the page tree after exit` : custody.errors[0];
    return {...value, exit_code: EXIT.residue, outcome: 'process-residue', reason: `not quiescent after page exit: ${why}`, custody};
  }
  return {...value, custody};
}

function runPageChild(id, {launch, timeoutMs, killGraceMs, maxOutputBytes, onStderr, processes = null, signal: abortSignal = null, protect = [], sampleMs, censusMs, wallClock = Date.now}) {
  let child, custody = null;
  const spawnedAfter = wallMicros(wallClock);
  try { child = launch(id); } catch (error) { return Promise.resolve({id, exit_code: EXIT.spawn, outcome: 'spawn-error', reason: message(error)}); }
  if (processes) {
    try { custody = createPageCustody({tools: processes, pid: Number.isSafeInteger(child?.pid) ? child.pid : null, spawnedAfter, protect, wallClock}); }
    catch (error) { custody = {sample: () => Promise.resolve(), exited: () => {}, reap: () => Promise.resolve({confirmed: false, errors: [`custody: ${message(error)}`]})}; }
  }
  return new Promise(done => {
    const chunks = [];
    let bytes = 0, overflow = false, spawnError = null, timedOut = false, cancelled = false, settled = false, grace = null, census = null;
    const sampler = custody ? setInterval(() => { custody.sample(); }, sampleMs) : null;
    custody?.sample();
    const settle = value => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(grace); clearInterval(sampler); abortSignal?.removeEventListener('abort', onAbort);
      if (!custody) return done(value);
      custody.reap().then(evidence => done(withCustody(value, evidence)));
    };
    const signalKill = () => {
      try { child.kill('SIGKILL'); } catch { /* exit is confirmed only by 'close' */ }
      grace ??= setTimeout(() => settle({id, exit_code: EXIT.unconfirmed, outcome: 'exit-unconfirmed', reason: 'child did not close after kill'}), killGraceMs);
    };
    // With custody, the tree is censused (bounded) before the first kill so descendants are known while their links exist.
    const kill = () => {
      if (!custody) return signalKill();
      census ??= Promise.race([custody.sample(), new Promise(ok => setTimeout(ok, censusMs))]);
      census.then(signalKill);
    };
    const onAbort = () => { if (!settled) { cancelled = true; kill(); } };
    abortSignal?.addEventListener('abort', onAbort, {once: true});
    if (abortSignal?.aborted) onAbort();
    const timer = setTimeout(() => { if (!settled) { timedOut = true; kill(); } }, timeoutMs);
    child.stdout?.on('data', data => {
      if (settled || overflow) return;
      bytes += data.length;
      if (bytes > maxOutputBytes) { overflow = true; kill(); return; }
      chunks.push(Buffer.from(data));
    });
    child.stderr?.on('data', data => { if (!settled && onStderr) try { onStderr(id, data); } catch { /* diagnostics only */ } });
    child.on('error', error => { if (settled) return; spawnError ??= message(error); kill(); });
    // Registered before 'close' handling: after the exit is observed the child's pid may be reused (see createPageCustody).
    if (custody) child.on('exit', () => custody.exited());
    child.on('close', (code, signal) => {
      custody?.exited();
      if (settled) return;
      if (spawnError !== null) return settle({id, exit_code: EXIT.spawn, outcome: 'spawn-error', reason: spawnError});
      if (cancelled) return settle({id, exit_code: EXIT.cancelled, outcome: 'cancelled', reason: 'run cancelled; child killed'});
      if (timedOut) return settle({id, exit_code: EXIT.timeout, outcome: 'timeout', reason: `no exit within ${timeoutMs} ms`});
      if (overflow) return settle({id, exit_code: EXIT.refused, outcome: 'result-refused', reason: `output over ${maxOutputBytes} bytes`});
      if (code !== 0) return settle({id, exit_code: Number.isSafeInteger(code) ? code : EXIT.signal, outcome: 'failed', reason: `exit ${code} signal ${signal}`});
      try { parseR2PageExit(Buffer.concat(chunks).toString('utf8'), id); } catch (error) {
        return settle({id, exit_code: EXIT.refused, outcome: 'result-refused', reason: message(error)});
      }
      settle({id, exit_code: 0, outcome: 'accepted', reason: null});
    });
  });
}
