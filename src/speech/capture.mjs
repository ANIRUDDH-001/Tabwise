// R1 runner core (PLAN F-02, D-33, D-34). NVDA and the browser are injected, so the tests use fakes.
// nvda: Guidepup's nvda object. browser.open(url) -> {close()}. evidence: evidenceWriter(dir).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { actionsOf, judgeRun, settingsMismatch } from './validate.mjs';

const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const errText = (e) => (e?.message ?? String(e)) + (e?.cause?.message ? `: ${e.cause.message}` : '');
export const randomNonce = () => randomBytes(4).toString('hex');

// Never rejects: {value, timedOut, error}. The timer is not unref'd, so a hung action can't let the process exit early.
export function withTimeout(promise, ms) {
  let t;
  return Promise.race([
    Promise.resolve(promise).then(
      (value) => ({ value, timedOut: false, error: null }),
      (e) => ({ value: undefined, timedOut: false, error: errText(e) }),
    ),
    new Promise((r) => { t = setTimeout(() => r({ value: undefined, timedOut: true, error: null }), ms); }),
  ]).finally(() => clearTimeout(t));
}

const once = (fn) => { let p; return () => (p ??= fn()); };

// Evidence holds relative paths only: local folders are replaced before anything is written.
const LOCAL = [process.cwd(), process.env.LOCALAPPDATA, homedir()].filter(Boolean).sort((a, b) => b.length - a.length);
const NAMES = new Map([[process.cwd(), '.'], [process.env.LOCALAPPDATA, '%LOCALAPPDATA%'], [homedir(), '~']]);
export function scrub(s) {
  let out = s;
  for (const p of LOCAL) out = out.split(p).join(NAMES.get(p)).split(p.toLowerCase()).join(NAMES.get(p));
  return out.replace(/[A-Za-z]:\\[^\s"'<>|]*/g, '<path>');
}
const toJson = (v, space) => JSON.stringify(v, (_, x) => (typeof x === 'string' ? scrub(x) : x), space);

export function evidenceWriter(dir) {
  mkdirSync(dir, { recursive: true });
  return {
    dir,
    start(n) { appendFileSync(join(dir, `attempt-${n}.jsonl`), ''); },
    record(n, rec) { appendFileSync(join(dir, `attempt-${n}.jsonl`), `${toJson(rec)}\n`); },
    raw(n, phrases) { writeFileSync(join(dir, `raw-${n}.json`), `${toJson(phrases, 2)}\n`); },
    summary(obj) { writeFileSync(join(dir, 'summary.json'), `${toJson(obj, 2)}\n`); },
  };
}

// One attempt: new NVDA process (C1 settings), new page, focus check (A2), clear, steps 1-10 (A1), cleanup.
export async function runAttempt({ nvda, browser, cfg, runId, attempt, nonce, baseUrl, evidence, state, now = isoNow }) {
  const a = { attempt, nonce, status: 'running', new_process: false, settings: {}, title_phrase: '', focus_tries: 0, error: null, records: [], raw: [] };
  (state.attempts ??= []).push(a);
  state.current = a;
  state.step = 0;
  evidence.start(attempt);
  let page = null;
  let started = false;
  const t = cfg.cleanup_timeout_ms;
  const fail = (status, error) => { a.status = status; a.error = error; return a; };
  // Raw log, then browser close, then nvda.stop(): each bounded, run once (also by the SIGINT handler).
  state.finish = once(async () => {
    if (started) {
      const r = await withTimeout(nvda.spokenPhraseLog(), t);
      a.raw = r.timedOut || r.error ? null : [...r.value];
      evidence.raw(attempt, a.raw);
    }
    const errs = [];
    if (page) {
      const r = await withTimeout(page.close(), t);
      if (r.timedOut || r.error) errs.push(`browser close: ${r.error ?? 'timed out'}`);
    }
    if (started) {
      const r = await withTimeout(nvda.stop(), t);
      if (r.timedOut || r.error) errs.push(`nvda.stop: ${r.error ?? 'timed out'}`);
    }
    if (errs.length) a.cleanup_error = errs.join('; ');
  });
  try {
    const s = await withTimeout(nvda.start({ settings: cfg.nvda_settings }), cfg.load_timeout_ms * 2);
    if (s.timedOut || s.error) return fail('setup-failed', `nvda.start: ${s.error ?? 'timed out'}`);
    started = true;
    a.new_process = true;
    // C1: read back the session nvda.ini NVDA was started with. Guidepup's getSetting(key) is a flat
    // lookup and parseIni nests sections, so walk getSettings() by path instead.
    const conf = nvda.getSettings();
    const keys = [
      ...Object.entries(cfg.nvda_settings).flatMap(([sec, v]) => Object.keys(v).map((k) => `${sec}.${k}`)),
      ...(cfg.record_settings ?? []),
    ];
    for (const k of keys) a.settings[k] = k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), conf) ?? null;
    const bad = settingsMismatch(cfg.nvda_settings, a.settings);
    if (bad.length) return fail('setup-failed', bad.join('; '));
    if (state.aborted) return a;
    const o = await withTimeout(browser.open(`${baseUrl}/${cfg.page}?nonce=${nonce}`), cfg.load_timeout_ms + t);
    if (o.timedOut || o.error) return fail('setup-failed', `page open: ${o.error ?? 'timed out'}`);
    page = o.value;
    // A2: Guidepup's focus routine. Report title (NVDA+T); if it lacks the nonce, Alt+Escape and retry.
    for (let i = 0; i <= cfg.focus_retries; i++) {
      if (state.aborted) return a;
      a.focus_tries = i + 1;
      const r = await withTimeout(nvda.perform(nvda.keyboardCommands.reportTitle, { capture: true }), cfg.action_timeout_ms);
      if (r.timedOut || r.error) return fail('setup-failed', `report title: ${r.error ?? 'timed out'}`);
      a.title_phrase = await nvda.lastSpokenPhrase();
      if (a.title_phrase.toLowerCase().includes(nonce)) break;
      if (i === cfg.focus_retries) return fail('setup-failed', `reported title lacks the nonce after ${a.focus_tries} tries`);
      await withTimeout(nvda.press('Alt+Escape', { capture: false }), cfg.action_timeout_ms);
      await delay(cfg.focus_delay_ms);
    }
    await nvda.clearSpokenPhraseLog();
    // Steps. A1: capture:true ends after Guidepup's 1.0 s of silence; 8 s timeout per key action.
    for (const spec of cfg.steps) {
      if (state.aborted) return a;
      state.step = spec.step;
      const keys = actionsOf(spec);
      const phrases = [];
      let timedOut = false;
      let error = null;
      for (const key of keys) {
        const act = spec.press ? nvda.press(key, { capture: true }) : nvda.type(key, { capture: true });
        const r = await withTimeout(act, cfg.action_timeout_ms);
        if (state.aborted) return a;
        if (r.timedOut) { timedOut = true; break; }
        if (r.error) { error = r.error; break; }
        phrases.push(await nvda.lastSpokenPhrase());
      }
      const rec = { run_id: runId, attempt, step: spec.step, keys, phrases, silence_ms: cfg.silence_ms, timed_out: timedOut, error, ts: now() };
      a.records.push(rec);
      evidence.record(attempt, rec);
      if (timedOut) return fail('timed-out', `step ${spec.step} timed out`);
      if (error) return fail('error', `step ${spec.step}: ${error}`);
    }
    a.status = 'completed';
    return a;
  } catch (e) {
    if (!state.aborted) fail('error', errText(e));
    return a;
  } finally {
    if (!state.aborted) await state.finish();
  }
}

export function buildSummary({ cfg, runId, attempts, status, reached = null, meta = {} }) {
  const j = judgeRun({ steps: cfg, attempts });
  return {
    run_id: runId,
    status,
    result: status === 'aborted' ? 'PARTIAL' : j.result,
    rerun_allowed: j.rerun_allowed,
    reached,
    ...meta,
    attempts: attempts.map((a, i) => ({
      attempt: a.attempt, nonce: a.nonce, status: a.status, new_process: a.new_process, settings: a.settings,
      title_phrase: a.title_phrase, focus_tries: a.focus_tries, error: a.error, cleanup_error: a.cleanup_error ?? null,
      steps_recorded: a.records.length, raw_available: a.raw !== null,
      fresh: j.attempts[i].fresh, complete: j.attempts[i].complete, reasons: j.attempts[i].reasons,
      files: { records: `attempt-${a.attempt}.jsonl`, raw: `raw-${a.attempt}.json` },
    })),
  };
}

// Three attempts in one run. A setup failure in attempt 1 stops the run (a rerun is allowed, F-02).
export async function runR1({ nvda, browser, cfg, runId, baseUrl, evidence, state, nonce = randomNonce, meta = {}, now = isoNow }) {
  const started = now();
  state.attempts ??= [];
  for (let n = 1; n <= 3; n++) {
    if (state.aborted) return null;
    const a = await runAttempt({ nvda, browser, cfg, runId, attempt: n, nonce: nonce(), baseUrl, evidence, state, now });
    if (state.aborted) return null;
    if (n === 1 && a.status === 'setup-failed') break;
  }
  const summary = buildSummary({ cfg, runId, attempts: state.attempts, status: 'finished', meta: { ...meta, started, finished: now() } });
  evidence.summary(summary);
  return summary;
}

// C3: first SIGINT/SIGTERM stops new steps, runs bounded cleanup, writes partial evidence, exits 130.
// A second signal exits at once. Nothing here runs after a forced kill.
export function installAbort({ proc = process, state, evidence, cfg, runId, meta = {}, exit = (c) => process.exit(c), now = isoNow }) {
  let signals = 0;
  let exited = false;
  const quit = (code) => { if (!exited) { exited = true; exit(code); } };
  const handler = async (signal) => {
    signals += 1;
    if (signals > 1) return quit(130);
    state.aborted = true;
    const a = state.current;
    if (a && a.status === 'running') a.status = 'aborted';
    try { await state.finish?.(); } catch { /* recorded below as best effort */ }
    try {
      evidence.summary(buildSummary({
        cfg, runId, attempts: state.attempts ?? [], status: 'aborted',
        reached: { attempt: a?.attempt ?? null, step: state.step ?? null },
        meta: { ...meta, signal: signal ?? 'SIGINT', aborted_at: now() },
      }));
    } finally { quit(130); }
  };
  proc.on('SIGINT', handler);
  proc.on('SIGTERM', handler);
  return () => { proc.off('SIGINT', handler); proc.off('SIGTERM', handler); };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

// Static GET server for fixtures/ only, bound to 127.0.0.1.
export function serveDir(root, host = '127.0.0.1') {
  const base = resolve(root instanceof URL ? fileURLToPath(root) : root);
  const server = createServer(async (req, res) => {
    const end = (code, type = 'text/plain; charset=utf-8', body = String(code)) => { res.writeHead(code, { 'content-type': type }); res.end(body); };
    if (req.method !== 'GET' && req.method !== 'HEAD') return end(405);
    let file;
    try { file = resolve(base, `.${decodeURIComponent(new URL(req.url, 'http://x').pathname)}`); } catch { return end(404); }
    if (!file.startsWith(base + sep) || !TYPES[extname(file)]) return end(404);
    try { end(200, TYPES[extname(file)], await readFile(file)); } catch { end(404); }
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, host, () => ok({ server, port: server.address().port, host }));
  });
}

// Spec text that fixtures/r1/lock.json hashes: between the F-02 markers in PLAN.md.
export function specText(md) {
  const b = md.indexOf('<!-- F-02 spec begin');
  const e = md.indexOf('<!-- F-02 spec end -->');
  const from = md.indexOf('-->', b) + 3;
  if (b < 0 || e < 0 || e < from) throw new Error('F-02 spec markers not found in PLAN.md');
  return md.slice(from, e);
}

export const lockMismatches = (lock, actual) => Object.keys(lock).filter((k) => actual[k] !== lock[k]);
