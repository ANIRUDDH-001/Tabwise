// R1 runner core (PLAN F-02, D-33, D-34, D-36, D-37, D-39). NVDA, browser, foreground probe and send gate are
// injected, so the tests use fakes. nvda: the vendored Guidepup NVDA. browser.open(url) -> {pid, keys(from),
// close(), kill()}. fg: foregroundProbe(). evidence: evidenceWriter(dir). guard: sendGate(), set as the vendored
// tree's r1Gate by r1.mjs. installTeardown: the one exit path (B02).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { actionsOf, judgeRun, settingsMismatch } from './validate.mjs';
import { foregroundMismatch } from './foreground.mjs';
import { sendGate, pageAck } from './sendguard.mjs';

// B02: how long teardown waits for a launched send (a cscript child) to end before it exits anyway.
// Best effort (D-40): GitHub Actions can end a cancelled step sooner.
export const LIVE_WAIT_MS = 60000;

const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const errText = (e) => (e?.message ?? String(e)) + (e?.cause?.message ? `: ${e.cause.message}` : '') + (e?.cleanup_errors?.length ? `; cleanup: ${e.cleanup_errors.join('; ')}` : '');
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

// T24 (S-04): a log for the evidence upload (nvda.log): local paths scrubbed, capped at `cap` bytes.
export function scrubLog(text, cap = 1024 * 1024) {
  const s = scrub(String(text));
  const buf = Buffer.from(s, 'utf8');
  if (buf.length <= cap) return s;
  return `${buf.subarray(0, cap).toString('utf8')}\n[truncated: ${buf.length} bytes scrubbed, first ${cap} kept]\n`;
}

// D-36: writes never throw. A deleted folder is recreated and flagged (I-01); a failed write is
// collected in status().write_errors, so a write can't skip cleanup or hide the first error.
// D-37 (M-03): a journal keeps what each file should hold; verify() names files that are missing,
// truncated, changed or not ours. D-39 (M03): recover(found) rewrites each damaged file from the journal as
// recovered-<name> and returns what it could not write. write/append: the fs calls (tests inject failures).
export function evidenceWriter(dir, { write = writeFileSync, append = appendFileSync } = {}) {
  const st = { dir_recreated: false, write_errors: [] };
  const journal = new Map();
  try { mkdirSync(dir, { recursive: true }); } catch (e) { st.write_errors.push(`mkdir: ${e.code ?? e.message}`); }
  const put = (name, body, add) => {
    try {
      if (!existsSync(dir)) { mkdirSync(dir, { recursive: true }); st.dir_recreated = true; }
      (add ? append : write)(join(dir, name), body);
      journal.set(name, add ? (journal.get(name) ?? '') + body : body);
      return true;
    } catch (e) { st.write_errors.push(`${name}: ${e.code ?? e.message}`); return false; }
  };
  return {
    dir,
    status: () => ({ dir_recreated: st.dir_recreated, write_errors: [...st.write_errors] }),
    start(n) { for (const f of ['attempt', 'focus', 'sends']) put(`${f}-${n}.jsonl`, '', true); },
    record(n, rec) { put(`attempt-${n}.jsonl`, `${toJson(rec)}\n`, true); },
    focus(n, line) { put(`focus-${n}.jsonl`, `${toJson(line)}\n`, true); },
    sends(n, line) { return put(`sends-${n}.jsonl`, `${toJson(line)}\n`, true); },
    raw(n, phrases) { put(`raw-${n}.json`, `${toJson(phrases, 2)}\n`, false); },
    summary(obj) { put('summary.json', `${toJson(obj, 2)}\n`, false); },
    recover(found) {
      const lost = [];
      for (const f of found) {
        const m = /^(.+): (missing|truncated|changed)$/.exec(f);
        if (!m || !journal.has(m[1]) || m[1] === 'summary.json' || m[1].startsWith('recovered-')) continue;
        const body = journal.get(m[1]);
        if (!put(`recovered-${m[1]}`, body, false)) lost.push(`recovered-${m[1]} not written; journal follows:\n${body}`);
      }
      return lost;
    },
    verify() {
      let names;
      try { names = readdirSync(dir); } catch (e) { return [`evidence folder: ${e.code ?? e.message}`]; }
      const out = [];
      for (const [name, body] of journal) {
        let got;
        try { got = readFileSync(join(dir, name), 'utf8'); } catch { out.push(`${name}: missing`); continue; }
        if (got !== body) out.push(`${name}: ${body.startsWith(got) ? 'truncated' : 'changed'}`);
      }
      for (const n of names) if (!journal.has(n)) out.push(`${n}: not written by this run`);
      return out;
    },
  };
}

// Bounded cleanup step: never rejects, never throws; returns an error string or null.
async function tryStep(label, fn, ms) {
  try {
    const r = await withTimeout(fn(), ms);
    return r.timedOut || r.error ? `${label}: ${r.error ?? 'timed out'}` : null;
  } catch (e) { return `${label}: ${errText(e)}`; }
}

// D-37: a send-gate stop -> attempt status. A possibly misdelivered key is focus-lost (FAIL, no rerun);
// a failed check before any send is focus-lost in a step and setup-failed before step 1.
function guardStatus(g, setup) {
  if (g.misdelivered) return 'focus-lost';
  if (g.kind === 'timeout') return setup ? 'setup-failed' : 'timed-out';
  if (g.kind === 'pre') return setup ? 'setup-failed' : 'focus-lost';
  return 'error';
}

// One attempt: new NVDA process (C1 settings), new page, foreground wait and title check (A4), clear,
// steps 1-10 (A1), cleanup. fg.check() -> {pid, title} of the foreground window (src/speech/foreground.mjs).
// guard: the send gate. Every physical send inside an action gets its own foreground check before and after,
// and a page acknowledgement from the page's keydown log (D-39). watch() -> repository changes, checked
// before each step (M-07). diag(line) -> CI log (M-06). liveWaitMs: how long cleanup waits for a launched send.
export async function runAttempt({
  nvda, browser, fg, cfg, runId, attempt, nonce, baseUrl, evidence, state, now = isoNow,
  guard = state.guard ?? sendGate(), watch = () => [], diag = () => {}, liveWaitMs = LIVE_WAIT_MS,
}) {
  const a = {
    attempt, nonce, status: 'running', new_process: false, settings: {}, title_phrase: '', focus_tries: 0,
    actions_started: 0, error: null, later_errors: [], cleanup_errors: [], records: [], raw: [],
  };
  (state.attempts ??= []).push(a);
  state.current = a;
  state.step = 0;
  state.guard = guard;
  state.inStep = null;
  evidence.start(attempt);
  let page = null;
  let started = false;
  let starting = null;
  let opening = null;
  let ack = null;
  let acks = [];
  const t = cfg.cleanup_timeout_ms;
  // The first error is kept; later ones go to later_errors (D-36). Each one goes to the CI log too.
  const fail = (status, error) => {
    if (a.error === null) { a.status = status; a.error = error; } else a.later_errors.push(error);
    diag(`r1 attempt ${attempt}: ${status}: ${error}`);
    return a;
  };
  // M03: an intent line before each physical send (the gate calls it), an action line after each action.
  const sends = (line) => { try { return evidence.sends?.(attempt, { ...line, ts: now() }) === true; } catch { return false; } };
  guard.onIntent?.((tok) => {
    const recorded = sends({ type: 'intent', send: tok.id, step: state.step, action: tok.action.label, key: tok.key });
    if (!recorded || (evidence.status?.().write_errors.length ?? 0) > 0) {
      guard.stop('send intent/evidence could not be persisted', 'integrity');
      throw new Error('send intent/evidence could not be persisted');
    }
  });
  const actionLine = (label, phrase, r) => sends({ type: 'action', step: state.step, action: label, phrase, acks: r.acks ?? [], ...(r.error || r.timedOut || r.guard ? { error: r.error ?? (r.timedOut ? 'timed out' : r.guard.reason) } : {}) });
  // M03: the step in progress, written as a partial record by teardown when the run is aborted or crashes.
  state.partial = (reason) => {
    const s = state.inStep;
    if (!s) return;
    state.inStep = null;
    evidence.record(attempt, {
      run_id: runId, attempt, step: s.step, keys: s.keys, phrases: [...s.phrases], silence_ms: cfg.silence_ms,
      timed_out: false, error: `aborted: ${reason}`, partial: true, ts: now(),
    });
  };
  // No page acknowledgement reader until the page is open, so no key can be sent before it (D-39).
  guard.setAck(null);
  // Raw log, browser, NVDA: each bounded and tried on its own, so one failure can't skip the others.
  // Runs once (also from teardown). B02: the page is closed only once no send is in flight or live;
  // otherwise it is left as it is and the run says so. nvda.stop always runs last.
  state.finish = once(async () => {
    const errs = [];
    guard.disarm();
    const q = await guard.quiesce(liveWaitMs);
    const live = !q.quiet;
    if (live) {
      guard.stop(`live send at teardown after ${liveWaitMs} ms`, 'timeout');
      errs.push(`send guard: live send at teardown after ${liveWaitMs} ms; browser left open`);
    }
    // M-01: a start or open that timed out may still finish; wait a bounded time, then stop what it made.
    if (!started && starting) {
      const s = await withTimeout(starting, t);
      if (s.timedOut) {
        starting.then(() => nvda.stop()).catch(() => {});
        errs.push('nvda.start still pending at cleanup; stop attached');
      } else if (!s.error) started = true;
    }
    if (!page && opening) {
      const o = await withTimeout(opening, t);
      if (o.timedOut) {
        if (!live) opening.then((p) => p?.kill?.()).catch(() => {});
        errs.push(`page open still pending at cleanup; ${live ? 'left open' : 'kill attached'}`);
      } else if (o.value) page = o.value;
    }
    if (started) {
      let raw = null;
      const e = await tryStep('raw log', async () => { raw = [...await nvda.spokenPhraseLog()]; }, t);
      a.raw = e ? null : raw;
      if (e) errs.push(e);
      try { evidence.raw(attempt, a.raw); } catch (x) { errs.push(`raw write: ${errText(x)}`); }
    }
    if (page && !live) {
      // D-43: raw collection may itself allow late input to surface. Check after quiescence and
      // raw collection, immediately before removing the intended target; never erase the failure.
      if (ack) {
        const final = await withTimeout(ack.final(), t);
        const reasons = final.timedOut || final.error ? [`terminal page log: ${final.error ?? 'timed out'}`] : final.value;
        if (!Array.isArray(reasons) || reasons.length) {
          const why = Array.isArray(reasons) ? reasons.join('; ') : 'terminal page log returned no verdict';
          guard.stop(why, 'ack');
          fail('focus-lost', `terminal page log: ${why}`);
        }
      }
      const e = await tryStep('browser close', () => page.close(), t);
      if (e) {
        errs.push(e);
        const k = await tryStep('browser kill', () => page.kill?.(), t);
        if (k) errs.push(k);
      }
    }
    if (started) {
      const e = await tryStep('nvda.stop', () => nvda.stop(), t);
      if (e) errs.push(e);
    }
    for (const e of errs) diag(`r1 attempt ${attempt}: cleanup: ${e}`);
    a.cleanup_errors.push(...errs);
  });
  // A4: one read-only foreground check. ok = our Chromium process and this attempt's nonce in the title.
  // ctx is set when the send gate asks (D-37): phase pre/post, send number, action and key.
  let checks = 0;
  const check = async (ctx) => {
    const r = await withTimeout(Promise.resolve().then(() => fg.check()), cfg.action_timeout_ms);
    const v = r.timedOut || r.error ? { pid: null, error: r.error ?? 'probe timed out' } : r.value;
    const bad = foregroundMismatch(v, { pid: page?.pid, nonce });
    const ok = bad.length === 0;
    const line = { check: ++checks, ok, pid_ok: typeof v?.pid === 'number' && v.pid === page?.pid, nonce_ok: !bad.some((b) => b.includes('nonce')), ts: now() };
    if (Number.isFinite(v?.request_started_ms)) Object.assign(line, { request_id: v.request_id, request_started_ms: v.request_started_ms, received_ms: v.received_ms });
    if (ctx) Object.assign(line, { phase: ctx.phase, send: ctx.send, action: ctx.action, key: ctx.key });
    if (!ok) { line.reasons = bad; line.title = String(v?.title ?? '').slice(0, 80); }
    try { evidence.focus(attempt, line); } catch { /* collected by the writer */ }
    return bad;
  };
  guard.setCheck((ctx) => check(ctx));
  // Every key action goes through here: a passing check immediately before it, or no key at all (A4).
  // Inside the action the gate checks and acknowledges each physical send; after it, nothing may send.
  const key = async (label, send) => {
    const bad = await check();
    if (bad.length) return { lost: bad.join('; ') };
    if (state.aborted) return { aborted: true };
    if (!guard.arm(label)) return { guard: guard.status() };
    a.actions_started += 1;
    const mine = [];
    acks = mine;
    const r = await withTimeout(Promise.resolve().then(send), cfg.action_timeout_ms);
    if (r.timedOut) guard.stop(`${label}: action timed out after ${cfg.action_timeout_ms} ms`, 'timeout');
    guard.disarm();
    // One event-loop turn with no action armed: a send queued as the action ended reaches the gate now,
    // outside an action, and is refused before the next action is armed. Later strays are left to the gate.
    await new Promise((r) => setImmediate(r));
    const q = await guard.idle(t);
    if (!q.quiet) guard.stop(`${label}: a send was still running after the action`, 'timeout');
    const g = guard.status();
    return g.stopped ? { ...r, acks: mine, guard: g } : { ...r, acks: mine };
  };
  try {
    starting = Promise.resolve().then(() => nvda.start({ settings: cfg.nvda_settings }));
    const s = await withTimeout(starting, cfg.load_timeout_ms * 2);
    if (s.timedOut || s.error) return fail('setup-failed', `nvda.start: ${s.error ?? 'timed out'}`);
    started = true;
    if (!Number.isInteger(s.value?.pid) || s.value.pid <= 0 || s.value.relay_pid !== s.value.pid || s.value.reset_confirmed !== true) return fail('setup-failed', 'NVDA process/relay identity or reset evidence missing');
    a.new_process = true;
    a.process_id = s.value.pid;
    a.relay_pid = s.value.relay_pid;
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
    opening = Promise.resolve().then(() => browser.open(`${baseUrl}/${cfg.page}?nonce=${nonce}`));
    const o = await withTimeout(opening, cfg.load_timeout_ms + t);
    if (o.timedOut || o.error) return fail('setup-failed', `page open: ${o.error ?? 'timed out'}`);
    page = o.value;
    // D-39 decision 1: each send is acknowledged from the page's own keydown log.
    ack = pageAck({ read: (from) => page.keys(from), ackMs: guard.bounds?.ackMs ?? 1000 });
    const reader = async (tok) => { const r = await ack(tok); acks.push(r.ack); return r; };
    reader.before = (tok) => ack.before(tok); // D-42: the page log is checked right before each send
    guard.setAck(reader);
    // A4: wait (read-only, no keys) up to focus_wait_ms for our window to be in front. No focus recovery.
    const until = Date.now() + cfg.focus_wait_ms;
    let away = await check();
    while (away.length && Date.now() < until) {
      if (state.aborted) return a;
      await delay(cfg.focus_poll_ms);
      away = await check();
    }
    if (away.length) return fail('setup-failed', `foreground never our page within ${cfg.focus_wait_ms} ms: ${away.join('; ')}`);
    if (state.aborted) return a;
    // Freshness (A4 keeps A2's title rule): one NVDA+T; the spoken title must hold this attempt's nonce.
    a.focus_tries = 1;
    const r = await key('NVDA-T', () => nvda.perform(nvda.keyboardCommands.reportTitle, { capture: true }));
    if (r.aborted || state.aborted) return a;
    if (r.lost) return fail('setup-failed', `foreground before report title: ${r.lost}`);
    if (r.guard || r.timedOut || r.error) actionLine('NVDA-T', null, r);
    if (r.guard) return fail(guardStatus(r.guard, true), `report title: send guard: ${r.guard.reason}`);
    if (r.timedOut || r.error) return fail('setup-failed', `report title: ${r.error ?? 'timed out'}`);
    a.title_phrase = await nvda.lastSpokenPhrase();
    actionLine('NVDA-T', a.title_phrase, r);
    if (!a.title_phrase.toLowerCase().includes(nonce)) return fail('setup-failed', 'reported title lacks the nonce');
    await nvda.clearSpokenPhraseLog();
    // Steps. A1: capture:true ends after Guidepup's 1.0 s of silence; 8 s timeout per key action.
    for (const spec of cfg.steps) {
      if (state.aborted) return a;
      let changes;
      try { changes = watch(); } catch (e) { changes = [`interference check failed: ${errText(e)}`]; }
      if (changes.length) {
        (state.interference ??= []).push({ during_attempt: attempt, before_step: spec.step, changes });
        return fail('error', `repository interference before step ${spec.step}`);
      }
      state.step = spec.step;
      const keys = actionsOf(spec);
      const phrases = [];
      state.inStep = { step: spec.step, keys, phrases };
      let timedOut = false;
      let error = null;
      let lost = null;
      let stopped = null;
      for (const k of keys) {
        const label = spec.press ? k : `type ${k}`;
        const r = await key(label, () => (spec.press ? nvda.press(k, { capture: true }) : nvda.type(k, { capture: true })));
        if (r.aborted || state.aborted) return a;
        if (r.lost) { lost = r.lost; break; }
        if (r.guard && (r.guard.misdelivered || !r.timedOut)) { stopped = r.guard; actionLine(label, null, r); break; }
        if (r.timedOut || r.error) { actionLine(label, null, r); if (r.timedOut) timedOut = true; else error = r.error; break; }
        phrases.push(await nvda.lastSpokenPhrase());
        actionLine(label, phrases.at(-1), r);
      }
      if (state.aborted) return a;
      if (lost) error = `focus-lost: ${lost}`;
      if (stopped) error = `send guard: ${stopped.reason}`;
      // M-06 (T24): the first error reaches the CI log before its step record is written.
      if (lost) fail('focus-lost', `step ${spec.step}: foreground lost, no further keys: ${lost}`);
      else if (stopped) fail(guardStatus(stopped, false), `step ${spec.step}: send guard: ${stopped.reason}`);
      else if (timedOut) fail('timed-out', `step ${spec.step} timed out`);
      else if (error) fail('error', `step ${spec.step}: ${error}`);
      state.inStep = null;
      const rec = { run_id: runId, attempt, step: spec.step, keys, phrases, silence_ms: cfg.silence_ms, timed_out: timedOut, error, ts: now() };
      a.records.push(rec);
      evidence.record(attempt, rec);
      if (a.error !== null) return a;
    }
    // A key on the page after the last acknowledged send was not ours to explain (D-39).
    const left = await ack.final();
    if (left.length) {
      guard.stop(`after the last step: ${left.join('; ')}`, 'ack');
      return fail('focus-lost', `after step ${state.step}: ${left.join('; ')}`);
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

// D-36: repository interference or damaged evidence rules out PASS (FAIL, with the reason).
// D-37: so do cleanup errors (M-02), a missing raw log, any send-gate stop, and evidence-check findings.
// D-39 (M02): safety first. A possibly misdelivered key, a missing acknowledgement, a send still live,
// interference or damaged evidence make the result FAIL even when the run was aborted; a clean abort is PARTIAL.
// D-42 (D39-M01): a crash during teardown (crashes) makes it FAIL too.
export function buildSummary({ cfg, runId, attempts, status, reached = null, meta = {}, interference = [], evidence = null, guard = null, evidenceCheck = [], crashes = [] }) {
  const j = judgeRun({ steps: cfg, attempts });
  const ev = evidence ?? { dir_recreated: false, write_errors: [] };
  const missing = guard?.acks?.missing ?? 0;
  const live = guard?.live ?? 0;
  const reasons = [];
  if (interference.length) reasons.push('repository interference detected during the run');
  if (ev.dir_recreated) reasons.push('evidence folder was deleted during the run and recreated');
  if (ev.write_errors.length) reasons.push(`evidence write errors: ${ev.write_errors.length}`);
  if (evidenceCheck.length) reasons.push(`evidence files changed or missing: ${evidenceCheck.length}`);
  const cleanup = attempts.reduce((n, a) => n + (a.cleanup_errors?.length ?? 0), 0);
  if (cleanup) reasons.push(`cleanup errors: ${cleanup}`);
  if (attempts.some((a) => a.new_process && a.raw === null)) reasons.push('raw speech log missing for a started attempt');
  if (guard?.misdelivered) reasons.push('a key was possibly misdelivered (send guard)');
  else if (guard?.stopped && guard.kind !== 'done') reasons.push(`send guard stopped the run: ${guard.kind}`);
  if (missing > 0) reasons.push(`page acknowledgements missing: ${missing}`);
  if (live > 0) reasons.push(`sends still live at the summary: ${live}`);
  if (status === 'crashed') reasons.push('runner crashed');
  for (const c of crashes) reasons.push(`runner crashed during teardown: ${c}`);
  const unsafe = guard?.misdelivered || missing > 0 || live > 0 || interference.length > 0 || evidenceCheck.length > 0
    || ev.dir_recreated || ev.write_errors.length > 0;
  let result = status === 'aborted' ? (unsafe ? 'FAIL' : 'PARTIAL') : j.result;
  if (result === 'PASS' && reasons.length) result = 'FAIL';
  if (status === 'crashed' || crashes.length) result = 'FAIL';
  return {
    run_id: runId,
    status,
    result,
    result_reasons: reasons,
    rerun_allowed: j.rerun_allowed && interference.length === 0 && !guard?.misdelivered && missing === 0 && live === 0,
    reached,
    ...meta,
    interference,
    evidence: ev,
    evidence_check: evidenceCheck,
    send_guard: guard ? {
      stopped: guard.stopped, kind: guard.kind, reason: guard.reason, misdelivered: guard.misdelivered,
      sends: guard.sends, refused: guard.refused, unsettled: live, acks: guard.acks ?? null,
    } : null,
    attempts: attempts.map((a, i) => ({
      attempt: a.attempt, nonce: a.nonce, status: a.status, new_process: a.new_process, process_id: a.process_id ?? null, relay_pid: a.relay_pid ?? null, settings: a.settings,
      title_phrase: a.title_phrase, focus_tries: a.focus_tries, actions_started: a.actions_started ?? 0,
      error: a.error, later_errors: a.later_errors ?? [], cleanup_errors: a.cleanup_errors ?? [],
      steps_recorded: a.records.length, raw_available: a.raw !== null,
      fresh: j.attempts[i].fresh, complete: j.attempts[i].complete, reasons: j.attempts[i].reasons,
      files: { records: `attempt-${a.attempt}.jsonl`, raw: `raw-${a.attempt}.json`, focus: `focus-${a.attempt}.jsonl`, sends: `sends-${a.attempt}.jsonl` },
    })),
  };
}

// M-04, D-39 (M02, M03): recover damaged files from the journal, then write the summary, check every
// evidence file again and rewrite while the findings change, at most 3 writes. A third write means the
// evidence kept changing: it is FAIL, "summary not stable". state.persisted is true only when the last
// write succeeded, the findings were stable and summary.json on disk is the one returned. Otherwise the
// summary and the writer's status go to the CI log (stderr). D-42 (D39-S01): a summary that did not reach
// disk is rebuilt, so the returned one carries the summary.json write error in evidence.write_errors.
export function writeSummary({ evidence, state, build, diag = () => {} }) {
  const verify = () => (evidence.verify?.() ?? []).filter((p) => !p.startsWith('summary.json:'));
  const errs = () => evidence.status?.().write_errors ?? [];
  const sig = (found) => `${found.join('\n')}|${errs().filter((e) => !e.startsWith('summary.json')).join('\n')}`;
  let found = verify();
  const lost = evidence.recover?.(found);
  for (const l of Array.isArray(lost) ? lost : []) diag(`r1 evidence: ${l}`);
  let prev = sig(found);
  let summary;
  let stable = false;
  let wrote = false;
  let rounds = 0;
  for (let round = 1; round <= 3; round++) {
    rounds = round;
    summary = build(found);
    if (round === 3) summary = { ...summary, result: 'FAIL', result_reasons: [...(summary.result_reasons ?? []), 'summary not stable'] };
    const before = errs().filter((e) => e.startsWith('summary.json')).length;
    evidence.summary(summary);
    wrote = errs().filter((e) => e.startsWith('summary.json')).length === before;
    if (round === 3) break;
    const again = verify();
    const next = sig(again);
    if (next === prev) { stable = true; break; }
    found = again;
    prev = next;
  }
  const onDisk = wrote && !(evidence.verify?.() ?? []).some((p) => p.startsWith('summary.json:'));
  state.persisted = stable && onDisk;
  if (!onDisk) {
    summary = build(found);
    const extra = [...(rounds === 3 ? ['summary not stable'] : []), 'summary.json not persisted'];
    summary = { ...summary, result: 'FAIL', result_reasons: [...(summary.result_reasons ?? []), ...extra] };
  }
  if (!state.persisted) diag(`r1 summary not persisted: ${toJson(summary, 1)} writer: ${toJson(evidence.status?.() ?? null)}`);
  return summary;
}

// Three attempts in one run. A setup failure in attempt 1 stops the run (a rerun is allowed, F-02).
// focus-lost or repository interference (interference() -> changes, checked after each attempt) stops it too.
// D-37: so does any send-gate stop, a cleanup error, or an evidence file that no longer matches.
export async function runR1({
  nvda, browser, fg, cfg, runId, baseUrl, evidence, state, nonce = randomNonce, meta = {}, interference = () => [],
  now = isoNow, guard = sendGate(), watch = () => [], diag = () => {}, liveWaitMs = LIVE_WAIT_MS,
}) {
  const started = now();
  state.attempts ??= [];
  state.interference ??= [];
  state.guard = guard;
  state.meta = { ...meta, started };
  for (let n = 1; n <= 3; n++) {
    if (state.aborted) return null;
    const a = await runAttempt({ nvda, browser, fg, cfg, runId, attempt: n, nonce: nonce(), baseUrl, evidence, state, now, guard, watch, diag, liveWaitMs });
    if (state.aborted) return null;
    let changes;
    try { changes = interference(); } catch (e) { changes = [`interference check failed: ${errText(e)}`]; }
    if (changes.length) { state.interference.push({ after_attempt: n, changes }); break; }
    if (state.interference.length) break;
    if (n === 1 && a.status === 'setup-failed') break;
    if (a.status === 'focus-lost') break;
    if (guard.status().stopped || a.cleanup_errors.length) break;
    const found = evidence.verify?.() ?? [];
    if (found.length) { for (const f of found) diag(`r1 evidence: ${f}`); break; }
  }
  state.meta = { ...state.meta, finished: now() };
  return writeSummary({
    evidence, state, diag,
    build: (found) => buildSummary({
      cfg, runId, attempts: state.attempts, status: 'finished', meta: state.meta,
      interference: state.interference, evidence: evidence.status?.() ?? null, guard: guard.status(), evidenceCheck: found,
    }),
  });
}

// D-39 (B02): the one exit path. Every signal, a crash and the run's own completion all come here, once:
//   1. stop the gate (no new sends; a key already handed to the OS cannot be recalled, D-40)
//   2. write the partial record and the summary, synchronously
//   3. cleanup (state.finish): wait up to liveWaitMs for sends to end; close the page only if they did;
//      nvda.stop last
//   4. rewrite the summary, report it, exit: 0 for a persisted PASS, 1 for any other finish or a crash,
//      130 for a signal.
// A later entry is logged, never a second exit. D-42 (D39-M01): a later crash is also recorded at once
// (FAIL, "runner crashed during teardown") and the exit code can no longer be 0. A deadline (default liveWaitMs + 8 cleanup bounds) ends a
// teardown that runs too long, with the summary rewritten first. All of it is best effort: GitHub Actions
// can end a cancelled step sooner, and nothing here runs after a forced kill.
export function installTeardown({
  proc = process, state, evidence, cfg, runId, meta = {}, guard, liveWaitMs = LIVE_WAIT_MS, deadlineMs,
  report = () => {}, exit = (c) => process.exit(c), now = isoNow, diag = () => {},
}) {
  let entered = null;
  let rewrite = null;
  const crashes = [];
  let exited = false;
  let timer = null;
  const gate = () => guard ?? state.guard ?? null;
  const quit = (code) => { if (exited) return; exited = true; clearTimeout(timer); exit(code); };
  const teardown = (reason, { status = 'aborted', extra = {} } = {}) => {
    if (entered) {
      diag(`r1 teardown: ${reason} during teardown`);
      if (status === 'crashed') { crashes.push(reason); if (!exited) rewrite?.(); }
      return entered;
    }
    diag(`r1 teardown: ${reason}`);
    const finished = status === 'finished';
    const code = (s) => (status === 'aborted' ? 130 : status === 'crashed' || crashes.length ? 1 : (state.persisted && s?.result === 'PASS' ? 0 : 1));
    if (!finished) state.aborted = true;
    try { gate()?.stop(reason, finished ? 'done' : 'stop'); } catch (e) { diag(`r1 teardown: gate stop: ${errText(e)}`); }
    const a = state.current;
    if (!finished && a && a.status === 'running') {
      a.status = status === 'crashed' ? 'error' : 'aborted';
      if (status === 'crashed') { if (a.error === null) a.error = reason; else a.later_errors.push(reason); }
    }
    if (!finished) { try { state.partial?.(reason); } catch (e) { diag(`r1 teardown: partial record: ${errText(e)}`); } }
    const reached = finished ? null : { attempt: a?.attempt ?? null, step: state.step ?? null };
    const info = finished ? extra : { ...extra, teardown: reason, aborted_at: now() };
    const write = () => {
      try {
        return writeSummary({
          evidence, state, diag,
          build: (found) => buildSummary({
            cfg, runId, attempts: state.attempts ?? [], status, reached, meta: { ...meta, ...state.meta, ...info },
            interference: state.interference ?? [], evidence: evidence.status?.() ?? null,
            guard: gate()?.status() ?? null, evidenceCheck: found, crashes,
          }),
        });
      } catch (e) { diag(`r1 teardown: summary: ${errText(e)}`); return null; }
    };
    rewrite = write;
    write();
    const ms = deadlineMs ?? liveWaitMs + 8 * cfg.cleanup_timeout_ms;
    timer = setTimeout(() => {
      diag(`r1 teardown: deadline of ${ms} ms reached; exiting before cleanup finished`);
      quit(code(write()));
    }, ms);
    entered = (async () => {
      let summary = null;
      try {
        try { await state.finish?.(); } catch (e) { diag(`r1 teardown: cleanup: ${errText(e)}`); }
        if ((gate()?.status().live ?? 0) > 0) diag('r1 teardown: live send at teardown; page left open; exiting deliberately');
        if (!exited) {
          summary = write();
          try { report(summary); } catch (e) { diag(`r1 teardown: report: ${errText(e)}`); }
        }
      } finally { quit(code(summary)); }
    })();
    return entered;
  };
  const entries = [
    ...['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP'].map((sig) => [sig, () => { teardown(`${sig} received`); }]),
    ['uncaughtException', (e) => { teardown(`uncaught exception: ${errText(e)}`, { status: 'crashed' }); }],
    ['unhandledRejection', (e) => { teardown(`unhandled rejection: ${errText(e)}`, { status: 'crashed' }); }],
  ];
  for (const [name, fn] of entries) proc.on(name, fn);
  return {
    teardown,
    dispose() { clearTimeout(timer); for (const [name, fn] of entries) proc.off(name, fn); },
  };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

// Static GET server for fixtures/ only, bound to 127.0.0.1.
export async function finishRun({ failed = null, state, teardown }) {
  if (failed) await teardown(`runner error: ${String(failed?.message ?? failed)}`, { status: 'crashed' });
  else if (!state.aborted) await teardown('run finished', { status: 'finished' });
}

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
