// F-02 (R1) offline tests: validator, runner core with fake NVDA and browser, SIGINT path, server, lock.
// No real NVDA, browser or network beyond 127.0.0.1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RECORD_FIELDS, recordErrors, isChecked, isNotChecked, typedText, stepFailures,
  settingsMismatch, judgeAttempt, judgeRun,
} from '../src/speech/validate.mjs';
import {
  withTimeout, runAttempt, runR1, installAbort, serveDir, evidenceWriter, specText, lockMismatches,
} from '../src/speech/capture.mjs';

const CFG = JSON.parse(readFileSync(new URL('../fixtures/r1/steps.json', import.meta.url), 'utf8'));
const FAST = { ...CFG, action_timeout_ms: 200, cleanup_timeout_ms: 200, focus_delay_ms: 0 };
const RUN = 'r1-test';

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
    keyboardCommands: { reportTitle: { representation: 'NVDA-T' } },
    async start(opts) {
      calls.push(['start', opts]);
      running = true;
      action = 0; titleTries = 0;
      session = settings ?? { keyboard: { ...opts?.settings?.keyboard } };
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
    async press(key, opts) {
      if (key === 'Alt+Escape') { calls.push(['press', key, opts]); speak(''); return; }
      return act('press', key);
    },
    async type(ch) { return act('type', ch); },
    async lastSpokenPhrase() { return log.at(-1) ?? ''; },
    async spokenPhraseLog() { return log; },
    async clearSpokenPhraseLog() { calls.push(['clear']); log = []; },
  };
}

function fakeBrowser(nvda) {
  const calls = [];
  return {
    calls,
    async open(url) {
      calls.push(['open', url]);
      nvda.setNonce(new URL(url).searchParams.get('nonce'));
      return { close: async () => { calls.push(['close']); } };
    },
  };
}

const tmp = () => mkdtempSync(join(tmpdir(), 'r1-test-'));
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
  const a = await runAttempt({ nvda, browser, cfg: FAST, runId: RUN, attempt: 1, nonce: '0a1b2c3d', baseUrl: 'http://127.0.0.1:1', evidence: ev, state });
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

test('runAttempt: focus routine presses Alt+Escape until the title has the nonce', async () => {
  const nvda = fakeNvda({ titles: (n, i) => (i < 2 ? 'Program Manager' : `R1 sign-up ${n} - Chromium`) });
  const a = await runAttempt({ nvda, browser: fakeBrowser(nvda), cfg: FAST, runId: RUN, attempt: 1, nonce: '0a1b2c3d', baseUrl: 'http://127.0.0.1:1', evidence: evidenceWriter(tmp()), state: { aborted: false } });
  assert.equal(a.status, 'completed');
  assert.equal(a.focus_tries, 3);
  assert.equal(nvda.calls.filter(([c, k]) => c === 'press' && k === 'Alt+Escape').length, 2);
  assert.match(a.title_phrase, /0a1b2c3d/);
  const clearAt = nvda.calls.findIndex(([c]) => c === 'clear');
  const firstTab = nvda.calls.findIndex(([c, k]) => c === 'press' && k === 'Tab');
  assert.ok(clearAt > 0 && clearAt < firstTab, 'log cleared after focus, before step 1');
});

test('runAttempt: title never has the nonce -> setup-failed, no steps, cleanup runs', async () => {
  const nvda = fakeNvda({ titles: () => 'Program Manager' });
  const browser = fakeBrowser(nvda);
  const a = await runAttempt({ nvda, browser, cfg: FAST, runId: RUN, attempt: 1, nonce: '0a1b2c3d', baseUrl: 'http://127.0.0.1:1', evidence: evidenceWriter(tmp()), state: { aborted: false } });
  assert.equal(a.status, 'setup-failed');
  assert.equal(a.focus_tries, CFG.focus_retries + 1);
  assert.equal(a.records.length, 0);
  assert.equal(nvda.calls.filter(([c, k]) => c === 'press' && k !== 'Alt+Escape').length, 0);
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 1);
  assert.equal(browser.calls.filter(([c]) => c === 'close').length, 1);
});

test('runAttempt: C1 read-back mismatch -> setup-failed before any page or step', async () => {
  const nvda = fakeNvda({ settings: { keyboard: { speakTypedCharacters: 0, speakTypedWords: 0 } } });
  const browser = fakeBrowser(nvda);
  const a = await runAttempt({ nvda, browser, cfg: FAST, runId: RUN, attempt: 1, nonce: '0a1b2c3d', baseUrl: 'http://127.0.0.1:1', evidence: evidenceWriter(tmp()), state: { aborted: false } });
  assert.equal(a.status, 'setup-failed');
  assert.match(a.error, /speakTypedCharacters/);
  assert.equal(browser.calls.length, 0);
  assert.equal(nvda.calls.filter(([c]) => c === 'press' || c === 'type').length, 0);
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 1);
});

test('runAttempt: an action that never returns times out, is recorded, attempt stops', async () => {
  const nvda = fakeNvda({ hangAt: 4 }); // 5th action = step 3 Tab
  const out = tmp();
  const a = await runAttempt({ nvda, browser: fakeBrowser(nvda), cfg: FAST, runId: RUN, attempt: 1, nonce: '0a1b2c3d', baseUrl: 'http://127.0.0.1:1', evidence: evidenceWriter(out), state: { aborted: false } });
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
    nvda, browser: fakeBrowser(nvda), cfg: FAST, runId: RUN, baseUrl: 'http://127.0.0.1:1',
    evidence: evidenceWriter(out), state: { aborted: false }, nonce: () => `0000000${++n}`, meta: { evidence_dir: 'docs/evidence/r1/r1-test' },
  });
  assert.equal(summary.result, 'PASS');
  assert.deepEqual(readdirSync(out).sort(), ['attempt-1.jsonl', 'attempt-2.jsonl', 'attempt-3.jsonl', 'raw-1.json', 'raw-2.json', 'raw-3.json', 'summary.json']);
  const onDisk = readFileSync(join(out, 'summary.json'), 'utf8');
  assert.equal(JSON.parse(onDisk).result, 'PASS');
  assert.doesNotMatch(onDisk, /[A-Za-z]:\\\\|"\/(Users|home|tmp)/, 'no absolute paths');
  assert.equal(nvda.calls.filter(([c]) => c === 'start').length, 3);
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 3);
});

test('runR1: setup failure in attempt 1 stops the run and allows a rerun', async () => {
  const nvda = fakeNvda({ titles: () => 'Program Manager' });
  const summary = await runR1({
    nvda, browser: fakeBrowser(nvda), cfg: FAST, runId: RUN, baseUrl: 'http://127.0.0.1:1',
    evidence: evidenceWriter(tmp()), state: { aborted: false }, nonce: () => '0a1b2c3d', meta: {},
  });
  assert.equal(summary.result, 'FAIL');
  assert.equal(summary.rerun_allowed, true);
  assert.equal(summary.attempts.length, 1);
});

// ---------- C3: SIGINT ----------
test('SIGINT mid-step: cleanup tried, partial evidence "aborted", exit 130', async () => {
  const out = tmp();
  const state = { aborted: false };
  let exitCode = null;
  let exited;
  const done = new Promise((r) => { exited = r; });
  const nvda = fakeNvda({ hangAt: 4, onHang: () => setImmediate(() => process.emit('SIGINT')) });
  const browser = fakeBrowser(nvda);
  const ev = evidenceWriter(out);
  const before = process.listenerCount('SIGINT');
  const dispose = installAbort({ proc: process, state, evidence: ev, cfg: FAST, runId: RUN, meta: {}, exit: (c) => { exitCode = c; exited(); } });
  try {
    runR1({ nvda, browser, cfg: FAST, runId: RUN, baseUrl: 'http://127.0.0.1:1', evidence: ev, state, nonce: () => '0a1b2c3d', meta: {} });
    await done;
  } finally { dispose(); }
  assert.equal(exitCode, 130);
  assert.equal(nvda.calls.filter(([c]) => c === 'stop').length, 1);
  assert.equal(browser.calls.filter(([c]) => c === 'close').length, 1);
  const s = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
  assert.equal(s.status, 'aborted');
  assert.equal(s.result, 'PARTIAL');
  assert.deepEqual(s.reached, { attempt: 1, step: 3 });
  assert.equal(readJsonl(join(out, 'attempt-1.jsonl')).length, 2);
  assert.ok(existsSync(join(out, 'raw-1.json')));
  assert.equal(process.listenerCount('SIGINT'), before, 'handlers removed');
});

test('second SIGINT exits at once even while cleanup hangs', async () => {
  const state = { aborted: false };
  const codes = [];
  let exited;
  const done = new Promise((r) => { exited = r; });
  const nvda = fakeNvda({ hangAt: 0, stopHangs: true, onHang: () => setImmediate(() => { process.emit('SIGINT'); setImmediate(() => process.emit('SIGINT')); }) });
  const ev = evidenceWriter(tmp());
  const slow = { ...FAST, cleanup_timeout_ms: 3000 }; // first handler's cleanup would take 3 s
  const dispose = installAbort({ proc: process, state, evidence: ev, cfg: slow, runId: RUN, meta: {}, exit: (c) => { codes.push(c); exited(); } });
  const t0 = Date.now();
  try {
    runR1({ nvda, browser: fakeBrowser(nvda), cfg: slow, runId: RUN, baseUrl: 'http://127.0.0.1:1', evidence: ev, state, nonce: () => '0a1b2c3d', meta: {} });
    await done;
  } finally { dispose(); }
  assert.deepEqual(codes, [130]);
  assert.ok(Date.now() - t0 < 1000, `exited after ${Date.now() - t0} ms, not at once`);
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
  assert.equal(CFG.focus_retries, 10);
});
