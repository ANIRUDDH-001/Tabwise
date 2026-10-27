// R1 validator (PLAN F-02, D-33, D-34). Pure functions over speech records; no NVDA, no I/O.
// cfg = fixtures/r1/steps.json. Matching is case-insensitive substring unless stated.

export const RECORD_FIELDS = ['run_id', 'attempt', 'step', 'keys', 'phrases', 'silence_ms', 'timed_out', 'error', 'ts'];
const NONCE = /^[0-9a-f]{8}$/;

// C2: "unchecked" and "not checked" must never satisfy "checked".
export const isNotChecked = (text) => /\bnot checked\b|\bunchecked\b/i.test(text);
export const isChecked = (text) => /\bchecked\b/i.test(text) && !isNotChecked(text);

// A3: lowercase, keep letters and digits only. Raw phrases are not modified.
export const typedText = (phrases) => phrases.join('').toLowerCase().replace(/[^a-z0-9]/g, '');

const isStr = (v) => typeof v === 'string';
const isInt = (v) => Number.isInteger(v);

export function recordErrors(rec) {
  if (rec === null || typeof rec !== 'object' || Array.isArray(rec)) return ['record is not an object'];
  const errs = [];
  for (const k of Object.keys(rec)) if (!RECORD_FIELDS.includes(k)) errs.push(`field not allowed: ${k}`);
  for (const k of RECORD_FIELDS) if (!(k in rec)) errs.push(`field missing: ${k}`);
  if (errs.length) return errs;
  if (!isStr(rec.run_id)) errs.push('run_id not a string');
  if (!isInt(rec.attempt) || !isInt(rec.step)) errs.push('attempt/step not integers');
  if (!Array.isArray(rec.keys) || !rec.keys.every(isStr)) errs.push('keys not a string array');
  if (!Array.isArray(rec.phrases) || !rec.phrases.every(isStr)) errs.push('phrases not a string array');
  if (!isInt(rec.silence_ms)) errs.push('silence_ms not an integer');
  if (typeof rec.timed_out !== 'boolean') errs.push('timed_out not a boolean');
  if (rec.error !== null && !isStr(rec.error)) errs.push('error not null or string');
  if (!isStr(rec.ts)) errs.push('ts not a string');
  return errs;
}

export const actionsOf = (spec) => (spec.press ? [spec.press] : [...spec.type]);

export function stepFailures(spec, rec) {
  const errs = recordErrors(rec);
  if (errs.length) return errs;
  const want = actionsOf(spec);
  if (rec.step !== spec.step) errs.push(`step ${rec.step} is not ${spec.step}`);
  if (rec.keys.length !== want.length || rec.keys.some((k, i) => k !== want[i])) errs.push(`keys ${JSON.stringify(rec.keys)} are not ${JSON.stringify(want)}`);
  if (rec.phrases.length !== want.length) errs.push(`${rec.phrases.length} phrases for ${want.length} actions`);
  if (rec.timed_out) errs.push('timed out');
  if (rec.error) errs.push(`error: ${rec.error}`);
  if (!rec.phrases.some((p) => p.trim())) errs.push('no speech');
  const text = rec.phrases.join(' ').toLowerCase();
  const e = spec.expect;
  for (const s of e.all ?? []) if (!text.includes(s)) errs.push(`missing "${s}"`);
  for (const s of e.none ?? []) if (text.includes(s)) errs.push(`unexpected "${s}"`);
  if (e.typed && !typedText(rec.phrases).includes(e.typed)) errs.push(`typed echo lacks "${e.typed}"`);
  if (e.state === 'checked' && !isChecked(text)) errs.push('not spoken as checked');
  if (e.state === 'not-checked' && !isNotChecked(text)) errs.push('not spoken as not checked');
  return errs;
}

// C1: expected = {keyboard: {...}}; readback = {'keyboard.speakTypedCharacters': value} from nvda.getSetting.
// nvda.ini values may read back as strings, so compare as strings.
export function settingsMismatch(expected, readback) {
  const errs = [];
  for (const [section, values] of Object.entries(expected)) {
    for (const [k, v] of Object.entries(values)) {
      const key = `${section}.${k}`;
      const got = readback?.[key];
      if (got === undefined || got === null || String(got) !== String(v)) errs.push(`${key} is ${JSON.stringify(got)}, want ${v}`);
    }
  }
  return errs;
}

// attempt = {attempt, nonce, status, new_process, settings, title_phrase, records, raw}
export function judgeAttempt({ steps: cfg, attempt: a, otherNonces = [] }) {
  const fresh = [];
  const complete = [];
  const records = a.records ?? [];
  // Fresh
  if (!NONCE.test(a.nonce ?? '')) fresh.push(`nonce ${JSON.stringify(a.nonce)} is not 8 hex`);
  if (a.new_process !== true) fresh.push('NVDA not started as a new process');
  for (const m of settingsMismatch(cfg.nvda_settings, a.settings)) fresh.push(`setting: ${m}`);
  if (!(a.title_phrase ?? '').toLowerCase().includes((a.nonce ?? '').toLowerCase()) || !a.nonce) fresh.push('reported title lacks this attempt\'s nonce');
  const spoken = [a.title_phrase ?? '', ...(a.raw ?? []), ...records.flatMap((r) => (Array.isArray(r?.phrases) ? r.phrases : []))].join('\n').toLowerCase();
  for (const n of otherNonces) if (n && n !== a.nonce && spoken.includes(n.toLowerCase())) fresh.push(`speech contains another attempt's nonce ${n}`);
  const first = records.find((r) => r?.step === 1);
  const firstText = Array.isArray(first?.phrases) ? first.phrases.join(' ').toLowerCase() : '';
  if (!first) fresh.push('no step 1 record');
  else for (const s of cfg.steps[0].expect.none ?? []) if (firstText.includes(s)) fresh.push(`step 1: form not empty ("${s}")`);
  // Complete
  if (a.status !== 'completed') complete.push(`status ${a.status}`);
  if (records.length !== cfg.steps.length) complete.push(`${records.length} of ${cfg.steps.length} steps recorded`);
  for (const [i, spec] of cfg.steps.entries()) {
    const rec = records[i];
    if (!rec) continue;
    if (rec.attempt !== a.attempt) complete.push(`step ${spec.step}: record is for attempt ${rec.attempt}`);
    for (const f of stepFailures(spec, rec)) complete.push(`step ${spec.step}: ${f}`);
  }
  return {
    attempt: a.attempt, fresh: fresh.length === 0, complete: complete.length === 0,
    reasons: [...fresh.map((r) => `fresh: ${r}`), ...complete.map((r) => `complete: ${r}`)],
  };
}

// R1 PASS = 3 of 3 attempts in one run fresh and complete. Aborted run = PARTIAL. Anything else = FAIL.
export function judgeRun({ steps: cfg, attempts }) {
  const nonces = attempts.map((a) => a.nonce);
  const judged = attempts.map((a) => judgeAttempt({ steps: cfg, attempt: a, otherNonces: nonces.filter((_, i) => attempts[i] !== a) }));
  const reused = new Set(nonces).size !== nonces.length;
  const pass = attempts.length === 3 && !reused && judged.every((j) => j.fresh && j.complete);
  const result = pass ? 'PASS' : attempts.some((a) => a.status === 'aborted') ? 'PARTIAL' : 'FAIL';
  return {
    result,
    rerun_allowed: attempts[0]?.status === 'setup-failed',
    reused_nonce: reused,
    attempts: judged,
  };
}
