// F-02 (R1) offline tests: validator, runner core with fake NVDA, browser and foreground probe, SIGINT path,
// server, lock, D-36 safety (A4 foreground guard, cleanup, evidence, run guard, workflow).
// No real NVDA, browser, window or network beyond 127.0.0.1. Evidence goes only to os.tmpdir() (I-01).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, existsSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { basename, dirname, join, relative, resolve } from 'node:path';
import {
  RECORD_FIELDS, recordErrors, isChecked, isNotChecked, typedText, stepFailures,
  settingsMismatch, judgeAttempt, judgeRun,
} from '../src/speech/validate.mjs';
import {
  withTimeout, runAttempt, runR1, installTeardown, serveDir, evidenceWriter, specText, lockMismatches, buildSummary,
  writeSummary, scrubLog,
} from '../src/speech/capture.mjs';
import { foregroundMismatch, foregroundProbe } from '../src/speech/foreground.mjs';
import { ciGuardErrors, repoSnapshot, repoChanges, workflowGuardErrors } from '../src/speech/runguard.mjs';
import { sendGate, VK } from '../src/speech/sendguard.mjs';

const CFG = JSON.parse(readFileSync(new URL('../fixtures/r1/steps.json', import.meta.url), 'utf8'));
const FAST = { ...CFG, action_timeout_ms: 200, cleanup_timeout_ms: 200, focus_wait_ms: 50, focus_poll_ms: 1 };
const RUN = 'r1-test';
const PID = 4242;

// What a healthy page sounds like, one phrase per key action, in order.
const HEALTHY = [
  'Full name, edit, blank',
  'A', 'd', 'a',
  'Email, edit, blank',
  ...'ada@example.test'.split('').map((c) => (c === '@' ? 'at' : c === '.' ? 'dot' : c)),
  'I agree to the terms, check box, not checked',
  'checked',
  'Review, button',
  'Confirm subscription, dialog. Confirm, button',
  'Review, button. Subscription saved',
  'I agree to the terms, check box, checked',
];

function actionsOf(cfg) {
  return cfg.steps.map((s) => (s.press ? [s.press] : [...s.type]));
}

function healthyRecords(attempt = 1, phrases = HEALTHY) {
  const out = [];
  let i = 0;
  for (const [n, keys] of actionsOf(CFG).entries()) {
    out.push({
      run_id: RUN, attempt, step: n + 1, keys, phrases: keys.map(() => phrases[i++]),
      silence_ms: 1000, timed_out: false, error: null, ts: '2026-10-27T07:00:00Z',
    });
  }
  return out;
}

function healthyAttempt(attempt, nonce, over = {}) {
  return {
    attempt, nonce, status: 'completed', new_process: true,
    settings: { 'keyboard.speakTypedCharacters': 1, 'keyboard.speakTypedWords': 0 },
    title_phrase: `R1 sign-up ${nonce} - Chromium`, focus_tries: 1, error: null,
    records: healthyRecords(attempt), raw: [...HEALTHY], ...over,
  };
}

// Fake Guidepup NVDA: scripted phrases per action; `hangAt` = action index that never resolves.
function fakeNvda({ phrases = HEALTHY, titles = (n) => `R1 sign-up ${n} - Chromium`, settings, hangAt = -1, stopHangs = false, onHang } = {}) {
  const calls = [];
  let log = [];
  let running = false;
  let session = {};
  let action = 0;
  let titleTries = 0;
  let nonce = '';
  const speak = (p) => { log.push(p); };
  const act = async (name, key) => {
    calls.push([name, key]);
    if (action === hangAt) { action++; onHang?.(); return new Promise(() => {}); }
    speak(phrases[action++] ?? '');
  };
  return {
    calls,
    setNonce(n) { nonce = n; },
    nonce: () => nonce,
    keyboardCommands: { reportTitle: { representation: 'NVDA-T' } },
    async start(opts) {
      calls.push(['start', opts]);
      running = true;
      action = 0; titleTries = 0;
      session = settings ?? { keyboard: { ...opts?.settings?.keyboard } };
      const pid = 60000 + calls.filter(([c]) => c === 'start').length;
      return { pid, relay_pid: pid, reset_confirmed: true };
    },
    async stop() {
      calls.push(['stop']);
      if (!running) throw new Error('NVDA is not running');
      if (stopHangs) return new Promise(() => {});
      running = false;
    },
    // Same shape as Guidepup's getSettings(): parseIni nests sections, so {keyboard: {...}}.
    getSettings() { return structuredClone(session); },
    getSetting(key) { return structuredClone(session)[key]; }, // Guidepup's flat lookup: dotted keys are undefined
    async perform(cmd) {
      calls.push(['perform', cmd.representation]);
      speak(titles(nonce, titleTries++));
    },
    async press(key) { return act('press', key); },
    async type(ch) { return act('type', ch); },
    async lastSpokenPhrase() { return log.at(-1) ?? ''; },
    async spokenPhraseLog() { return log; },
    async clearSpokenPhraseLog() { calls.push(['clear']); log = []; },
  };
}

// Fake browser: one Chromium process (pid) per open; close/kill can be made to fail. D-39: keys(from) is the
// page's keydown log after seq `from` (r1.mjs: an addInitScript listener read with page.evaluate); the gated
// fake NVDA below writes it. close and kill are also logged in nvda.calls, so tests can order them.
function fakeBrowser(nvda, { closeFails = false } = {}) {
  const calls = [];
  return {
    calls,
    async open(url) {
      calls.push(['open', url]);
      nvda.setNonce(new URL(url).searchParams.get('nonce'));
      if (nvda.keylog) nvda.keylog.length = 0;
      return {
        pid: PID,
        keys: async (from) => (nvda.keylog ?? []).filter((e) => e.seq > from),
        close: async () => { calls.push(['close']); nvda.calls.push(['page', 'close']); if (closeFails) throw new Error('close failed'); },
        kill: async () => { calls.push(['kill']); nvda.calls.push(['page', 'kill']); },
      };
    },
  };
}

// Fake foreground probe (A4). Logs into nvda.calls so tests can see what preceded each key.
// front(i, nonce) -> {pid, title} for the i-th check; default: our Chromium with this nonce.
function fakeFg(nvda, front = (i, n) => ({ pid: PID, title: `R1 sign-up ${n} - Chromium` })) {
  let i = 0;
  return {
    async check() {
      const v = front(i++, nvda.nonce());
      nvda.calls.push(['fg', v.pid === PID && v.title.includes(nvda.nonce())]);
      return v;
    },
  };
}

const KEYS = new Set(['press', 'type', 'perform']);
const keyCalls = (calls) => calls.filter(([c]) => KEYS.has(c));

// Test evidence lives only in os.tmpdir() under r1-test-*; only those folders are removed afterwards (I-01).
const made = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'r1-test-')); made.push(d); return d; };
// M-08: fileURLToPath (URL.pathname stays percent-encoded, so "Meta AI" became "Meta%20AI"), whether the root
// exists, and file contents rather than size and mtime.
const EVIDENCE = fileURLToPath(new URL('../docs/evidence/', import.meta.url));
const listing = (root) => {
  if (!existsSync(root)) return ['<root missing>'];
  const out = ['<root present>'];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      const s = statSync(p);
      out.push(`${relative(root, p)}|${s.isDirectory() ? 'd' : createHash('sha256').update(readFileSync(p)).digest('hex')}`);
      if (s.isDirectory()) walk(p);
    }
  };
  walk(root);
  return out.sort();
};
let evidenceBefore;
before(() => { evidenceBefore = listing(EVIDENCE); });
after(() => {
  const root = resolve(tmpdir());
  for (const d of made) {
    assert.equal(dirname(resolve(d)), root, `${d} is not directly in os.tmpdir()`);
    assert.match(basename(d), /^r1-test-/);
    rmSync(d, { recursive: true, force: true });
  }
  assert.deepEqual(listing(EVIDENCE), evidenceBefore, 'tests changed docs/evidence/');
});
const readJsonl = (p) => readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

// ---------- C2: checked / not checked ----------
test('checked predicate: "unchecked" and "not checked" never count as checked', () => {
  assert.equal(isChecked('I agree, check box, checked'), true);
  assert.equal(isChecked('CHECKED'), true);
  assert.equal(isChecked('I agree, check box, not checked'), false);
  assert.equal(isChecked('I agree, check box, unchecked'), false);
  assert.equal(isChecked('check box'), false);
  assert.equal(isChecked('checked. not checked'), false);
});

test('not-checked predicate: "checked" alone never counts as not checked', () => {
  assert.equal(isNotChecked('check box, not checked'), true);
  assert.equal(isNotChecked('check box, unchecked'), true);
  assert.equal(isNotChecked('check box, checked'), false);
  assert.equal(isNotChecked('check box'), false);
});

// ---------- A3: typing normalisation ----------
test('typed text: lowercase, letters and digits only, raw phrases untouched', () => {
  const phrases = ['A', 'd', 'a'];
  assert.equal(typedText(phrases), 'ada');
  assert.deepEqual(phrases, ['A', 'd', 'a']);
  assert.equal(typedText(['A. d. a']), 'ada');
  assert.equal(typedText(['a', 'd', 'a', 'at', 'e']), 'adaate');
  assert.equal(typedText(['', '']), '');
});

// ---------- payload rule ----------
test('record schema: exact fields; screenshot, dom or html fail', () => {
  const rec = healthyRecords()[0];
  assert.deepEqual(Object.keys(rec).sort(), [...RECORD_FIELDS].sort());
  assert.deepEqual(recordErrors(rec), []);
  for (const extra of ['screenshot', 'dom', 'html']) {
    assert.ok(recordErrors({ ...rec, [extra]: 'x' }).some((e) => e.includes(extra)), extra);
  }
  const { ts, ...missing } = rec;
  assert.ok(recordErrors(missing).some((e) => e.includes('ts')));
  assert.ok(recordErrors({ ...rec, phrases: 'Full name' }).length > 0);
  assert.ok(recordErrors({ ...rec, timed_out: 'no' }).length > 0);
  assert.ok(recordErrors(null).length > 0);
});

// ---------- per-step rules ----------
test('step rules: healthy records pass every step', () => {
  for (const [i, rec] of healthyRecords().entries()) assert.deepEqual(stepFailures(CFG.steps[i], rec), [], `step ${i + 1}`);
});

test('step rules: wrong checkbox states fail steps 5, 6 and 10', () => {
  const r = healthyRecords();
  assert.ok(stepFailures(CFG.steps[4], { ...r[4], phrases: ['I agree to the terms, check box, checked'] }).length);
  assert.ok(stepFailures(CFG.steps[5], { ...r[5], phrases: ['not checked'] }).length);
  assert.ok(stepFailures(CFG.steps[5], { ...r[5], phrases: ['unchecked'] }).length);
  assert.ok(stepFailures(CFG.steps[9], { ...r[9], phrases: ['I agree to the terms, check box, unchecked'] }).length);
  assert.ok(stepFailures(CFG.steps[9], { ...r[9], phrases: ['I agree to the terms, check box, not checked'] }).length);
});

test('step rules: step 1 with "Ada" already in the field fails', () => {
  const r = healthyRecords()[0];
  assert.ok(stepFailures(CFG.steps[0], { ...r, phrases: ['Full name, edit, Ada'] }).length);
});

test('step rules: typing steps need the echoed letters; one phrase per character', () => {
  const r = healthyRecords();
  assert.deepEqual(stepFailures(CFG.steps[1], { ...r[1], phrases: ['A', 'd', 'a'] }), []);
  assert.ok(stepFailures(CFG.steps[1], { ...r[1], phrases: ['', '', ''] }).length, 'silent typing');
  assert.ok(stepFailures(CFG.steps[1], { ...r[1], phrases: ['A', 'd'] }).length, 'missing action');
  assert.ok(stepFailures(CFG.steps[1], { ...r[1], keys: ['A', 'd', 'x'] }).length, 'wrong keys');
});

test('step rules: status message and focus return both needed on step 9', () => {
  const r = healthyRecords()[8];
  assert.ok(stepFailures(CFG.steps[8], { ...r, phrases: ['Review, button'] }).length);
  assert.ok(stepFailures(CFG.steps[8], { ...r, phrases: ['Subscription saved'] }).length);
});

test('step rules: timeout, error and silence each fail', () => {
  const r = healthyRecords()[2];
  assert.ok(stepFailures(CFG.steps[2], { ...r, timed_out: true }).some((e) => e.includes('timed out')));
  assert.ok(stepFailures(CFG.steps[2], { ...r, error: 'boom' }).some((e) => e.includes('boom')));
  assert.ok(stepFailures(CFG.steps[2], { ...r, phrases: [''] }).some((e) => e.includes('no speech')));
});

// ---------- C1: settings read-back ----------
test('settings read-back: mismatch or missing value is reported', () => {
  const want = CFG.nvda_settings;
  assert.deepEqual(settingsMismatch(want, { 'keyboard.speakTypedCharacters': 1, 'keyboard.speakTypedWords': 0 }), []);
  assert.ok(settingsMismatch(want, { 'keyboard.speakTypedCharacters': 0, 'keyboard.speakTypedWords': 0 }).length);
  assert.ok(settingsMismatch(want, { 'keyboard.speakTypedWords': 0 }).length);
  assert.deepEqual(settingsMismatch(want, { 'keyboard.speakTypedCharacters': '1', 'keyboard.speakTypedWords': '0' }), [], 'ini values read back as strings');
});

// ---------- fresh and complete ----------
test('attempt: healthy attempt is fresh and complete', () => {
  const j = judgeAttempt({ steps: CFG, attempt: healthyAttempt(1, '0a1b2c3d'), otherNonces: ['11112222'] });
  assert.deepEqual(j.reasons, []);
  assert.equal(j.fresh, true);
  assert.equal(j.complete, true);
});

test('attempt: freshness failures', () => {
  const judge = (over, other = ['11112222']) => judgeAttempt({ steps: CFG, attempt: healthyAttempt(1, '0a1b2c3d', over), otherNonces: other });
  assert.equal(judge({ title_phrase: 'R1 sign-up - Chromium' }).fresh, false, 'own nonce not in title');
  assert.equal(judge({ new_process: false }).fresh, false, 'NVDA not restarted');
  assert.equal(judge({ settings: { 'keyboard.speakTypedCharacters': 0, 'keyboard.speakTypedWords': 0 } }).fresh, false, 'C1 mismatch');
  assert.equal(judge({ raw: [...HEALTHY, 'R1 sign-up 11112222'] }).fresh, false, 'other nonce in raw log');
  const recs = healthyRecords(1);
  recs[3].phrases = ['11112222'];
  assert.equal(judge({ records: recs }).fresh, false, 'other nonce in a step');
  const r1 = healthyRecords(1);
  r1[0].phrases = ['Full name, edit, Ada'];
  assert.equal(judge({ records: r1 }).fresh, false, 'form not empty at step 1');
  assert.equal(judge({ nonce: 'xyz' }).fresh, false, 'bad nonce format');
});

test('attempt: completeness failures', () => {
  const judge = (over) => judgeAttempt({ steps: CFG, attempt: healthyAttempt(1, '0a1b2c3d', over), otherNonces: [] });
  assert.equal(judge({ records: healthyRecords(1).slice(0, 9) }).complete, false, 'stopped at step 9');
  assert.equal(judge({ status: 'aborted' }).complete, false);
  assert.equal(judge({ status: 'timed-out' }).complete, false);
  const recs = healthyRecords(1);
  recs[6] = { ...recs[6], timed_out: true };
  assert.equal(judge({ records: recs }).complete, false);
  const bad = healthyRecords(1);
  bad[0] = { ...bad[0], dom: '<input>' };
  assert.equal(judge({ records: bad }).complete, false, 'payload rule');
  const wrongAttempt = healthyRecords(2);
  assert.equal(judge({ records: wrongAttempt }).complete, false, 'records from another attempt');
});

test('run: PASS only for 3 of 3 fresh and complete', () => {
  const a = [healthyAttempt(1, '00000001'), healthyAttempt(2, '00000002'), healthyAttempt(3, '00000003')];
  assert.equal(judgeRun({ steps: CFG, attempts: a }).result, 'PASS');
  assert.equal(judgeRun({ steps: CFG, attempts: a.slice(0, 2) }).result, 'FAIL');
  const third = healthyAttempt(3, '00000003', { status: 'timed-out' });
  assert.equal(judgeRun({ steps: CFG, attempts: [a[0], a[1], third] }).result, 'FAIL');
  const aborted = healthyAttempt(2, '00000002', { status: 'aborted', records: healthyRecords(2).slice(0, 3) });
  assert.equal(judgeRun({ steps: CFG, attempts: [a[0], aborted] }).result, 'PARTIAL');
  const setup = judgeRun({ steps: CFG, attempts: [healthyAttempt(1, '00000001', { status: 'setup-failed', records: [] })] });
  assert.equal(setup.result, 'FAIL');
  assert.equal(setup.rerun_allowed, true);
  assert.equal(judgeRun({ steps: CFG, attempts: [a[0], third] }).rerun_allowed, false);
  const dupe = [healthyAttempt(1, '00000001'), healthyAttempt(2, '00000001'), healthyAttempt(3, '00000003')];
  assert.equal(judgeRun({ steps: CFG, attempts: dupe }).result, 'FAIL', 'reused nonce');
});

// ---------- runner core with fakes ----------
test('withTimeout: value, timeout and error', async () => {
  assert.deepEqual(await withTimeout(Promise.resolve(5), 50), { value: 5, timedOut: false, error: null });
  assert.equal((await withTimeout(new Promise(() => {}), 20)).timedOut, true);
  assert.equal((await withTimeout(Promise.reject(new Error('x')), 50)).error, 'x');
});

test('runAttempt: healthy fake gives 10 valid records, settings set, cleanup once', async () => {
  const nvda = fakeNvda();
  const browser = fakeBrowser(nvda);
  const out = tmp();
  const ev = evidenceWriter(out);
  const state = { aborted: false };
  const a = await runAttempt({ nvda, browser, fg: fakeFg(nvda), cfg: FAST, runId: RUN, attempt: 1, nonce: '0a1b2c3d', baseUrl: 'http://127.0.0.1:1', evidence: ev, state });
  assert.equal(a.status, 'completed', a.error);
  assert.deepEqual(nvda.calls[0], ['start', { settings: CFG.nvda_settings }]);
  assert.equal(a.settings['keyboard.speakTypedCharacters'], 1);
  assert.equal(a.new_process, true);
  const recs = readJsonl(join(out, 'attempt-1.jsonl'));
  assert.equal(recs.length, 10);
  for (const r of recs) assert.deepEqual(recordErrors(r), []);
  assert.deepEqual(recs[1].keys, ['A', 'd', 'a']);
  assert.deepEqual(recs[1].phrases, ['A', 'd', 'a']);
  assert.deepEqual(JSON.parse(readFileSync(join(out, 'raw-1.json'), 'utf8')), HEALTHY);
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 1);
  assert.equal(browser.calls.filter(([c]) => c === 'close').length, 1);
  assert.match(browser.calls[0][1], /^http:\/\/127\.0\.0\.1:1\/r1\/signup\.html\?nonce=0a1b2c3d$/);
  const j = judgeAttempt({ steps: CFG, attempt: a, otherNonces: [] });
  assert.deepEqual(j.reasons, []);
});

// The two A2 tests (Alt+Escape focus routine; title never has the nonce after focus_retries) were replaced
// here by the A4 tests below. Spec change approved by the user in D-36, not an edit to make code pass.

// ---------- A4 (D-36): read-only foreground guard before every key ----------
const ARGS = (nvda, over = {}) => ({
  nvda, browser: fakeBrowser(nvda), fg: fakeFg(nvda), cfg: FAST, runId: RUN, attempt: 1, nonce: '0a1b2c3d',
  baseUrl: 'http://127.0.0.1:1', evidence: evidenceWriter(tmp()), state: { aborted: false }, ...over,
});

test('A4: every key action (NVDA+T, press, type) comes right after a passing foreground check', async () => {
  const nvda = fakeNvda();
  const a = await runAttempt(ARGS(nvda));
  assert.equal(a.status, 'completed', a.error);
  const keys = keyCalls(nvda.calls);
  assert.equal(keys.length, 1 + HEALTHY.length, 'NVDA+T once, then one call per action');
  for (const [i, c] of nvda.calls.entries()) {
    if (KEYS.has(c[0])) assert.deepEqual(nvda.calls[i - 1], ['fg', true], `call ${i} ${c.join(' ')} not preceded by a passing check`);
  }
  assert.equal(a.focus_tries, 1, 'one title report, no retries');
  assert.match(a.title_phrase, /0a1b2c3d/);
  const clearAt = nvda.calls.findIndex(([c]) => c === 'clear');
  const firstTab = nvda.calls.findIndex(([c, k]) => c === 'press' && k === 'Tab');
  assert.ok(clearAt > 0 && clearAt < firstTab, 'log cleared after the title report, before step 1');
});

test('A4: no Alt+Escape anywhere, and no window-raising call in the runner', () => {
  for (const f of ['../src/speech/capture.mjs', '../src/speech/foreground.mjs', '../scripts/r1.mjs']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /Alt\+Escape|bringToFront|SetForegroundWindow|ShowWindow|SwitchToThisWindow|SendInput|keybd_event|AllowSetForegroundWindow/, f);
  }
});

test('A4: foreground never ours -> setup-failed after focus_wait_ms, zero keys, cleanup runs', async () => {
  const nvda = fakeNvda();
  const args = ARGS(nvda, { fg: fakeFg(nvda, () => ({ pid: 1, title: 'Program Manager' })) });
  const a = await runAttempt(args);
  assert.equal(a.status, 'setup-failed');
  assert.match(a.error, /foreground/);
  assert.equal(keyCalls(nvda.calls).length, 0, 'no key of any kind was sent');
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 1);
  assert.equal(args.browser.calls.filter(([c]) => c === 'close').length, 1);
  const checks = readJsonl(join(args.evidence.dir, 'focus-1.jsonl'));
  assert.ok(checks.length >= 2, 'polled more than once');
  assert.ok(checks.every((c) => c.ok === false && c.pid_ok === false));
});

test('A4: right process but title lacks the nonce -> setup-failed, zero keys', async () => {
  const nvda = fakeNvda();
  const a = await runAttempt(ARGS(nvda, { fg: fakeFg(nvda, () => ({ pid: PID, title: 'R1 sign-up 99999999 - Chromium' })) }));
  assert.equal(a.status, 'setup-failed');
  assert.equal(keyCalls(nvda.calls).length, 0);
});

test('A4: our window becomes foreground after a wait -> no keys before it, then completes', async () => {
  const nvda = fakeNvda();
  const a = await runAttempt(ARGS(nvda, { fg: fakeFg(nvda, (i, n) => (i < 3 ? { pid: 7, title: 'Taskbar' } : { pid: PID, title: `R1 sign-up ${n} - Chromium` })) }));
  assert.equal(a.status, 'completed', a.error);
  const firstKey = nvda.calls.findIndex(([c]) => KEYS.has(c));
  assert.equal(nvda.calls.slice(0, firstKey).filter(([c, ok]) => c === 'fg' && ok === false).length, 3);
});

test('A4: NVDA+T title lacks the nonce -> setup-failed, one report, no retry, no step keys', async () => {
  const nvda = fakeNvda({ titles: () => 'Program Manager' });
  const a = await runAttempt(ARGS(nvda));
  assert.equal(a.status, 'setup-failed');
  assert.equal(a.focus_tries, 1);
  assert.deepEqual(keyCalls(nvda.calls).map(([c]) => c), ['perform']);
});

test('A4: foreground lost mid-step -> focus-lost, no further keys, partial record kept', async () => {
  const nvda = fakeNvda();
  // Checks: 0 = wait, 1 = before NVDA+T, 2 = Tab (step 1), 3 = 'A', 4 = 'd' -> foreign window.
  const args = ARGS(nvda, { fg: fakeFg(nvda, (i, n) => (i === 4 ? { pid: 999, title: 'Notepad' } : { pid: PID, title: `R1 sign-up ${n} - Chromium` })) });
  const a = await runAttempt(args);
  assert.equal(a.status, 'focus-lost');
  assert.match(a.error, /step 2/);
  assert.deepEqual(keyCalls(nvda.calls).map(([, k]) => k), ['NVDA-T', 'Tab', 'A'], 'nothing sent after the mismatch');
  const recs = readJsonl(join(args.evidence.dir, 'attempt-1.jsonl'));
  assert.equal(recs.length, 2);
  assert.deepEqual(recs[1].keys, ['A', 'd', 'a']);
  assert.deepEqual(recs[1].phrases, ['A'], 'only the action that ran');
  assert.match(recs[1].error, /focus-lost/);
  assert.equal(a.actions_started, 3, 'NVDA+T, Tab, A');
  const bad = readJsonl(join(args.evidence.dir, 'focus-1.jsonl')).filter((c) => !c.ok);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].title, 'Notepad', 'mismatched title kept (80 chars max)');
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 1);
  assert.equal(args.browser.calls.filter(([c]) => c === 'close').length, 1);
});

test('A4: a throwing or hanging foreground probe counts as a mismatch, never as a pass', async () => {
  for (const check of [async () => { throw new Error('probe died'); }, () => new Promise(() => {})]) {
    const nvda = fakeNvda();
    const a = await runAttempt(ARGS(nvda, { fg: { check } }));
    assert.equal(a.status, 'setup-failed');
    assert.equal(keyCalls(nvda.calls).length, 0);
  }
});

test('A4: focus-lost stops the whole run; no rerun allowed', async () => {
  const nvda = fakeNvda();
  let n = 0;
  const fg = fakeFg(nvda, (i, nonce) => (i === 5 ? { pid: 999, title: 'x' } : { pid: PID, title: `R1 sign-up ${nonce} - Chromium` }));
  const summary = await runR1({
    nvda, browser: fakeBrowser(nvda), fg, cfg: FAST, runId: RUN, baseUrl: 'http://127.0.0.1:1',
    evidence: evidenceWriter(tmp()), state: { aborted: false }, nonce: () => `0000000${++n}`, meta: {},
  });
  assert.equal(summary.attempts.length, 1);
  assert.equal(summary.attempts[0].status, 'focus-lost');
  assert.equal(summary.result, 'FAIL');
  assert.equal(summary.rerun_allowed, false);
});

test('foregroundMismatch: pid and nonce both required; nonce case-insensitive', () => {
  const want = { pid: 10, nonce: '0a1b2c3d' };
  assert.deepEqual(foregroundMismatch({ pid: 10, title: 'R1 sign-up 0A1B2C3D - Chromium' }, want), []);
  assert.ok(foregroundMismatch({ pid: 11, title: 'R1 sign-up 0a1b2c3d' }, want).some((e) => e.includes('pid')));
  assert.ok(foregroundMismatch({ pid: 10, title: 'R1 sign-up' }, want).some((e) => e.includes('nonce')));
  assert.ok(foregroundMismatch(null, want).length);
  assert.ok(foregroundMismatch({ pid: null, title: '' }, want).length);
  assert.ok(foregroundMismatch({ pid: 10, title: 'x 0a1b2c3d' }, { pid: 10, nonce: '' }).length, 'empty nonce never matches');
  assert.ok(foregroundMismatch({ pid: 10, title: 'x' }, { pid: undefined, nonce: '0a1b2c3d' }).length, 'unknown Chromium pid never matches');
});

// Fake PowerShell child for foregroundProbe: answers each stdin line with `reply(i)`.
function fakeChild(reply) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = () => { child.killed = true; return true; };
  let i = 0;
  // D-43: this fake implements the same request/reply identity as the read-only helper.
  child.stdin.on('data', (d) => { for (const line of String(d).trim().split('\n')) {
    const request = JSON.parse(line);
    const r = reply(i++);
    if (r !== null) { let value = r; try { value = JSON.stringify({ ...JSON.parse(r), request_id: request.id }); } catch {} child.stdout.write(`${value}\n`); }
  } });
  return child;
}

test('foregroundProbe: one stdin line per check, JSON reply parsed, close kills the helper', async () => {
  let cmd;
  const child = fakeChild((i) => JSON.stringify({ pid: 100 + i, title: `t${i}` }));
  const probe = foregroundProbe({ spawn: (exe, args) => { cmd = [exe, args]; return child; } });
  const a = await probe.check();
  const b = await probe.check();
  assert.deepEqual({ pid: a.pid, title: a.title }, { pid: 100, title: 't0' });
  assert.deepEqual({ pid: b.pid, title: b.title }, { pid: 101, title: 't1' });
  assert.equal(a.request_id, 1); assert.equal(b.request_id, 2);
  assert.ok(a.received_ms >= a.request_started_ms && b.received_ms >= b.request_started_ms);
  assert.equal(cmd[0], 'powershell.exe');
  assert.ok(cmd[1].includes('-NoProfile') && cmd[1].includes('-NonInteractive') && cmd[1].includes('-EncodedCommand'));
  probe.close();
  assert.equal(child.killed, true);
});

test('foregroundProbe: bad JSON, silence or a dead helper -> {pid: null} with an error', async () => {
  const bad = foregroundProbe({ spawn: () => fakeChild(() => 'not json'), timeoutMs: 50 });
  const r1 = await bad.check();
  assert.equal(r1.pid, null);
  assert.ok(r1.error);
  bad.close();
  const quiet = foregroundProbe({ spawn: () => fakeChild(() => null), timeoutMs: 50 });
  const r2 = await quiet.check();
  assert.equal(r2.pid, null);
  assert.match(r2.error, /timed out/);
  quiet.close();
  const dead = fakeChild(() => null);
  const gone = foregroundProbe({ spawn: () => dead, timeoutMs: 1000 });
  const p = gone.check();
  dead.emit('exit', 1);
  assert.equal((await p).pid, null);
  assert.equal((await gone.check()).pid, null, 'stays failed after exit');
});

test('foregroundProbe: the PowerShell helper only reads (user32 Get* calls)', async () => {
  const { PROBE_PS } = await import('../src/speech/foreground.mjs');
  assert.match(PROBE_PS, /GetForegroundWindow/);
  assert.match(PROBE_PS, /GetWindowThreadProcessId/);
  assert.match(PROBE_PS, /GetWindowText/);
  const imports = [...PROBE_PS.matchAll(/extern\s+\S+\s+(\w+)\s*\(/g)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ['GetForegroundWindow', 'GetWindowText', 'GetWindowThreadProcessId']);
});

// ---------- D-36: cleanup, evidence writes, first error ----------
test('cleanup: browser close fails -> kill() fallback, nvda.stop still runs, first error kept', async () => {
  const nvda = fakeNvda({ hangAt: 2 });
  const browser = fakeBrowser(nvda, { closeFails: true });
  const a = await runAttempt(ARGS(nvda, { browser }));
  assert.equal(a.status, 'timed-out');
  assert.match(a.error, /step 2 timed out/, 'the first error, not a cleanup error');
  assert.deepEqual(browser.calls.slice(1).map(([c]) => c), ['close', 'kill']);
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 1);
  assert.ok(a.cleanup_errors.some((e) => e.includes('browser close')));
});

test('cleanup: raw log read throws -> browser and NVDA are still cleaned up', async () => {
  const nvda = fakeNvda();
  nvda.spokenPhraseLog = async () => { throw new Error('log gone'); };
  const args = ARGS(nvda);
  const a = await runAttempt(args);
  assert.equal(a.raw, null);
  assert.equal(args.browser.calls.filter(([c]) => c === 'close').length, 1);
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 1);
  assert.ok(a.cleanup_errors.some((e) => e.includes('raw log')));
});

test('cleanup: nvda.stop hangs -> bounded; browser closed first; attempt returns', async () => {
  const nvda = fakeNvda({ stopHangs: true });
  const args = ARGS(nvda);
  const a = await runAttempt(args);
  assert.equal(args.browser.calls.filter(([c]) => c === 'close').length, 1);
  assert.ok(a.cleanup_errors.some((e) => e.includes('nvda.stop')));
});

test('cleanup: an evidence write that fails does not skip browser close or nvda.stop', async () => {
  const nvda = fakeNvda();
  const args = ARGS(nvda);
  const ev = args.evidence;
  args.evidence = { ...ev, raw() { throw new Error('disk'); } };
  await runAttempt(args);
  assert.equal(args.browser.calls.filter(([c]) => c === 'close').length, 1);
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 1);
});

test('first error: a later error never overwrites it', async () => {
  const nvda = fakeNvda({ hangAt: 0 });
  nvda.stop = async () => { nvda.calls.push(['stop']); throw new Error('stop failed'); };
  const a = await runAttempt(ARGS(nvda));
  assert.match(a.error, /step 1 timed out/);
  assert.ok(a.cleanup_errors.some((e) => e.includes('stop failed')));
});

test('evidenceWriter: survives its folder being deleted; recreates it and flags it', () => {
  const d = tmp();
  const dir = join(d, 'run');
  const ev = evidenceWriter(dir);
  ev.start(1);
  rmSync(dir, { recursive: true, force: true });
  assert.doesNotThrow(() => ev.record(1, { a: 1 }));
  assert.deepEqual(readJsonl(join(dir, 'attempt-1.jsonl')), [{ a: 1 }]);
  assert.equal(ev.status().dir_recreated, true);
  assert.deepEqual(ev.status().write_errors, []);
});

test('evidenceWriter: an impossible write is collected, never thrown', () => {
  const d = tmp();
  const dir = join(d, 'run');
  const ev = evidenceWriter(dir);
  rmSync(dir, { recursive: true, force: true });
  writeFileSync(dir, 'a file where the folder was');
  assert.doesNotThrow(() => ev.summary({ x: 1 }));
  assert.equal(ev.status().write_errors.length, 1);
  assert.match(ev.status().write_errors[0], /summary\.json/);
});

test('runR1: summary carries evidence status and the foreground check files', async () => {
  const nvda = fakeNvda();
  const out = tmp();
  let n = 0;
  const s = await runR1({
    nvda, browser: fakeBrowser(nvda), fg: fakeFg(nvda), cfg: FAST, runId: RUN, baseUrl: 'http://127.0.0.1:1',
    evidence: evidenceWriter(out), state: { aborted: false }, nonce: () => `0000000${++n}`, meta: {},
  });
  assert.deepEqual(s.evidence, { dir_recreated: false, write_errors: [] });
  assert.equal(s.attempts[0].files.focus, 'focus-1.jsonl');
  assert.ok(existsSync(join(out, 'focus-3.jsonl')));
});

// ---------- D-36: run guard ----------
test('ciGuardErrors: only a GitHub-hosted Windows Actions runner passes; no bypass', () => {
  const ok = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Windows' };
  assert.deepEqual(ciGuardErrors(ok), []);
  assert.ok(ciGuardErrors({}).length >= 3);
  assert.ok(ciGuardErrors({ ...ok, RUNNER_ENVIRONMENT: 'self-hosted' }).length);
  assert.ok(ciGuardErrors({ ...ok, RUNNER_OS: 'Linux' }).length);
  assert.ok(ciGuardErrors({ ...ok, GITHUB_ACTIONS: '1' }).length);
  assert.ok(ciGuardErrors({ ...ok, CI: 'true', R1_ALLOW_LOCAL: '1', GITHUB_ACTIONS: undefined }).length, 'no override variable');
});

test('repoSnapshot/repoChanges: HEAD, tree, lock and test hashes; own evidence dir ignored', () => {
  const git = (out) => (args) => out[args[0]];
  const base = { 'rev-parse': 'abc123\n', status: '' };
  const s0 = repoSnapshot({ git: git(base), hashes: { a: '1' }, tests: { 't.mjs': 'x' }, ignore: 'docs/evidence/r1/r1-x/' });
  assert.equal(s0.head, 'abc123');
  assert.deepEqual(s0.dirty, []);
  assert.deepEqual(repoChanges(s0, s0), []);
  const own = repoSnapshot({ git: git({ ...base, status: '?? docs/evidence/r1/r1-x/attempt-1.jsonl\n' }), hashes: { a: '1' }, tests: { 't.mjs': 'x' }, ignore: 'docs/evidence/r1/r1-x/' });
  assert.deepEqual(own.dirty, [], 'this run\'s own evidence is not interference');
  const dirty = repoSnapshot({ git: git({ ...base, status: ' M src/speech/capture.mjs\n?? docs/evidence/r1/other/x\n' }), hashes: { a: '1' }, tests: { 't.mjs': 'x' }, ignore: 'docs/evidence/r1/r1-x/' });
  assert.deepEqual(dirty.dirty, [' M src/speech/capture.mjs', '?? docs/evidence/r1/other/x']);
  const moved = repoSnapshot({ git: git({ ...base, 'rev-parse': 'def456\n' }), hashes: { a: '2' }, tests: { 't.mjs': 'y' }, ignore: 'docs/evidence/r1/r1-x/' });
  const ch = repoChanges(s0, moved);
  assert.ok(ch.some((c) => c.includes('HEAD')));
  assert.ok(ch.some((c) => c.includes('a')));
  assert.ok(ch.some((c) => c.includes('t.mjs')));
  assert.ok(repoChanges(s0, dirty).some((c) => c.includes('capture.mjs')));
});

test('repoSnapshot: a failing git call is recorded as interference, not ignored', () => {
  const s = repoSnapshot({ git: () => { throw new Error('no git'); }, hashes: {}, tests: {}, ignore: 'x/' });
  assert.ok(s.errors.length);
  assert.ok(repoChanges(s, s).some((c) => c.includes('no git')));
});

test('runR1: interference after an attempt is recorded, stops the run, and the result cannot be PASS', async () => {
  const nvda = fakeNvda();
  let n = 0;
  let calls = 0;
  const s = await runR1({
    nvda, browser: fakeBrowser(nvda), fg: fakeFg(nvda), cfg: FAST, runId: RUN, baseUrl: 'http://127.0.0.1:1',
    evidence: evidenceWriter(tmp()), state: { aborted: false }, nonce: () => `0000000${++n}`, meta: {},
    interference: () => (++calls === 2 ? [' M src/speech/capture.mjs'] : []),
  });
  assert.equal(s.attempts.length, 2, 'no attempt starts after interference');
  assert.deepEqual(s.interference, [{ after_attempt: 2, changes: [' M src/speech/capture.mjs'] }]);
  assert.equal(s.result, 'FAIL');
  assert.equal(s.rerun_allowed, false);
  assert.ok(s.result_reasons.some((r) => r.includes('interference')));
});

test('runR1: evidence folder deleted mid-run -> recreated, flagged, result cannot be PASS', async () => {
  const nvda = fakeNvda();
  const out = join(tmp(), 'run');
  const ev = evidenceWriter(out);
  let n = 0;
  const s = await runR1({
    nvda, browser: fakeBrowser(nvda), fg: fakeFg(nvda), cfg: FAST, runId: RUN, baseUrl: 'http://127.0.0.1:1',
    evidence: ev, state: { aborted: false }, nonce: () => `0000000${++n}`, meta: {},
    interference: () => { if (n === 1) rmSync(out, { recursive: true, force: true }); return []; },
  });
  assert.equal(s.evidence.dir_recreated, true);
  assert.equal(s.result, 'FAIL');
  assert.ok(s.result_reasons.some((r) => r.includes('evidence')));
  assert.ok(existsSync(join(out, 'summary.json')));
});

// D-39: NVDA now loads from the vendored tree (vreq NVDA.js), not import('@guidepup/guidepup'), and the crash
// handlers live in installTeardown (capture.mjs), which r1.mjs calls. Spec change D-39, mapped in the brief.
test('r1.mjs: CI guard and clean-tree check come before NVDA or Playwright is loaded', () => {
  const src = readFileSync(new URL('../scripts/r1.mjs', import.meta.url), 'utf8');
  const guard = src.indexOf('ciGuardErrors(process.env)');
  const snap = src.indexOf('repoSnapshot(');
  const nvdaLoad = src.indexOf("vreq('./lib/windows/NVDA/NVDA.js')");
  const pwImport = src.indexOf("import('@playwright/test')");
  assert.ok(guard > 0 && snap > 0 && nvdaLoad > 0 && pwImport > 0);
  assert.ok(guard < nvdaLoad && guard < pwImport, 'CI guard first');
  assert.ok(snap < nvdaLoad, 'clean-tree check before NVDA');
  assert.doesNotMatch(src, /^import .*guidepup/m, 'no static import of Guidepup');
  assert.match(src, /installTeardown\(/);
  const cap = readFileSync(new URL('../src/speech/capture.mjs', import.meta.url), 'utf8');
  assert.match(cap, /'uncaughtException'/);
  assert.match(cap, /'unhandledRejection'/);
  assert.match(src, /fixtureBrowser\(\{ chromium, cfg, versions \}\)/);
  assert.match(readFileSync(new URL('../src/speech/browser.mjs', import.meta.url), 'utf8'), /launchServer\(/);
});

// ---------- D-36: workflow ----------
// S-03: a CRLF checkout is the same workflow, so newlines are normalised first and both forms are checked.
const R1_YML = readFileSync(new URL('../.github/workflows/r1.yml', import.meta.url), 'utf8');
test('workflow r1.yml: manual only, one job, read-only token, no secrets, evidence uploaded always (LF and CRLF)', () => {
  const lf = R1_YML.replace(/\r\n/g, '\n');
  for (const text of [lf, lf.replace(/\n/g, '\r\n')]) assertR1Workflow(text);
});
function assertR1Workflow(text) {
  const yml = text.replace(/\r\n/g, '\n');
  const on =yml.match(/^on:\n((?:[ \t]+.*\n)+)/m)?.[1] ?? '';
  assert.match(on, /workflow_dispatch/);
  assert.doesNotMatch(on, /push|pull_request|schedule|workflow_run|repository_dispatch/);
  assert.match(yml, /^permissions:\n\s+contents: read\s*$/m);
  assert.match(yml, /^concurrency:\n\s+group: r1\n\s+cancel-in-progress: false/m);
  assert.equal([...yml.matchAll(/^\s{2}[\w-]+:\n\s{4}runs-on:/gm)].length, 1, 'one job');
  assert.match(yml, /runs-on: windows-2025/);
  assert.match(yml, /timeout-minutes:/);
  assert.doesNotMatch(yml, /secrets\.|\$\{\{\s*secrets|META_|env\.META/i);
  assert.match(yml, /persist-credentials: false/);
  const upload = yml.slice(yml.indexOf('actions/upload-artifact'));
  assert.match(yml, /if: always\(\)\n\s+uses: actions\/upload-artifact/);
  // Spec change D-37 / Codex S-04 (was: docs/evidence/r1/): evidence now lives outside the checkout.
  assert.match(upload, /path: \$\{\{ runner\.temp \}\}\/r1-evidence\//);
  assert.match(yml, /npm test/);
  assert.match(yml, /npm run r1/);
  assert.doesNotMatch(yml, /continue-on-error: true\n.*npm run r1/);
}

// ---------- runner core, unchanged rules (D-36 adds only the fg argument) ----------
test('runAttempt: C1 read-back mismatch -> setup-failed before any page or step', async () => {
  const nvda = fakeNvda({ settings: { keyboard: { speakTypedCharacters: 0, speakTypedWords: 0 } } });
  const browser = fakeBrowser(nvda);
  const a = await runAttempt({ nvda, browser, fg: fakeFg(nvda), cfg: FAST, runId: RUN, attempt: 1, nonce: '0a1b2c3d', baseUrl: 'http://127.0.0.1:1', evidence: evidenceWriter(tmp()), state: { aborted: false } });
  assert.equal(a.status, 'setup-failed');
  assert.match(a.error, /speakTypedCharacters/);
  assert.equal(browser.calls.length, 0);
  assert.equal(nvda.calls.filter(([c]) => c === 'press' || c === 'type').length, 0);
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 1);
});

test('runAttempt: an action that never returns times out, is recorded, attempt stops', async () => {
  const nvda = fakeNvda({ hangAt: 4 }); // 5th action = step 3 Tab
  const out = tmp();
  const a = await runAttempt({ nvda, browser: fakeBrowser(nvda), fg: fakeFg(nvda), cfg: FAST, runId: RUN, attempt: 1, nonce: '0a1b2c3d', baseUrl: 'http://127.0.0.1:1', evidence: evidenceWriter(out), state: { aborted: false } });
  assert.equal(a.status, 'timed-out');
  const recs = readJsonl(join(out, 'attempt-1.jsonl'));
  assert.equal(recs.length, 3);
  assert.equal(recs[2].timed_out, true);
  assert.deepEqual(recs[2].phrases, []);
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 1);
  assert.ok(existsSync(join(out, 'raw-1.json')), 'raw log kept even after a timeout');
});

test('runR1: three healthy fake attempts -> PASS, evidence files, relative paths only', async () => {
  const nvda = fakeNvda();
  const out = tmp();
  let n = 0;
  const summary = await runR1({
    nvda, browser: fakeBrowser(nvda), fg: fakeFg(nvda), cfg: FAST, runId: RUN, baseUrl: 'http://127.0.0.1:1',
    evidence: evidenceWriter(out), state: { aborted: false }, nonce: () => `0000000${++n}`, meta: { evidence_dir: 'docs/evidence/r1/r1-test' },
  });
  assert.equal(summary.result, 'PASS');
  // D-36 adds focus-N.jsonl (A4 check log) to the evidence set; D-39 (M03) adds sends-N.jsonl (intent and action lines).
  assert.deepEqual(readdirSync(out).sort(), ['attempt-1.jsonl', 'attempt-2.jsonl', 'attempt-3.jsonl', 'focus-1.jsonl', 'focus-2.jsonl', 'focus-3.jsonl', 'raw-1.json', 'raw-2.json', 'raw-3.json', 'sends-1.jsonl', 'sends-2.jsonl', 'sends-3.jsonl', 'summary.json']);
  const onDisk = readFileSync(join(out, 'summary.json'), 'utf8');
  assert.equal(JSON.parse(onDisk).result, 'PASS');
  assert.doesNotMatch(onDisk, /[A-Za-z]:\\\\|"\/(Users|home|tmp)/, 'no absolute paths');
  assert.equal(nvda.calls.filter(([c]) => c === 'start').length, 3);
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 3);
});

test('runR1: setup failure in attempt 1 stops the run and allows a rerun', async () => {
  const nvda = fakeNvda({ titles: () => 'Program Manager' });
  const summary = await runR1({
    nvda, browser: fakeBrowser(nvda), fg: fakeFg(nvda), cfg: FAST, runId: RUN, baseUrl: 'http://127.0.0.1:1',
    evidence: evidenceWriter(tmp()), state: { aborted: false }, nonce: () => '0a1b2c3d', meta: {},
  });
  assert.equal(summary.result, 'FAIL');
  assert.equal(summary.rerun_allowed, true);
  assert.equal(summary.attempts.length, 1);
});

// ---------- C3: SIGINT (D-39 B02: one teardown for every entry; installTeardown replaces installAbort) ----------
// installTeardown on a fake process: signals and crashes are emitted on `proc`; exit codes are collected
// with the time they came, and diag lines are kept. The real process is never signalled.
// Bounds are short so the tests are quick; the integrity check (vendorIntegrity in r1.mjs) is faked as clean.
const GATE = (o = {}) => {
  const g = sendGate({ checkMs: 150, settleMs: 0, ackMs: 100, maxAgeMs: 1000, writeMs: 100, sendMs: 100, killMs: 50, ...o });
  g.setIntegrity(() => []);
  return g;
};
const OURS = (n) => ({ pid: PID, title: `R1 sign-up ${n} - Chromium` });
const R1ARGS = (nvda, over = {}) => {
  let n = 0;
  return {
    nvda, browser: fakeBrowser(nvda), fg: fakeFg(nvda), cfg: FAST, runId: RUN, baseUrl: 'http://127.0.0.1:1',
    evidence: evidenceWriter(tmp()), state: { aborted: false }, nonce: () => `0000000${++n}`, meta: {}, liveWaitMs: 1000, ...over,
  };
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const physOf = (calls) => calls.filter(([c]) => c === 'phys').map(([, k]) => k);
const at = (calls, entry) => calls.findIndex((c) => c.length === entry.length && c.every((x, i) => x === entry[i]));
const TEARDOWN_EVENTS = ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP', 'uncaughtException', 'unhandledRejection'];
function rigTeardown({ state, evidence, guard, cfg = FAST, liveWaitMs = 1000, deadlineMs, report } = {}) {
  const proc = new EventEmitter();
  const codes = [];
  const lines = [];
  let exited;
  const done = new Promise((r) => { exited = r; });
  const t0 = Date.now();
  const td = installTeardown({
    proc, state, evidence, cfg, runId: RUN, meta: {}, guard, liveWaitMs, deadlineMs, report,
    exit: (c) => { codes.push([c, Date.now() - t0]); exited(c); }, diag: (l) => lines.push(l),
  });
  return { proc, codes, lines, done, ...td };
}

test('SIGINT mid-step: one teardown: cleanup tried, partial evidence "aborted", exit 130', async () => {
  const out = tmp();
  const state = { aborted: false };
  const guard = GATE();
  const ev = evidenceWriter(out);
  const t = rigTeardown({ state, evidence: ev, guard });
  const nvda = fakeNvda({ hangAt: 4, onHang: () => setImmediate(() => t.proc.emit('SIGINT')) });
  const browser = fakeBrowser(nvda);
  runR1({ nvda, browser, fg: fakeFg(nvda), cfg: FAST, runId: RUN, baseUrl: 'http://127.0.0.1:1', evidence: ev, state, nonce: () => '0a1b2c3d', meta: {}, guard });
  await t.done;
  t.dispose();
  assert.deepEqual(t.codes.map(([c]) => c), [130]);
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 1);
  assert.equal(browser.calls.filter(([c]) => c === 'close').length, 1);
  const s = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
  assert.equal(s.status, 'aborted');
  assert.equal(s.result, 'PARTIAL');
  assert.deepEqual(s.reached, { attempt: 1, step: 3 });
  // D-39 (M03): the two finished steps, then the partial record of step 3 (was: 2 lines).
  const recs = readJsonl(join(out, 'attempt-1.jsonl'));
  assert.deepEqual(recs.map((r) => r.partial === true), [false, false, true]);
  assert.ok(existsSync(join(out, 'raw-1.json')));
  for (const e of TEARDOWN_EVENTS) assert.equal(t.proc.listenerCount(e), 0, `${e} handler removed`);
});

// Replaces 'second SIGINT exits at once even while cleanup hangs' (C3), which B02 reverses: a later signal
// no longer exits at once; teardown keeps its own bound. Spec change D-39, mapped in the brief.
test('B02: later signals during teardown are logged, not an exit; one exit after cleanup', async () => {
  const state = { aborted: false };
  const guard = GATE();
  const t = rigTeardown({ state, evidence: evidenceWriter(tmp()), guard });
  const nvda = fakeNvda({
    hangAt: 0,
    onHang: () => setImmediate(() => {
      t.proc.emit('SIGINT');
      setImmediate(() => { t.proc.emit('SIGTERM'); t.proc.emit('SIGBREAK'); t.proc.emit('SIGHUP'); });
    }),
  });
  let stopAt = null;
  nvda.stop = async () => { nvda.calls.push(['stop']); await delay(120); stopAt = Date.now(); };
  runR1({ nvda, browser: fakeBrowser(nvda), fg: fakeFg(nvda), cfg: FAST, runId: RUN, baseUrl: 'http://127.0.0.1:1', evidence: evidenceWriter(tmp()), state, nonce: () => '0a1b2c3d', meta: {}, guard });
  const exitAt = await t.done.then(() => Date.now());
  await delay(50);
  t.dispose();
  assert.deepEqual(t.codes.map(([c]) => c), [130], 'one exit');
  assert.ok(stopAt !== null && exitAt >= stopAt, 'exit only after nvda.stop finished');
  for (const sig of ['SIGTERM', 'SIGBREAK', 'SIGHUP']) assert.ok(t.lines.some((l) => l.includes(sig) && l.includes('during teardown')), `${sig} logged`);
});

// ---------- server and lock ----------
test('serveDir: serves files under root on 127.0.0.1 only; no traversal', async () => {
  const root = new URL('../fixtures/', import.meta.url);
  const { server, port, host } = await serveDir(root);
  try {
    assert.equal(host, '127.0.0.1');
    const ok = await fetch(`http://127.0.0.1:${port}/r1/signup.html`);
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('content-type'), /text\/html/);
    assert.match(await ok.text(), /<title>/);
    for (const bad of ['/../package.json', '/%2e%2e/package.json', '/r1/..%2f..%2fpackage.json', '/nope.html']) {
      const r = await fetch(`http://127.0.0.1:${port}${bad}`);
      assert.equal(r.status, 404, bad);
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/r1/signup.html`, { method: 'POST' })).status, 405);
  } finally { server.close(); }
});

test('specText: text between the F-02 markers; lockMismatches names changed files', () => {
  const md = 'a\n<!-- F-02 spec begin: x -->\nSPEC\n<!-- F-02 spec end -->\nb';
  assert.equal(specText(md), '\nSPEC\n');
  assert.throws(() => specText('no markers'));
  assert.deepEqual(lockMismatches({ a: '1', b: '2' }, { a: '1', b: '2' }), []);
  assert.deepEqual(lockMismatches({ a: '1', b: '2' }, { a: '1', b: '3' }), ['b']);
  assert.deepEqual(lockMismatches({ a: '1' }, {}), ['a']);
});

test('fixture: steps.json is the frozen 10 steps with C1 settings', () => {
  assert.equal(CFG.steps.length, 10);
  assert.deepEqual(CFG.steps.map((s) => s.press ?? `type:${s.type}`), ['Tab', 'type:Ada', 'Tab', 'type:ada@example.test', 'Tab', 'Space', 'Tab', 'Enter', 'Enter', 'Shift+Tab']);
  assert.deepEqual(CFG.nvda_settings, { keyboard: { speakTypedCharacters: 1, speakTypedWords: 0 } });
  assert.equal(CFG.silence_ms, 1000);
  assert.equal(CFG.action_timeout_ms, 8000);
  // D-36 A4 replaced focus_retries/focus_delay_ms (A2) with a bounded read-only wait.
  assert.equal(CFG.focus_retries, undefined);
  assert.equal(CFG.focus_delay_ms, undefined);
  assert.equal(CFG.focus_wait_ms, 10000);
  assert.equal(CFG.focus_poll_ms, 250);
});

// ---------- D-39: the send gate in the runner, one teardown, evidence fixes (spec R1-D39 rev 3, D-40) ----------
// gatedNvda drives the gate the way the two vendored key paths do (test/vendor.test.mjs runs the real ones):
// admit (bounded check), commit in the same turn, dispatch, release (page ack, settle, post-check). As in
// Guidepup, capture first sends the stop-speech Control (an NVDA chord), then the key: an NVDA chord for
// press and perform, one SendKeys character for type. ['phys', key] marks the moment a key would physically
// be sent; the page's keydown log (fakeBrowser page.keys) gets what that key would produce there, NVDA's own
// Control and Insert included (T26). onPhys(key) may return:
//   { drop }    the key never reaches the page;      { extra: k }  the page also sees key k (or each of a list);
//   { lateMs }  the page sees the key that much later; { hold: p } dispatch ends when p does, bounded by
//   writeMs (NVDA chord) or sendMs (character), like the vendored code;
//   { live }    the cscript child never exits (character only): released with ended false, settle later;
//   { after }   after(toPage), called once the send is released (D-42: a stray key between sends).
// Replaces guardedNvda (D-37 wrapper fake); the brief maps the old tests to these.
const CHORDS = {
  stopSpeech: [[VK.Control, 29, false]], 'NVDA-T': [[VK.Insert, 82, true], [84, 20, false]],
  Tab: [[VK.Tab, 15, false]], 'Shift+Tab': [[VK.Shift, 42, false], [VK.Tab, 15, false]],
  Space: [[VK.Space, 57, false]], Enter: [[VK.Enter, 28, false]],
};
const chord = (k) => ({ path: 'nvda', keys: CHORDS[k].map(([vk, scan, ext]) => ({ vk, scan, ext })) });
const PAGE_KEYS = {
  stopSpeech: [['Control']], 'NVDA-T': [['Insert']], Tab: [['Tab']], 'Shift+Tab': [['Shift', true], ['Tab', true]],
  Space: [[' ']], Enter: [['Enter']],
};
const pageKeysOf = (k) => PAGE_KEYS[k] ?? (/^[A-Z@]$/.test(k) ? [['Shift', true], [k, true]] : [[k]]);
function gatedNvda(gate, { onPhys, ...opts } = {}) {
  const nvda = fakeNvda(opts);
  nvda.keylog = [];
  nvda.live = [];
  let seq = 0;
  const toPage = (k) => { for (const [key, shift = false] of pageKeysOf(k)) nvda.keylog.push({ seq: ++seq, key, shift }); };
  const dispatch = async (k, info) => {
    const token = await gate.admit(info);
    if (!gate.commit(token)) throw new Error('R1_REFUSED: commit');
    nvda.calls.push(['phys', k]);
    const typed = info.path === 'sendkeys';
    if (typed) gate.launched(token, () => nvda.calls.push(['kill', k]));
    const o = onPhys?.(k) ?? {};
    if (o.lateMs) setTimeout(() => toPage(k), o.lateMs);
    else if (!o.drop) toPage(k);
    if (o.extra) for (const x of [].concat(o.extra)) toPage(x);
    let error = o.error ?? null;
    if (o.hold) {
      const r = await withTimeout(o.hold, typed ? gate.bounds.sendMs : gate.bounds.writeMs);
      if (r.timedOut) error = typed ? 'cscript did not exit' : 'write callback timed out';
    }
    const live = typed && o.live === true;
    if (live) error = 'cscript did not exit';
    await gate.release(token, { error, ended: !live });
    nvda.calls.push(['released', k]);
    o.after?.(toPage);
    if (live) nvda.live.push(() => gate.settled(token));
    if (error) throw new Error(`R1_SEND_FAILED: ${error}`);
  };
  nvda.dispatch = dispatch;
  const { press, type, perform } = nvda;
  nvda.press = async (k, o) => { await dispatch('stopSpeech', chord('stopSpeech')); await dispatch(k, chord(k)); return press(k, o); };
  nvda.type = async (c, o) => { await dispatch('stopSpeech', chord('stopSpeech')); await dispatch(c, { path: 'sendkeys', char: c }); return type(c, o); };
  nvda.perform = async (cmd, o) => {
    await dispatch('stopSpeech', chord('stopSpeech'));
    await dispatch(cmd.representation, chord(cmd.representation));
    return perform(cmd, o);
  };
  return nvda;
}

test('D-39 runner: every physical send has a passing check right before and right after it; page keys acknowledged', async () => {
  const guard = GATE();
  const nvda = gatedNvda(guard);
  const args = R1ARGS(nvda, { guard });
  const s = await runR1(args);
  assert.equal(s.result, 'PASS', JSON.stringify(s.result_reasons));
  const phys = physOf(nvda.calls);
  assert.equal(phys.length, 3 * 2 * (1 + HEALTHY.length), 'stopSpeech + key for NVDA+T and every action, 3 attempts');
  for (const [i, c] of nvda.calls.entries()) {
    if (c[0] !== 'phys') continue;
    assert.deepEqual(nvda.calls[i - 1], ['fg', true], `send ${i} ${c[1]}: no passing check right before`);
    assert.deepEqual(nvda.calls[i + 1], ['fg', true], `send ${i} ${c[1]}: no passing check right after`);
  }
  assert.equal(s.send_guard.sends, phys.length);
  assert.equal(s.send_guard.stopped, false);
  assert.deepEqual(s.send_guard.acks, { confirmed: 3 * HEALTHY.length, missing: 0, unconfirmable: 3 * (2 + HEALTHY.length) });
  assert.deepEqual(s.evidence_check, []);
  assert.equal(args.state.persisted, true);
  const lines = readJsonl(join(args.evidence.dir, 'focus-1.jsonl'));
  assert.deepEqual(lines.filter((l) => l.phase).slice(0, 4).map((l) => `${l.phase}:${l.key}`), ['pre:Control', 'post:Control', 'pre:Insert+T', 'post:Insert+T']);
  // M03: an intent line before each physical send, an action line after each action.
  const sends = readJsonl(join(args.evidence.dir, 'sends-1.jsonl'));
  assert.equal(sends.filter((l) => l.type === 'intent').length, 2 * (1 + HEALTHY.length));
  assert.equal(sends.filter((l) => l.type === 'action').length, 1 + HEALTHY.length);
  assert.deepEqual(sends.slice(0, 2).map(({ type, send, step, action, key }) => ({ type, send, step, action, key })), [
    { type: 'intent', send: 1, step: 0, action: 'NVDA-T', key: 'Control' },
    { type: 'intent', send: 2, step: 0, action: 'NVDA-T', key: 'Insert+T' },
  ]);
  const tab = sends.find((l) => l.type === 'action' && l.step === 1);
  assert.deepEqual({ action: tab.action, phrase: tab.phrase, acks: tab.acks }, { action: 'Tab', phrase: 'Full name, edit, blank', acks: [null, true] });
});

test('T26 runner (D-40): NVDA\'s own Control and Insert on the page, even late, do not fail an ack; a leaked key does', async () => {
  const guard = GATE();
  const nvda = gatedNvda(guard, { onPhys: (k) => (k === 'stopSpeech' ? { lateMs: 1 } : undefined) });
  const s = await runR1(R1ARGS(nvda, { guard }));
  assert.equal(s.result, 'PASS', JSON.stringify(s.result_reasons));
  assert.ok(nvda.keylog.some((e) => e.key === 'Control') && nvda.keylog.some((e) => e.key === 'Insert'));
  // NVDA+T leaks a 't' to the page. D-42: changed. It was caught in the Tab's window, after the stop-speech
  // Control and the Tab were sent; the pre-send log check now refuses the next send, so neither is sent.
  const g2 = GATE();
  const leaky = gatedNvda(g2, { onPhys: (k) => (k === 'NVDA-T' ? { extra: 't' } : undefined) });
  const s2 = await runR1(R1ARGS(leaky, { guard: g2 }));
  assert.equal(s2.result, 'FAIL');
  assert.equal(s2.send_guard.kind, 'ack');
  assert.equal(s2.send_guard.misdelivered, true);
  assert.deepEqual(physOf(leaky.calls), ['stopSpeech', 'NVDA-T'], 'nothing after the leaked key');
});

test('T7 runner: window changes during a send -> possibly misdelivered, focus-lost, FAIL, no rerun, nothing more sent', async () => {
  const guard = GATE();
  let away = false;
  const nvda = gatedNvda(guard, { onPhys: (k) => { if (k === 'd') away = true; } });
  const fg = fakeFg(nvda, (i, n) => (away ? { pid: 999, title: 'Notepad' } : OURS(n)));
  const s = await runR1(R1ARGS(nvda, { guard, fg }));
  assert.equal(s.attempts.length, 1, 'the run stops');
  assert.equal(s.attempts[0].status, 'focus-lost');
  assert.match(s.attempts[0].error, /step 2: send guard.*possibly misdelivered/);
  assert.equal(s.result, 'FAIL');
  assert.equal(s.rerun_allowed, false);
  assert.equal(s.send_guard.kind, 'post');
  assert.equal(s.send_guard.misdelivered, true);
  assert.ok(s.result_reasons.some((r) => r.includes('misdelivered')));
  assert.deepEqual(physOf(nvda.calls).slice(-2), ['stopSpeech', 'd'], 'nothing sent after the bad post-check');
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 1);
});

test('T7 runner: the same window change overlapped with SIGINT -> FAIL, not PARTIAL; nothing more sent', async () => {
  const state = { aborted: false };
  const guard = GATE();
  const ev = evidenceWriter(tmp());
  const t = rigTeardown({ state, evidence: ev, guard });
  let away = false;
  const nvda = gatedNvda(guard, { onPhys: (k) => { if (k === 'd') { away = true; t.proc.emit('SIGINT'); } } });
  const fg = fakeFg(nvda, (i, n) => (away ? { pid: 999, title: 'Notepad' } : OURS(n)));
  runR1(R1ARGS(nvda, { guard, fg, state, evidence: ev }));
  await t.done;
  t.dispose();
  const s = JSON.parse(readFileSync(join(ev.dir, 'summary.json'), 'utf8'));
  assert.equal(s.status, 'aborted');
  assert.equal(s.result, 'FAIL');
  assert.equal(s.send_guard.misdelivered, true);
  assert.ok(s.result_reasons.some((r) => r.includes('misdelivered')));
  assert.equal(physOf(nvda.calls).at(-1), 'd');
});

test('D-39 runner: gate pre-check fails before the first send -> setup-failed, zero keys sent', async () => {
  const guard = GATE();
  const nvda = gatedNvda(guard);
  // Checks: 0 = wait, 1 = runner check before NVDA+T, 2 = gate check before stopSpeech -> foreign.
  const fg = fakeFg(nvda, (i, n) => (i === 2 ? { pid: 999, title: 'x' } : OURS(n)));
  const s = await runR1(R1ARGS(nvda, { guard, fg }));
  assert.equal(s.attempts[0].status, 'setup-failed');
  assert.match(s.attempts[0].error, /report title: send guard: before send 1 \(Control\)/);
  assert.deepEqual(physOf(nvda.calls), []);
  assert.equal(s.send_guard.kind, 'pre');
  assert.equal(s.send_guard.misdelivered, false);
  assert.equal(s.result, 'FAIL');
  assert.equal(s.rerun_allowed, true, 'nothing was sent, so attempt 1 setup-failed allows a rerun');
});

test('D-39 runner: a hung probe inside the gate sends nothing and stops the run', async () => {
  const guard = GATE();
  const nvda = gatedNvda(guard);
  let i = 0;
  const fg = { check: () => (++i === 3 ? new Promise(() => {}) : Promise.resolve(OURS(nvda.nonce()))) };
  const s = await runR1(R1ARGS(nvda, { guard, fg }));
  assert.deepEqual(physOf(nvda.calls), []);
  assert.equal(s.attempts.length, 1);
  assert.equal(s.attempts[0].status, 'setup-failed');
  assert.match(s.send_guard.reason, /timed out/);
});

test('D-39 runner: an action timeout stops the gate; no later attempt, a late send is refused', async () => {
  const guard = GATE();
  const nvda = gatedNvda(guard, { hangAt: 2 });
  const s = await runR1(R1ARGS(nvda, { guard }));
  assert.equal(s.attempts.length, 1);
  assert.equal(s.attempts[0].status, 'timed-out');
  assert.equal(s.send_guard.kind, 'timeout');
  const before = physOf(nvda.calls).length;
  await assert.rejects(nvda.dispatch('Tab', chord('Tab')), /R1_REFUSED/);
  assert.equal(physOf(nvda.calls).length, before);
});

test('D-39 runner: repository change before a step stops the attempt before any key of that step (M-07)', async () => {
  const guard = GATE();
  const nvda = gatedNvda(guard);
  let steps = 0;
  const s = await runR1(R1ARGS(nvda, { guard, watch: () => (++steps === 4 ? [' M fixtures/r1/signup.html'] : []) }));
  assert.equal(s.attempts.length, 1);
  assert.deepEqual(s.interference, [{ during_attempt: 1, before_step: 4, changes: [' M fixtures/r1/signup.html'] }]);
  assert.equal(s.attempts[0].steps_recorded, 3);
  assert.equal(s.result, 'FAIL');
  assert.equal(s.rerun_allowed, false);
});

test('T19 runner: the page never sees the key, or sees one extra -> possibly misdelivered, FAIL, nothing more sent', async () => {
  for (const [onPhys, last] of [
    [(k) => (k === 'd' ? { drop: true } : undefined), 'd'],
    [(k) => (k === 'Tab' ? { extra: 'q' } : undefined), 'Tab'],
  ]) {
    const guard = GATE();
    const nvda = gatedNvda(guard, { onPhys });
    const s = await runR1(R1ARGS(nvda, { guard }));
    assert.equal(s.result, 'FAIL');
    assert.equal(s.rerun_allowed, false);
    assert.equal(s.send_guard.kind, 'ack');
    assert.equal(s.send_guard.misdelivered, true);
    assert.equal(s.send_guard.acks.missing, 1);
    assert.equal(s.attempts[0].status, 'focus-lost');
    assert.equal(physOf(nvda.calls).at(-1), last, 'nothing sent after the failed ack');
  }
});

test('T5 runner: a write callback that never fires -> possibly misdelivered, FAIL; the page closes only once the send has ended', async () => {
  const guard = GATE({ writeMs: 600 });
  const nvda = gatedNvda(guard, { onPhys: (k) => (k === 'Tab' ? { hold: new Promise(() => {}) } : undefined) });
  const s = await runR1(R1ARGS(nvda, { guard }));
  assert.equal(s.attempts.length, 1);
  assert.equal(s.result, 'FAIL');
  assert.equal(s.send_guard.misdelivered, true);
  assert.ok(s.result_reasons.some((r) => r.includes('misdelivered')));
  const released = at(nvda.calls, ['released', 'Tab']);
  const closed = at(nvda.calls, ['page', 'close']);
  assert.ok(released > 0 && closed > released, 'page closed after the send ended, not before');
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 1);
});

test('T6 runner: a cscript child that never exits is killed; the page is neither closed nor killed while it lives; NVDA still stops', async () => {
  const guard = GATE();
  const nvda = gatedNvda(guard, { onPhys: (k) => (k === 'd' ? { live: true } : undefined) });
  const args = R1ARGS(nvda, { guard, liveWaitMs: 100 });
  const s = await runR1(args);
  assert.equal(s.attempts[0].status, 'focus-lost');
  assert.equal(s.send_guard.misdelivered, true);
  assert.equal(s.send_guard.unsettled, 1, 'the child is still alive when the summary is written');
  assert.equal(s.result, 'FAIL');
  assert.ok(at(nvda.calls, ['kill', 'd']) > 0, 'the child was killed');
  assert.ok(s.attempts[0].cleanup_errors.some((e) => e.includes('live send at teardown')));
  assert.equal(args.browser.calls.filter(([c]) => c === 'close' || c === 'kill').length, 0, 'target window not removed');
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 1);
  nvda.live.forEach((settle) => settle());
  assert.equal(guard.status().live, 0);
});

test('T12 teardown: live send at a signal -> no close or kill before liveWaitMs, then a deliberate, logged exit', async () => {
  const state = { aborted: false };
  const guard = GATE();
  const ev = evidenceWriter(tmp());
  const t = rigTeardown({ state, evidence: ev, guard, liveWaitMs: 150 });
  let signalAt = null;
  const nvda = gatedNvda(guard, { onPhys: (k) => { if (k === 'd') { signalAt = Date.now(); setImmediate(() => t.proc.emit('SIGTERM')); return { live: true }; } } });
  const args = R1ARGS(nvda, { guard, state, evidence: ev, liveWaitMs: 150 });
  runR1(args);
  const code = await t.done;
  const exitAt = Date.now();
  t.dispose();
  assert.equal(code, 130);
  assert.equal(args.browser.calls.filter(([c]) => c === 'close' || c === 'kill').length, 0, 'no close or kill while the child lives');
  assert.ok(exitAt - signalAt >= 150, `exited after ${exitAt - signalAt} ms, before liveWaitMs`);
  assert.ok(t.lines.some((l) => l.includes('live send at teardown')));
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 1);
  const s = JSON.parse(readFileSync(join(ev.dir, 'summary.json'), 'utf8'));
  assert.equal(s.result, 'FAIL', 'an unsettled send rules out PARTIAL');
  nvda.live.forEach((settle) => settle());
});

test('T12 teardown: the completion entry -> one awaited close per attempt, exit 0 for a persisted PASS; the done stop is not a failure', async () => {
  const state = { aborted: false };
  const guard = GATE();
  const ev = evidenceWriter(tmp());
  const reports = [];
  const t = rigTeardown({ state, evidence: ev, guard, report: (s) => reports.push(s.result) });
  const nvda = gatedNvda(guard);
  const args = R1ARGS(nvda, { guard, state, evidence: ev });
  const s = await runR1(args);
  assert.equal(s.result, 'PASS');
  t.teardown('run finished', { status: 'finished' });
  assert.equal(await t.done, 0);
  t.dispose();
  assert.equal(args.browser.calls.filter(([c]) => c === 'close').length, 3);
  const disk = JSON.parse(readFileSync(join(ev.dir, 'summary.json'), 'utf8'));
  assert.equal(disk.result, 'PASS');
  assert.equal(disk.status, 'finished');
  assert.equal(disk.send_guard.kind, 'done');
  assert.deepEqual(reports, ['PASS']);
  assert.equal(t.codes.length, 1);
});

test('T12 teardown: an uncaught exception mid-run -> crashed, FAIL, the error logged first, exit 1; a later rejection is only logged', async () => {
  const state = { aborted: false };
  const guard = GATE();
  const ev = evidenceWriter(tmp());
  const t = rigTeardown({ state, evidence: ev, guard });
  const nvda = gatedNvda(guard, { onPhys: (k) => { if (k === 'a') setImmediate(() => { t.proc.emit('uncaughtException', new Error('boom')); t.proc.emit('unhandledRejection', new Error('later')); }); } });
  runR1(R1ARGS(nvda, { guard, state, evidence: ev }));
  assert.equal(await t.done, 1);
  t.dispose();
  assert.match(t.lines[0], /uncaught exception.*boom/);
  assert.ok(t.lines.some((l) => l.includes('later') && l.includes('during teardown')));
  const s = JSON.parse(readFileSync(join(ev.dir, 'summary.json'), 'utf8'));
  assert.equal(s.status, 'crashed');
  assert.equal(s.result, 'FAIL');
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 1);
  assert.equal(t.codes.length, 1);
});

test('T12 teardown: the deadline ends a teardown that runs too long, with one exit and the summary rewritten', async () => {
  const state = { aborted: false };
  const guard = GATE();
  const ev = evidenceWriter(tmp());
  const t = rigTeardown({ state, evidence: ev, guard, liveWaitMs: 400, deadlineMs: 100 });
  const nvda = gatedNvda(guard, { onPhys: (k) => { if (k === 'd') { setImmediate(() => t.proc.emit('SIGINT')); return { live: true }; } } });
  runR1(R1ARGS(nvda, { guard, state, evidence: ev, liveWaitMs: 400 }));
  await t.done;
  assert.ok(t.codes[0][1] < 400, 'the deadline came before liveWaitMs');
  assert.ok(t.lines.some((l) => l.includes('deadline')));
  await delay(500);
  t.dispose();
  assert.equal(t.codes.length, 1, 'teardown finishing later does not exit again');
  assert.equal(JSON.parse(readFileSync(join(ev.dir, 'summary.json'), 'utf8')).result, 'FAIL');
  nvda.live.forEach((settle) => settle());
});

test('T12 teardown: listens to every signal and crash entry; dispose removes them all', () => {
  const t = rigTeardown({ state: { aborted: false }, evidence: evidenceWriter(tmp()), guard: GATE() });
  for (const e of TEARDOWN_EVENTS) assert.equal(t.proc.listenerCount(e), 1, e);
  t.dispose();
  for (const e of TEARDOWN_EVENTS) assert.equal(t.proc.listenerCount(e), 0, e);
});

test('T14 abort while typing character 2 of step 2 -> intent and action lines and a partial record on disk before slow cleanup', async () => {
  const state = { aborted: false };
  const guard = GATE();
  const ev = evidenceWriter(tmp());
  const t = rigTeardown({ state, evidence: ev, guard });
  const nvda = gatedNvda(guard, { onPhys: (k) => { if (k === 'd') t.proc.emit('SIGINT'); } });
  let atStop = null;
  const stop = nvda.stop;
  nvda.stop = async () => {
    atStop = { sends: readJsonl(join(ev.dir, 'sends-1.jsonl')), recs: readJsonl(join(ev.dir, 'attempt-1.jsonl')) };
    return stop();
  };
  runR1(R1ARGS(nvda, { guard, state, evidence: ev }));
  await t.done;
  t.dispose();
  const intents = atStop.sends.filter((l) => l.type === 'intent' && l.step === 2).map((l) => l.key);
  assert.deepEqual(intents, ['Control', 'A', 'Control', 'd']);
  assert.deepEqual(atStop.sends.filter((l) => l.type === 'action' && l.step === 2).map((l) => l.action), ['type A']);
  const partial = atStop.recs.at(-1);
  assert.equal(partial.partial, true);
  assert.equal(partial.step, 2);
  assert.deepEqual(partial.keys, ['A', 'd', 'a']);
  assert.deepEqual(partial.phrases, ['A']);
  assert.match(partial.error, /aborted/);
  const s = JSON.parse(readFileSync(join(ev.dir, 'summary.json'), 'utf8'));
  assert.equal(s.result, 'PARTIAL', 'a clean abort stays PARTIAL');
});

test('M02 summary: cleanup errors, a missing raw log, a gate stop or a crash rule out PASS; safety first even when aborted', () => {
  const three = () => [1, 2, 3].map((n) => healthyAttempt(n, `0000000${n}`));
  const sum = (o) => buildSummary({ cfg: CFG, runId: RUN, attempts: three(), status: 'finished', ...o });
  assert.equal(sum({}).result, 'PASS');
  const dirty = three();
  dirty[1].cleanup_errors = ['nvda.stop: timed out'];
  const a = sum({ attempts: dirty });
  assert.equal(a.result, 'FAIL');
  assert.ok(a.result_reasons.some((r) => r.includes('cleanup')));
  const noRaw = three();
  noRaw[2].raw = null;
  const b = sum({ attempts: noRaw });
  assert.equal(b.result, 'FAIL');
  assert.ok(b.result_reasons.some((r) => r.includes('raw')));
  assert.equal(sum({ guard: { stopped: true, kind: 'stop', misdelivered: false } }).result, 'FAIL');
  assert.equal(sum({ guard: { stopped: true, kind: 'done', misdelivered: false, live: 0, acks: { missing: 0 } } }).result, 'PASS', 'the completion stop is not a failure');
  assert.equal(sum({ status: 'crashed' }).result, 'FAIL');
  const aborted = (o) => sum({ status: 'aborted', ...o }).result;
  assert.equal(aborted({}), 'PARTIAL', 'a clean abort stays PARTIAL');
  assert.equal(aborted({ guard: { stopped: true, kind: 'stop', misdelivered: false, live: 0, acks: { missing: 0 } } }), 'PARTIAL');
  assert.equal(aborted({ guard: { stopped: true, kind: 'post', misdelivered: true, live: 0, acks: { missing: 0 } } }), 'FAIL');
  assert.equal(aborted({ guard: { stopped: true, kind: 'ack', misdelivered: false, live: 0, acks: { missing: 1 } } }), 'FAIL');
  assert.equal(aborted({ guard: { stopped: true, kind: 'stop', misdelivered: false, live: 1, acks: { missing: 0 } } }), 'FAIL');
  assert.equal(aborted({ interference: [{ after_attempt: 1, changes: ['x'] }] }), 'FAIL');
  assert.equal(aborted({ evidenceCheck: ['raw-1.json: changed'] }), 'FAIL');
  assert.equal(aborted({ evidence: { dir_recreated: true, write_errors: [] } }), 'FAIL');
});

test('D-37 evidence: one file deleted, truncated, changed or added during the run -> named, FAIL (M-03)', async () => {
  for (const [hurt, want] of [
    [(d) => rmSync(join(d, 'attempt-2.jsonl')), 'attempt-2.jsonl: missing'],
    [(d) => writeFileSync(join(d, 'focus-1.jsonl'), ''), 'focus-1.jsonl: truncated'],
    [(d) => writeFileSync(join(d, 'raw-1.json'), '[]\n'), 'raw-1.json: changed'],
    [(d) => writeFileSync(join(d, 'extra.txt'), 'x'), 'extra.txt: not written by this run'],
  ]) {
    const nvda = fakeNvda();
    let n = 0;
    const args = R1ARGS(nvda, { interference: () => { if (++n === 3) hurt(args.evidence.dir); return []; } });
    const s = await runR1(args);
    assert.equal(s.attempts.length, 3);
    assert.equal(s.result, 'FAIL', want);
    assert.ok(s.evidence_check.includes(want), `${want} in ${JSON.stringify(s.evidence_check)}`);
    assert.equal(JSON.parse(readFileSync(join(args.evidence.dir, 'summary.json'), 'utf8')).result, 'FAIL');
  }
});

test('T15 evidence: a file deleted mid-run is recovered from the journal as recovered-<name>; the damage stays flagged; FAIL', async () => {
  const nvda = fakeNvda();
  const args = R1ARGS(nvda, { interference: () => { rmSync(join(args.evidence.dir, 'attempt-1.jsonl')); return []; } });
  const s = await runR1(args);
  assert.equal(s.attempts.length, 1, 'damaged evidence stops the run');
  assert.ok(s.evidence_check.includes('attempt-1.jsonl: missing'));
  assert.equal(s.result, 'FAIL');
  const rec = readJsonl(join(args.evidence.dir, 'recovered-attempt-1.jsonl'));
  assert.equal(rec.length, 10);
  assert.deepEqual(rec[0].keys, ['Tab']);
  assert.ok(!s.evidence_check.some((f) => f.startsWith('recovered-')), 'the recovered copy is this run\'s own file');
});

test('D-37 evidence: a summary that cannot be written leaves persisted false (M-04)', async () => {
  const nvda = fakeNvda();
  let n = 0;
  const args = R1ARGS(nvda, { interference: () => { if (++n === 3) mkdirSync(join(args.evidence.dir, 'summary.json')); return []; } });
  const s = await runR1(args);
  assert.equal(args.state.persisted, false);
  assert.equal(s.result, 'FAIL');
});

test('T13 summary: only summary.json fails (EACCES, no extra file) -> FAIL, persisted false, summary and diagnostics on stderr', async () => {
  const lines = [];
  const denied = (f, body) => {
    if (basename(f) === 'summary.json') { const e = new Error('permission denied'); e.code = 'EACCES'; throw e; }
    writeFileSync(f, body);
  };
  const nvda = fakeNvda();
  const args = R1ARGS(nvda, { diag: (l) => lines.push(l) });
  args.evidence = evidenceWriter(args.evidence.dir, { write: denied });
  const s = await runR1(args);
  assert.equal(args.state.persisted, false);
  assert.equal(s.result, 'FAIL');
  assert.ok(s.result_reasons.includes('summary.json not persisted'));
  assert.ok(!existsSync(join(args.evidence.dir, 'summary.json')));
  assert.deepEqual(readdirSync(args.evidence.dir).filter((f) => !/^(attempt|focus|raw|sends)-\d\.jsonl?$/.test(f)), [], 'no extra file');
  const out = lines.find((l) => l.includes('summary not persisted'));
  assert.ok(out, 'the summary went to stderr');
  assert.match(out, /"result": ?"FAIL"/);
  assert.match(out, /EACCES/, 'the writer diagnostics too');
});

test('T13 summary: still changing after 3 rounds -> FAIL "summary not stable", persisted false, on stderr', () => {
  let i = 0;
  const written = [];
  const evidence = {
    verify: () => [`raw-1.json: changed ${i++}`],
    summary: (s) => written.push(s),
    status: () => ({ dir_recreated: false, write_errors: [] }),
    recover: () => {},
  };
  const lines = [];
  const state = {};
  const s = writeSummary({ evidence, state, diag: (l) => lines.push(l), build: (found) => ({ result: 'FAIL', result_reasons: [...found] }) });
  assert.equal(written.length, 3, 'three rounds, no more');
  assert.equal(state.persisted, false);
  assert.equal(s.result, 'FAIL');
  assert.ok(s.result_reasons.includes('summary not stable'));
  assert.ok(lines.some((l) => l.includes('summary not persisted')));
});

test('D-37 abort: the aborted summary is on disk before cleanup starts; the gate is stopped (M-05)', async () => {
  const out = tmp();
  const state = { aborted: false };
  const guard = GATE();
  const ev = evidenceWriter(out);
  const t = rigTeardown({ state, evidence: ev, guard });
  const nvda = gatedNvda(guard, { hangAt: 4, onHang: () => setImmediate(() => t.proc.emit('SIGINT')) });
  let atStop = null;
  const stop = nvda.stop;
  nvda.stop = async () => {
    const f = join(out, 'summary.json');
    atStop = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).status : null;
    return stop();
  };
  runR1(R1ARGS(nvda, { guard, state, evidence: ev }));
  await t.done;
  t.dispose();
  assert.equal(atStop, 'aborted');
  const s = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
  assert.equal(s.send_guard.kind, 'stop');
  assert.equal(s.result, 'PARTIAL');
  assert.equal(state.persisted, true);
});

test('D-37 cleanup: an nvda.start that outlives its timeout is still stopped (M-01)', async () => {
  const nvda = fakeNvda();
  const start = nvda.start;
  nvda.start = (o) => new Promise((r) => setTimeout(() => r(start(o)), 60));
  const a = await runAttempt(ARGS(nvda, { cfg: { ...FAST, load_timeout_ms: 10 } }));
  assert.equal(a.status, 'setup-failed');
  assert.match(a.error, /nvda\.start: timed out/);
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 1, 'the late NVDA was stopped');
});

test('D-37 diag: the first error and each cleanup error reach the CI log, in order (M-06)', async () => {
  const lines = [];
  const nvda = fakeNvda({ hangAt: 2 });
  nvda.stop = async () => { nvda.calls.push(['stop']); throw new Error('stop failed'); };
  await runAttempt(ARGS(nvda, { diag: (l) => lines.push(l) }));
  assert.equal(lines.length, 2);
  assert.match(lines[0], /timed-out: step 2 timed out/);
  assert.match(lines[1], /cleanup: nvda\.stop: stop failed/);
});

test('T24 diag (M-06): the first error reaches the CI log before its step record is written', async () => {
  const order = [];
  const nvda = fakeNvda();
  const args = ARGS(nvda, {
    // Checks: 0 = wait, 1 = before NVDA+T, 2 = Tab (step 1), 3 = 'A', 4 = 'd' -> foreign window.
    fg: fakeFg(nvda, (i, n) => (i === 4 ? { pid: 999, title: 'Notepad' } : OURS(n))),
    diag: (l) => order.push(`diag ${l.split(': ')[1]}`),
  });
  const ev = args.evidence;
  args.evidence = { ...ev, record: (n, rec) => { order.push(`record ${rec.step}`); ev.record(n, rec); } };
  const a = await runAttempt(args);
  assert.equal(a.status, 'focus-lost');
  assert.deepEqual(order, ['record 1', 'diag focus-lost', 'record 2']);
});

test('D-37 cleanup: an nvda.start still pending after cleanup gets a stop attached and is recorded (M-01)', async () => {
  const nvda = fakeNvda();
  const start = nvda.start;
  nvda.start = (o) => new Promise((r) => setTimeout(() => r(start(o)), 400));
  const a = await runAttempt(ARGS(nvda, { cfg: { ...FAST, load_timeout_ms: 10 } }));
  assert.ok(a.cleanup_errors.some((e) => e.includes('stop attached')));
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 0, 'not started yet');
  await delay(400);
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 1, 'stopped once it came up');
});

test('D-39 runner: a send that arrives after its action resolved is refused and stops the run', async () => {
  const guard = GATE();
  const nvda = gatedNvda(guard);
  const press = nvda.press;
  let late = false;
  nvda.press = async (k, o) => {
    const r = await press(k, o);
    if (!late) { late = true; setImmediate(() => nvda.dispatch('stopSpeech', chord('stopSpeech')).catch(() => {})); }
    return r;
  };
  const s = await runR1(R1ARGS(nvda, { guard }));
  assert.equal(physOf(nvda.calls).filter((k) => k === 'stopSpeech').length, physOf(nvda.calls).filter((k) => k !== 'stopSpeech').length, 'the late send never went out');
  assert.equal(s.send_guard.kind, 'protocol');
  // It reaches the gate while an action is still armed or after it ended; either way it is refused.
  assert.match(s.send_guard.reason, /outside an action|action ended during its check|in flight/);
  assert.equal(s.attempts.length, 1);
  assert.equal(s.result, 'FAIL');
});

test('D-37 cleanup: a page open that outlives its timeout is killed when it arrives (M-01)', async () => {
  const nvda = fakeNvda();
  const browser = fakeBrowser(nvda);
  const open = browser.open;
  browser.open = (u) => new Promise((r) => setTimeout(() => r(open(u)), 500));
  const a = await runAttempt(ARGS(nvda, { browser, cfg: { ...FAST, load_timeout_ms: 10, cleanup_timeout_ms: 50 } }));
  assert.match(a.error, /page open: timed out/);
  assert.ok(a.cleanup_errors.some((e) => e.includes('kill attached')));
  await delay(500);
  assert.deepEqual(browser.calls.map(([c]) => c), ['open', 'kill']);
});

test('D-39 abort: a signal during the foreground check before a key -> that key is never sent (M-01)', async () => {
  const state = { aborted: false };
  const guard = GATE();
  const ev = evidenceWriter(tmp());
  const t = rigTeardown({ state, evidence: ev, guard });
  const nvda = gatedNvda(guard);
  let i = 0;
  // Check 3 is the runner's check before step 1's Tab: the signal lands while it is pending.
  const fg = { check: async () => { if (++i === 3) { t.proc.emit('SIGINT'); await delay(20); } return OURS(nvda.nonce()); } };
  runR1(R1ARGS(nvda, { guard, fg, state, evidence: ev }));
  await t.done;
  t.dispose();
  await delay(50);
  assert.ok(!physOf(nvda.calls).includes('Tab'));
});

test('workflowGuardErrors: manual r1.yml on main of this repository at GITHUB_SHA only (S-02)', () => {
  const head = 'a'.repeat(40);
  const ok = {
    GITHUB_SHA: head, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'ANIRUDDH-001/Tabwise', GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF: 'ANIRUDDH-001/Tabwise/.github/workflows/r1.yml@refs/heads/main',
  };
  assert.deepEqual(workflowGuardErrors(ok, head), []);
  for (const [k, v] of [
    ['GITHUB_SHA', ''], ['GITHUB_SHA', undefined], ['GITHUB_SHA', 'b'.repeat(40)], ['GITHUB_EVENT_NAME', 'push'],
    ['GITHUB_REPOSITORY', 'someone/Tabwise'], ['GITHUB_REF', 'refs/heads/dev'], ['GITHUB_REF', 'refs/tags/main'],
    ['GITHUB_WORKFLOW_REF', 'ANIRUDDH-001/Tabwise/.github/workflows/other.yml@refs/heads/main'],
  ]) assert.equal(workflowGuardErrors({ ...ok, [k]: v }, head).length, 1, `${k}=${v}`);
});

test('workflow r1.yml: SHA-pinned actions, main only, read-only checkout, evidence must exist (S-01, S-02, S-04, M-07)', () => {
  const yml = R1_YML.replace(/\r\n/g, '\n');
  const uses =[...yml.matchAll(/uses: ([^\s#]+)/g)].map((m) => m[1]);
  assert.equal(uses.length, 3);
  for (const u of uses) assert.match(u, /^actions\/[\w-]+@[0-9a-f]{40}$/, `${u} is not pinned to a full commit SHA`);
  assert.match(yml, /^\s{4}if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'$/m);
  assert.match(yml, /if-no-files-found: error/);
  const ro = yml.indexOf('IsReadOnly');
  assert.ok(ro > yml.lastIndexOf('npx --no-install playwright install') && ro < yml.indexOf('npm test'), 'read-only after installs, before tests');
  assert.match(yml, /node_modules\/@guidepup\/guidepup\/lib/);
  const diag = yml.indexOf('_runner');
  assert.ok(diag > yml.indexOf('npm run r1') && diag < yml.indexOf('actions/upload-artifact'), 'job diagnostic before upload');
});

test('T24 workflow r1.yml (S-04): evidence contract after the upload, summary_files in job.json, nvda.log scrubbed and capped', () => {
  const yml = R1_YML.replace(/\r\n/g, '\n');
  const contract = yml.indexOf('- name: Evidence contract');
  assert.ok(contract > yml.indexOf('actions/upload-artifact'), 'contract step after the upload');
  const step = yml.slice(contract);
  assert.match(step, /^\s+if: always\(\)$/m);
  assert.match(step, /steps\.r1\.outcome/);
  assert.match(step, /r1-\*/);
  assert.match(step, /summary\.json/);
  assert.match(step, /exit 1/);
  assert.doesNotMatch(step, /uses:/, 'no new action');
  const diagStep = yml.slice(yml.indexOf('- name: Job diagnostic'), yml.indexOf('- name: Upload evidence'));
  assert.match(diagStep, /summary_files/);
  assert.match(diagStep, /node scripts\/r1\.mjs --scrub-log /);
  assert.doesNotMatch(diagStep, /Copy-Item[^\n]*nvda\.log/, 'nvda.log is not copied raw');
});

test('T24 scrubLog: local paths replaced, output capped at 1 MiB with a marker', () => {
  const cwd = process.cwd();
  const s = scrubLog(`opened ${cwd}\\fixtures\\r1 and C:\\Users\\someone\\x.txt`);
  assert.ok(!s.includes(cwd));
  assert.doesNotMatch(s, /C:\\Users/);
  const big = scrubLog('x'.repeat(3 * 1024 * 1024));
  assert.ok(Buffer.byteLength(big) <= 1024 * 1024 + 100);
  assert.match(big, /truncated/);
});

test('evidence listing: real path with spaces and non-ASCII, same-size edits, sentinel and root creation (M-08)', () => {
  const base = tmp();
  const root = join(base, 'Meta AI é 証拠');
  const url = pathToFileURL(root);
  assert.equal(resolve(fileURLToPath(url)), resolve(root));
  assert.notEqual(resolve(url.pathname.replace(/^\/([A-Za-z]:)/, '$1')), resolve(root), 'pathname is percent-encoded');
  assert.deepEqual(listing(root), ['<root missing>']);
  mkdirSync(join(root, 'r1'), { recursive: true });
  const empty = listing(root);
  assert.notDeepEqual(empty, ['<root missing>'], 'creating the root is a change');
  writeFileSync(join(root, 'r1', 'sentinel.json'), 'aaaa');
  const seeded = listing(root);
  assert.notDeepEqual(seeded, empty);
  writeFileSync(join(root, 'r1', 'sentinel.json'), 'bbbb');
  assert.notDeepEqual(listing(root), seeded, 'same size, different content');
  writeFileSync(join(root, 'r1', 'sentinel.json'), 'aaaa');
  assert.deepEqual(listing(root), seeded);
});

test('repoSnapshot: with no ignore prefix every dirty path counts (evidence lives outside the checkout)', () => {
  const git = (a) => (a[0] === 'rev-parse' ? 'h\n' : ' M docs/evidence/r1/x/summary.json\n?? new.txt\n');
  assert.equal(repoSnapshot({ git, hashes: {}, tests: {} }).dirty.length, 2);
});

// Replaces 'r1.mjs: send guard hooked and checked, dependency lock and workflow guard, all before Guidepup
// loads (D-37)': the hooks are gone; the vendored tree is checked and the gate set before it loads.
test('T11/T12/T17/T18 r1.mjs: vendor tree lock, gate and upstream refusal before the vendored load; one teardown; signal options', () => {
  const src = readFileSync(new URL('../scripts/r1.mjs', import.meta.url), 'utf8');
  const at = (s, from = 0) => { const i = src.indexOf(s, from); assert.ok(i > 0, `missing ${s}`); return i; };
  const adapter = readFileSync(new URL('../src/speech/browser.mjs', import.meta.url), 'utf8');
  const cap = readFileSync(new URL('../src/speech/capture.mjs', import.meta.url), 'utf8');
  const load = at("vreq('./lib/windows/NVDA/NVDA.js')");
  const firstVendor = at('vreq(');
  assert.ok(at('workflowGuardErrors(process.env') < firstVendor);
  assert.ok(at('treeHash(') < firstVendor && at('lock.vendor_tree') < firstVendor, 'T17: vendor tree checked before anything vendored loads');
  assert.ok(at('setGate(') < load, 'gate set before NVDA.js loads');
  assert.ok(at('upstreamLoaded(') < load && at('upstreamLoaded(', load) > load, 'T11: upstream refused before and after the load');
  assert.ok(at('setIntegrity(') < at('runR1('), 'integrity check in every admit');
  assert.doesNotMatch(src, /import\('@guidepup\/guidepup'\)|installSendGuard|hooks\.verify/);
  // T18
  assert.match(src, /const browser = fixtureBrowser\(\{ chromium, cfg, versions \}\)/);
  const launch = adapter.slice(adapter.indexOf('launchServer('), adapter.indexOf('launchServer(') + 300);
  for (const o of ['handleSIGINT: false', 'handleSIGTERM: false', 'handleSIGHUP: false']) assert.ok(launch.includes(o), o);
  // T12: one teardown; nothing after it exits or kills by itself.
  const td = at('installTeardown(');
  assert.doesNotMatch(src.slice(td), /process\.exit\(|killAll/);
  assert.doesNotMatch(src, /killAll/);
  assert.match(src.slice(td), /await finishRun\(\{ failed, state, teardown \}\)/);
  assert.match(cap, /teardown\('run finished', \{ status: 'finished' \}\)/);
  // D-39 decision 1: the page keydown counter, installed before the page loads.
  assert.ok(adapter.indexOf('addInitScript(') > 0 && adapter.indexOf('addInitScript(') < adapter.indexOf('page.goto('));
  assert.match(adapter, /__r1Keys/);
  assert.match(src, /RUNNER_TEMP/);
  assert.doesNotMatch(src, /docs\/evidence\/r1\/\$\{runId\}/, 'evidence is not written into the checkout');
});

// ---------- D-42 (D-39 exception): D39-B01, M01, S01, S02 regression tests from Codex's P04, P05, P06, X04 ----------
test('D39-B01 runner (P04): Tab, Control, A on the page in the Tab window -> the Tab ack fails; the dropped A is never confirmed', async () => {
  const guard = GATE();
  let tabs = 0;
  const nvda = gatedNvda(guard, { onPhys: (k) => {
    if (k === 'Tab' && ++tabs === 1) return { extra: ['stopSpeech', 'A'] };
    if (k === 'A') return { drop: true };
    return undefined;
  } });
  const s = await runR1(R1ARGS(nvda, { guard }));
  assert.equal(s.result, 'FAIL');
  assert.equal(s.send_guard.kind, 'ack');
  assert.equal(s.send_guard.misdelivered, true);
  assert.equal(s.send_guard.acks.confirmed, 0);
  assert.deepEqual(physOf(nvda.calls), ['stopSpeech', 'NVDA-T', 'stopSpeech', 'Tab'], 'nothing after the failed ack');
});

test('D39-B01 runner: a stray A between sends is caught by the pre-send log check; the next key is never sent', async () => {
  const guard = GATE();
  let tabs = 0;
  const nvda = gatedNvda(guard, { onPhys: (k) => {
    if (k === 'Tab' && ++tabs === 1) return { after: (toPage) => toPage('A') };
    if (k === 'A') return { drop: true };
    return undefined;
  } });
  const s = await runR1(R1ARGS(nvda, { guard }));
  assert.equal(s.result, 'FAIL');
  assert.equal(s.send_guard.kind, 'ack');
  assert.equal(s.send_guard.misdelivered, true);
  assert.equal(s.send_guard.acks.confirmed, 1, 'only the Tab');
  assert.deepEqual(physOf(nvda.calls), ['stopSpeech', 'NVDA-T', 'stopSpeech', 'Tab'], 'the stop-speech chord before A is refused');
});

test('D39-M01 P05: a crash during a signal teardown -> FAIL with the crash in the summary; status aborted, one exit, 130', async () => {
  let finish;
  const state = { aborted: false, attempts: [], finish: () => new Promise((r) => { finish = r; }) };
  const guard = GATE();
  const ev = evidenceWriter(tmp());
  const t = rigTeardown({ state, evidence: ev, guard });
  t.proc.emit('SIGINT');
  await delay(5);
  assert.equal(JSON.parse(readFileSync(join(ev.dir, 'summary.json'), 'utf8')).result, 'PARTIAL', 'a clean abort first');
  t.proc.emit('uncaughtException', new Error('boom'));
  const mid = JSON.parse(readFileSync(join(ev.dir, 'summary.json'), 'utf8'));
  assert.equal(mid.result, 'FAIL', 'the crash is written at once, before cleanup ends');
  finish();
  assert.equal(await t.done, 130);
  t.dispose();
  const s = JSON.parse(readFileSync(join(ev.dir, 'summary.json'), 'utf8'));
  assert.equal(s.status, 'aborted');
  assert.equal(s.result, 'FAIL');
  assert.ok(s.result_reasons.some((r) => /crash.*during teardown.*boom/.test(r)), JSON.stringify(s.result_reasons));
  assert.deepEqual(t.codes.map(([c]) => c), [130]);
  assert.ok(t.lines.some((l) => l.includes('boom') && l.includes('during teardown')));
});

test('D39-M01: a crash during the completion teardown of a PASS run -> FAIL, exit 1 (not 0)', async () => {
  const state = { aborted: false };
  const guard = GATE();
  const ev = evidenceWriter(tmp());
  const t = rigTeardown({ state, evidence: ev, guard });
  const nvda = gatedNvda(guard);
  const s0 = await runR1(R1ARGS(nvda, { guard, state, evidence: ev }));
  assert.equal(s0.result, 'PASS');
  let finish;
  const cleanup = state.finish;
  state.finish = async () => { await new Promise((r) => { finish = r; }); return cleanup?.(); };
  t.teardown('run finished', { status: 'finished' });
  t.proc.emit('unhandledRejection', new Error('late failure'));
  finish();
  assert.equal(await t.done, 1);
  t.dispose();
  const s = JSON.parse(readFileSync(join(ev.dir, 'summary.json'), 'utf8'));
  assert.equal(s.status, 'finished');
  assert.equal(s.result, 'FAIL');
  assert.ok(s.result_reasons.some((r) => /during teardown.*late failure/.test(r)));
});

test('D39-S01 P06: a summary-only write error shows in the returned summary\'s evidence.write_errors, not only on stderr', async () => {
  const denied = (f, body) => {
    if (basename(f) === 'summary.json') { const e = new Error('permission denied'); e.code = 'EACCES'; throw e; }
    writeFileSync(f, body);
  };
  const args = R1ARGS(fakeNvda());
  args.evidence = evidenceWriter(args.evidence.dir, { write: denied });
  const s = await runR1(args);
  assert.equal(args.state.persisted, false);
  assert.equal(s.result, 'FAIL');
  assert.deepEqual(s.evidence.write_errors.filter((e) => e.startsWith('summary.json')), ['summary.json: EACCES']);
  assert.ok(s.result_reasons.some((r) => r.startsWith('evidence write errors')));
  assert.ok(s.result_reasons.includes('summary.json not persisted'));
});

test('D39-S02 X04: the lock pins exactly the upstream files r1.mjs requires; a missing, extra, changed or empty entry is refused', async () => {
  const { UPSTREAM_PINS, pinErrors } = await import('../src/speech/vendortree.mjs');
  const lock = JSON.parse(readFileSync(new URL('../fixtures/r1/lock.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(lock.dependencies).sort(), [...UPSTREAM_PINS].sort());
  const actual = { ...lock.dependencies };
  assert.deepEqual(pinErrors(lock.dependencies, actual), []);
  const [first, ...rest] = UPSTREAM_PINS;
  const missing = Object.fromEntries(rest.map((k) => [k, actual[k]]));
  assert.match(pinErrors(missing, actual).join(' '), new RegExp(`missing.*${first.replace(/[.*+?^${}()|[\]\/]/g, '\$&')}`));
  assert.match(pinErrors({ ...lock.dependencies, 'node_modules/x.js': 'ab' }, actual).join(' '), /not expected.*node_modules\/x\.js/);
  assert.match(pinErrors(lock.dependencies, { ...actual, [first]: 'changed' }).join(' '), /differs/);
  assert.ok(pinErrors({}, actual).length >= UPSTREAM_PINS.length);
  assert.ok(pinErrors(undefined, actual).length >= UPSTREAM_PINS.length);
  const src = readFileSync(new URL('../scripts/r1.mjs', import.meta.url), 'utf8');
  // Execute the runner's exact dependency-admission expression with incomplete maps; no process or import.
  const expression = /^const depChanged = (.+?);/m.exec(src)?.[1];
  assert.ok(expression);
  const runtimeCheck = new Function('lock', 'deps', 'pinErrors', 'lockMismatches', `return ${expression}`);
  assert.ok(runtimeCheck({ dependencies: missing }, actual, pinErrors, lockMismatches).length, 'runtime dependency admission must refuse a missing pin');
  assert.ok(runtimeCheck({ dependencies: {} }, actual, pinErrors, lockMismatches).length, 'runtime dependency admission must refuse an empty pin map');
  assert.match(src, /pinErrors\(lock\.dependencies, deps\)/, 'r1.mjs refuses on pinErrors');
});

test('D43 terminal evidence: an unexplained page key during raw collection cannot produce PASS', async () => {
  const guard = GATE();
  const nvda = gatedNvda(guard);
  const raw = nvda.spokenPhraseLog;
  nvda.spokenPhraseLog = async () => {
    const result = await raw();
    nvda.keylog.push({ seq: (nvda.keylog.at(-1)?.seq ?? 0) + 1, key: 'X', shift: true });
    return result;
  };
  const s = await runR1(R1ARGS(nvda, { guard }));
  assert.equal(s.result, 'FAIL');
  assert.equal(s.attempts.length, 1);
  assert.ok(s.send_guard.stopped);
});

test('D43 process freshness: a resolved start without reset and PID evidence cannot claim a new process', async () => {
  const nvda = fakeNvda();
  const start = nvda.start;
  nvda.start = async (opts) => { await start(opts); return undefined; };
  const s = await runR1(R1ARGS(nvda));
  assert.equal(s.result, 'FAIL');
  assert.equal(s.attempts[0].new_process, false);
  assert.match(s.attempts[0].error, /identity|PID|reset|process/i);
});

test('D43 send evidence: an intent-journal write failure refuses physical input', async () => {
  const guard = GATE();
  const nvda = gatedNvda(guard);
  const args = R1ARGS(nvda, { guard });
  args.evidence = evidenceWriter(args.evidence.dir, { append: (file, body) => {
    if (basename(file).startsWith('sends-')) throw Object.assign(new Error('denied'), { code: 'EACCES' });
    // This test only denies the send journal; every other record keeps its normal persistence path.
    writeFileSync(file, existsSync(file) ? readFileSync(file, 'utf8') + body : body);
  } });
  const s = await runR1(args);
  assert.equal(s.result, 'FAIL');
  assert.deepEqual(physOf(nvda.calls), []);
  assert.ok(s.evidence.write_errors.some((e) => e.includes('sends-')));
});
