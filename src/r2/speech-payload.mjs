// R2-L2 C-3: production speech payload builder (design §8.6, §8.7). Offline only: no model call, network,
// browser, NVDA or physical input. Model-facing speech comes only from captureJourney's validated per-action
// records, mapped to approved task ids, nonce-redacted and rebuilt field by field through an exact allowlist.
//
// Trust boundary. assessR2SpeechPayload is a pure check over caller-supplied evidence; its result is always
// source_verified:false and carries no arm-input record. buildR2SpeechPayload is the production entry: it accepts
// only a handle minted here by openVerifiedR2SpeechEvidence, which runs the independent S3 disk verifier and
// requires its recomputed class to be 'genuine-unqualified'. Caller-supplied classes, verified flags, manifests or
// captures never authorize it. Until S5b/S6 attest an authentic runtime the S3 verifier cannot reach that class
// (ATTESTATION_UNAVAILABLE), so the production entry refuses every directory today (fail closed).
import {readFileSync, lstatSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildArmPayload} from './preparation.mjs';
import {speechPayloadErrors} from './contract.mjs';
import {verifyR2PageEvidence, buildR2StepMap, STEP_MAP_VERSION, TRANSFORM, ATTESTATION_UNAVAILABLE} from '../../scripts/tabwise/r2-evidence.mjs';

export const BUILDER_VERSION = 'tabwise-r2-speech-payload/1';
export const ARM_INPUT_SCHEMA = 'tabwise-r2-speech-arm-input/1';
export const REDACTION_VERSION = 'nonce-redact/1';
export const SPEECH_LANE_SCHEMA = 'tabwise-r2-speech-lane/1';
export const NONCE_MARKER = '[run-nonce]';
export const AMBIGUOUS = 'nonce-sanitization-ambiguous';

const NODE_CLOCK = 'node-monotonic-ms';
const ACK_MS = 1000; // capture.mjs ACK_MS: page acknowledgement within 1000 ms of gate release.
const READ_CAP = 12_000_000; // S3 TOTAL_CAP: no sealed file is larger than its page.
const SUCCESS = new Set(['speech', 'observed-silence']);
const DIGITS = Object.freeze({zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9'});
// nonce-redact/1 separator: one or more whitespace characters, or whitespace plus at most one of , . -
// Written so whitespace cannot be split two ways (\s+ then optional punctuation): linear, no catastrophic backtracking.
const SEP = '(?:\\s+(?:[,.\\-]\\s*)?|[,.\\-]\\s+)';
const EDGE_BEFORE = '(?<![\\p{L}\\p{N}])', EDGE_AFTER = '(?![\\p{L}\\p{N}])';
const TOKEN_SPLIT = /[\s,.\-]+/u;

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => JSON.stringify(value, (k, v) => object(v) ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = (boundary, message) => { throw Object.assign(Error(`${boundary}: ${message}`), {boundary}); };
const time = v => Number.isFinite(v) && v >= 0;
const int = v => Number.isSafeInteger(v) && v > 0;
const opaqueFixture = v => typeof v === 'string' && v.length <= 66 && /^f-[a-f0-9]+(?:-[a-f0-9]+)*$/.exec(v)?.[0] === v;

// Plain JSON data only: no getters, symbols, functions, class instances or cycles. Untrusted inputs are checked
// before any field is read for a decision, then detached with structuredClone.
function plainData(value, boundary) {
  const seen = new Set();
  const walk = (v, depth) => {
    if (depth > 64) fail(boundary, 'not plain JSON data (nesting)');
    if (v === null || ['string', 'boolean'].includes(typeof v)) return;
    if (typeof v === 'number') { if (!Number.isFinite(v)) fail(boundary, 'not plain JSON data (number)'); return; }
    if (typeof v !== 'object') fail(boundary, `not plain JSON data (${typeof v})`);
    if (seen.has(v)) fail(boundary, 'not plain JSON data (cycle)');
    if (!Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail(boundary, 'not plain JSON data (prototype)');
    if (Array.isArray(v) && Object.getPrototypeOf(v) !== Array.prototype) fail(boundary, 'not plain JSON data (array prototype)');
    if (Object.getOwnPropertySymbols(v).length) fail(boundary, 'not plain JSON data (symbol keys)');
    seen.add(v);
    for (const [key, d] of Object.entries(Object.getOwnPropertyDescriptors(v))) {
      if (Array.isArray(v) && key === 'length') continue;
      if (!('value' in d) || d.get || d.set) fail(boundary, `not plain JSON data (accessor ${key})`);
      if (d.value === undefined) fail(boundary, `not plain JSON data (undefined ${key})`);
      walk(d.value, depth + 1);
    }
    seen.delete(v);
  };
  walk(value, 0);
  return structuredClone(value);
}

/** Speech lane record (written once by S5a from the final observer read; the C-3 provenance source). */
export function speechLaneRecord(read) {
  if (!object(read) || typeof read.source !== 'string' || !read.source || typeof read.session !== 'string' || !read.session ||
    typeof read.connected !== 'boolean' || typeof read.complete !== 'boolean' || !Array.isArray(read.phrases) || read.phrases.some(p => typeof p !== 'string')) {
    throw Error('speech lane: observer read must be {source, session, connected, complete, phrases:string[]}');
  }
  return {kind: 'observer-journal', schema: SPEECH_LANE_SCHEMA, source: read.source, session: read.session,
    connected: read.connected, complete: read.complete, phrases: [...read.phrases]};
}

// ---- nonce-redact/1 (§8.7) ----
function candidates(text, nonce) {
  const literal = new RegExp(`${EDGE_BEFORE}${nonce}${EDGE_AFTER}`, 'iuy');
  const spaced = new RegExp(`${EDGE_BEFORE}${[...nonce].join(SEP)}${EDGE_AFTER}`, 'iuy');
  const found = [];
  for (let i = 0; i < text.length; i++) {
    for (const [form, pattern] of [['literal', literal], ['spaced', spaced]]) {
      pattern.lastIndex = i;
      const m = pattern.exec(text);
      if (m) found.push({form, start: i, end: i + m[0].length, original: m[0]});
    }
  }
  return found.sort((a, b) => a.start - b.start || a.end - b.end);
}
// Rule 1, on the redacted text: digit words become digits, separators drop, and any run of tokens that are each one
// hex character or one digit word must not contain 4 or more consecutive nonce characters.
function fragmentRun(text, nonce) {
  let run = '';
  const check = () => { for (let j = 0; j + 4 <= nonce.length; j++) if (run.includes(nonce.slice(j, j + 4))) return true; return false; };
  for (const token of text.split(TOKEN_SPLIT)) {
    const t = token.toLowerCase(), c = /^[0-9a-f]$/.test(t) ? t : DIGITS[t];
    if (c !== undefined) { run += c; continue; }
    if (check()) return true;
    run = '';
  }
  return check();
}

/**
 * redactNonce([{seq, text}], nonce) -> {ok, reason, texts:[{seq, text}], redaction:{version, nonce_sha256, edits}}.
 * Pure. Matches are found over the record texts joined in order (so a match crossing a record boundary is seen);
 * all non-overlapping literal and spaced matches are replaced left to right with NONCE_MARKER. Ambiguity refuses
 * with ok:false and no texts. Raw texts are never modified; edits carry UTF-16 offsets into each raw record text.
 */
export function redactNonce(records, nonce) {
  if (typeof nonce !== 'string' || !/^[0-9a-f]{8}$/.test(nonce)) throw Error('redaction: nonce must be 8 lowercase hex characters');
  if (!Array.isArray(records) || records.some(r => !object(r) || !int(r.seq) || typeof r.text !== 'string')) throw Error('redaction: records must be [{seq, text}]');
  const refuse = detail => ({ok: false, reason: `${AMBIGUOUS}: ${detail}`, texts: null, redaction: null});
  const marked = records.find(r => r.text.includes(NONCE_MARKER));
  if (marked) return refuse(`record ${marked.seq} raw text already contains ${NONCE_MARKER}`);
  const starts = [];
  let joined = '';
  for (const [i, r] of records.entries()) { if (i) joined += '\n'; starts.push(joined.length); joined += r.text; }
  const found = candidates(joined, nonce);
  for (let i = 1; i < found.length; i++) if (found[i].start < found[i - 1].end) return refuse('overlapping nonce matches');
  const edits = [];
  for (const m of found) {
    const k = starts.findLastIndex(s => s <= m.start), r = records[k], end = starts[k] + r.text.length;
    if (m.end > end) return refuse(`match at record ${r.seq} crosses a record boundary`);
    if (m.original.includes('\n')) return refuse(`match in record ${r.seq} crosses an observer phrase boundary`);
    edits.push({seq: r.seq, form: m.form, start: m.start - starts[k], end: m.end - starts[k], original: m.original});
  }
  const texts = records.map(r => {
    let text = r.text;
    for (const e of edits.filter(x => x.seq === r.seq).reverse()) text = text.slice(0, e.start) + NONCE_MARKER + text.slice(e.end);
    return {seq: r.seq, text};
  });
  // Security correction to §8.7: the literal form needs non-alphanumeric neighbours, so a nonce glued to letters or
  // digits is not redacted. Any record that still holds the complete nonce (any case) is refused, never passed on.
  const leaked = texts.find(t => t.text.toLowerCase().includes(nonce));
  if (leaked) return refuse(`record ${leaked.seq} still contains the complete nonce after redaction`);
  if (fragmentRun(texts.map(t => t.text).join('\n'), nonce)) return refuse('a run of 4 or more nonce characters remains after redaction');
  return {ok: true, reason: null, texts, redaction: {version: REDACTION_VERSION, nonce_sha256: sha256(nonce), edits}};
}

// ---- eligibility (§8.6) ----
function checkStepMap(stepMap) {
  const map = plainData(stepMap, 'step-map');
  if (!object(map) || map.version !== STEP_MAP_VERSION || !Array.isArray(map.actions) || !map.actions.length) fail('step-map', `not a ${STEP_MAP_VERSION} map`);
  let rebuilt;
  try { rebuilt = buildR2StepMap(map.actions.map(a => ({step: a?.task, press: a?.press}))); } catch (error) { fail('step-map', error.message); }
  if (canonical(rebuilt) !== canonical(map)) fail('step-map', 'not the recomputed tabwise-r2-step-map/1 bijection');
  return map;
}
function checkTransform(transform) {
  const t = plainData(transform, 'transform');
  if (!object(t) || t.transform !== TRANSFORM) fail('transform', `not a ${TRANSFORM} record`);
  if (typeof t.nonce !== 'string' || !/^[0-9a-f]{8}$/.test(t.nonce)) fail('transform', 'nonce is not 8 lowercase hex characters');
  return t;
}
function checkCapture(capture, actions) {
  const c = plainData(capture, 'capture');
  if (!object(c) || c.schema !== 'r2-capture/1' || !Array.isArray(c.records) || !Array.isArray(c.raw) || !Array.isArray(c.reasons) ||
    !Array.isArray(c.unattributed) || !Array.isArray(c.unattributed_page)) fail('capture', 'not an r2-capture/1 result');
  if (c.completed !== true || c.outcome !== 'COMPLETE') fail('capture', 'not completed with outcome COMPLETE');
  if ('gate_stop' in c) fail('capture', 'gate_stop present');
  if (c.reasons.length) fail('capture', `reasons present: ${c.reasons[0]}`);
  if (c.unattributed.length || c.unattributed_page.length) fail('capture', 'unattributed speech or page events present');
  if (c.records.length !== actions.length) fail('capture', `${c.records.length} records for ${actions.length} actions`);
  if (!Number.isSafeInteger(c.preexisting_phrases) || c.preexisting_phrases < 0 || typeof c.source !== 'string' || !c.source) fail('capture', 'preexisting phrase count or source');
  return c;
}
function checkRaw(c) {
  c.raw.forEach((p, k) => {
    if (!object(p) || p.seq !== c.preexisting_phrases + k + 1) fail('raw', `entry ${k + 1} is not seq ${c.preexisting_phrases + k + 1} (contiguous after preexisting phrases)`);
    if (typeof p.text !== 'string') fail('raw', `seq ${p.seq} text is not a string`);
    if (p.source !== c.source) fail('raw', `seq ${p.seq} source differs from the capture`);
    if (p.received?.clock !== NODE_CLOCK || !time(p.received.t) || p.arrived_after?.clock !== NODE_CLOCK || !time(p.arrived_after.t) ||
      p.arrived_after.t > p.received.t) fail('raw', `seq ${p.seq} lacks Node arrival bounds`);
  });
}
function checkLane(speech, c) {
  if (!Array.isArray(speech) || speech.length !== 1) fail('speech-lane', `expected exactly one observer-journal record, found ${Array.isArray(speech) ? speech.length : 'none'}`);
  const lane = plainData(speech[0], 'speech-lane');
  if (!object(lane) || lane.kind !== 'observer-journal' || lane.schema !== SPEECH_LANE_SCHEMA || !Array.isArray(lane.phrases) || lane.phrases.some(p => typeof p !== 'string')) fail('speech-lane', 'not a tabwise-r2-speech-lane/1 observer journal');
  if (lane.connected !== true || lane.complete !== true) fail('speech-lane', 'observer journal not connected and complete at its final read');
  if (lane.source !== c.source) fail('speech-lane', 'observer source differs from the capture');
  const covered = c.preexisting_phrases + c.raw.length;
  if (lane.phrases.length < covered) fail('speech-lane', `journal has ${lane.phrases.length} phrases; the capture saw ${covered}`);
  for (const p of c.raw) if (lane.phrases[p.seq - 1] !== p.text) fail('speech-lane', `raw seq ${p.seq} differs from the sealed observer journal`);
  return {late_phrases: lane.phrases.length - covered};
}
function checkRecords(c, actions) {
  const used = new Set();
  let lastAck = 0, lastTo = -Infinity, lastRaw = 0;
  c.records.forEach((r, i) => {
    const where = `record ${i + 1}`, a = actions[i];
    if (!object(r) || r.seq !== i + 1) fail(where, 'seq is not its position');
    if (r.step !== a.action || r.press !== a.press) fail(where, `differs from step map ${a.action} ${a.press}`);
    if ('invalidated' in r) fail(where, 'invalidated by a gate stop');
    if (!SUCCESS.has(r.capture_status)) fail(where, `status ${JSON.stringify(r.capture_status)} is not speech or observed-silence`);
    if (!Array.isArray(r.reasons) || r.reasons.length) fail(where, 'carries reasons');
    if (r.association !== 'observation-window-only') fail(where, 'association is not observation-window-only');
    if (r.execution?.started !== true || r.execution?.settled !== true || r.execution?.cancellation_requested !== false) fail(where, 'execution not started and settled');
    if (typeof r.text !== 'string' || !Array.isArray(r.raw_seq)) fail(where, 'text or raw_seq malformed');
    const w = r.observation_window, nw = r.node_window, at = r.ack_timing;
    if (!object(w) || w.clock !== NODE_CLOCK || w.reference !== 'gate-release' || !time(w.from) || !time(w.to) || !(w.to > w.from) ||
      !(w.policy_ms > 0) || w.to - w.from !== w.policy_ms) fail(where, 'observation window missing, not gate-release anchored or regressing');
    if (!object(nw) || nw.clock !== NODE_CLOCK || !time(nw.from) || !time(nw.to) || nw.from < lastTo || nw.from > w.from || nw.to < w.to) fail(where, 'node window regresses, overlaps the previous action or does not contain its observation window');
    if (!object(at) || at.clock !== NODE_CLOCK || at.reference !== 'gate-release' || at.release_at !== w.from) fail(where, 'release time is not the observation window start');
    if (!time(at.observed_at) || at.observed_at < at.release_at || at.observed_at > at.release_at + ACK_MS) fail(where, `acknowledgement not observed within ${ACK_MS} ms of release`);
    if (!int(r.ack_seq) || r.ack_seq <= lastAck) fail(where, 'ack_seq missing or not increasing');
    lastAck = r.ack_seq; lastTo = nw.to;
    for (const seq of r.raw_seq) {
      if (!int(seq) || used.has(seq) || seq <= lastRaw) fail(where, `raw seq ${seq} duplicated, reused, reordered or invalid`);
      used.add(seq); lastRaw = seq;
      const p = c.raw.find(x => x.seq === seq);
      if (!p) fail(where, `raw seq ${seq} missing from capture.raw`);
      if (!(p.arrived_after.t > w.from)) fail(where, `speech seq ${seq} not established after release (heard before the window)`);
      if (p.received.t > w.to) fail(where, `speech seq ${seq} observed after the observation window`);
    }
    if (r.capture_status === 'speech') {
      if (!r.raw_seq.length || 'silence' in r) fail(where, 'speech record without raw speech or with a silence claim');
      if (r.text !== r.raw_seq.map(seq => c.raw.find(x => x.seq === seq).text).join('\n')) fail(where, 'text is not its raw_seq speech');
    } else {
      const s = r.silence;
      if (r.raw_seq.length || r.text !== '') fail(where, 'observed-silence record carries speech');
      if (!object(s) || s.transport_live !== true || s.unit !== NODE_CLOCK || s.from !== w.from || s.to !== w.to) fail(where, 'silence lacks the live-transport observation window');
    }
  });
  const stray = c.raw.filter(p => !used.has(p.seq));
  if (stray.length) fail('capture', `raw seq ${stray[0].seq} is attributed to no action`);
}

const PAYLOAD_KEYS = {top: 'actions,fixture_id,observations', action: 'press,step', observation: 'ref,speech,step'};
const keysOf = v => Object.keys(v).sort().join(',');
function exactPayload(built) {
  if (!object(built) || keysOf(built) !== PAYLOAD_KEYS.top || !Array.isArray(built.actions) || !Array.isArray(built.observations)) fail('payload', 'top-level keys differ from the allowlist');
  const payload = {fixture_id: built.fixture_id, actions: built.actions.map(a => ({step: a.step, press: a.press})),
    observations: built.observations.map(o => ({step: o.step, ref: o.ref, speech: o.speech}))};
  if (built.actions.some(a => !object(a) || keysOf(a) !== PAYLOAD_KEYS.action) || built.observations.some(o => !object(o) || keysOf(o) !== PAYLOAD_KEYS.observation)) fail('payload', 'nested keys differ from the allowlist');
  if (canonical(payload) !== canonical(built)) fail('payload', 'allowlisted reconstruction differs');
  const strings = [payload.fixture_id, ...payload.actions.flatMap(a => [a.step, a.press]), ...payload.observations.flatMap(o => [o.step, o.ref, o.speech])];
  if (strings.some(s => typeof s !== 'string')) fail('payload', 'non-string value');
  const visual = speechPayloadErrors(payload);
  if (visual.length) fail('payload', visual[0]);
  return payload;
}

/**
 * assessR2SpeechPayload({capture, stepMap, speech, transform, fixture_id, redaction?}) -> {model_eligible, reasons,
 * payload, payload_sha256, redaction, late_phrases, source_verified:false}. Pure and deterministic. speech is the
 * parsed speech lane (one observer-journal record); transform is the verified title-nonce-suffix/1 record; fixture_id
 * is the blinded id from the approved plan; redaction, when given, must reproduce exactly. Never throws for bad
 * evidence: a refusal is model_eligible:false with one boundary-prefixed reason and no payload.
 */
export function assessR2SpeechPayload({capture, stepMap, speech, transform, fixture_id, redaction} = {}) {
  const refused = reason => ({model_eligible: false, reasons: [reason], payload: null, payload_sha256: null, redaction: null, late_phrases: null, source_verified: false});
  try {
    const map = checkStepMap(stepMap), t = checkTransform(transform), c = checkCapture(capture, map.actions);
    checkRaw(c);
    const {late_phrases} = checkLane(speech, c);
    checkRecords(c, map.actions);
    if (!opaqueFixture(fixture_id)) fail('payload', 'blinded fixture id is not an opaque f-<hex> identifier');
    const red = redactNonce(c.records.map(r => ({seq: r.seq, text: r.text})), t.nonce);
    if (!red.ok) return refused(red.reason);
    if (redaction !== undefined && canonical(plainData(redaction, 'redaction')) !== canonical(red.redaction)) fail('redaction', 'supplied redaction record does not reproduce');
    const built = buildArmPayload('speech', {fixture_id,
      speech: c.records.map((r, i) => ({seq: r.seq, step: map.actions[i].task, text: red.texts[i].text})),
      actions: map.actions.map(a => ({step: a.task, press: a.press}))});
    const payload = exactPayload(built);
    return {model_eligible: true, reasons: [], payload, payload_sha256: sha256(canonical(payload)), redaction: red.redaction, late_phrases, source_verified: false};
  } catch (error) {
    return refused(error.boundary ? error.message : `capture: ${error.message}`);
  }
}

// ---- production boundary ----
const verified = new WeakMap();
function readSealed(dir, name) {
  const stat = lstatSync(join(dir, name));
  if (!stat.isFile() || stat.size > READ_CAP) throw Error(`speech payload: sealed ${name} is not a bounded regular file`);
  return readFileSync(join(dir, name));
}
function parseLane(buffer) {
  const body = buffer.toString('utf8');
  if (!body) return [];
  if (!body.endsWith('\n')) throw Error('speech payload: speech lane truncated');
  return body.slice(0, -1).split('\n').map(line => JSON.parse(line));
}

/**
 * openVerifiedR2SpeechEvidence(dir, {fixture, approved}) -> opaque frozen handle. Reads the sealed files, runs the
 * independent S3 verifier (verifyR2PageEvidence) and requires ok and class 'genuine-unqualified', then binds the
 * verified manifest digest to the exact capture and speech-lane bytes it read. Throws otherwise. Today S3 never
 * yields 'genuine-unqualified' (no runtime attestation before S5b/S6), so this refuses every directory.
 */
export async function openVerifiedR2SpeechEvidence(dir, {fixture, approved} = {}) {
  const before = readSealed(dir, 'manifest.json');
  const verification = await verifyR2PageEvidence(dir, {fixture, approved});
  if (!verification.ok) throw Error(`speech payload: sealed evidence does not verify: ${verification.errors.join('; ') || verification.class}`);
  if (verification.class !== 'genuine-unqualified') {
    throw Error(`speech payload: independently verified genuine evidence required; verifier class is ${verification.class}` +
      (verification.class === 'synthetic' ? ` (${ATTESTATION_UNAVAILABLE})` : ''));
  }
  const manifestBytes = readSealed(dir, 'manifest.json');
  if (!before.equals(manifestBytes)) throw Error('speech payload: manifest changed during verification');
  const manifest = JSON.parse(manifestBytes), digest = sha256(manifestBytes);
  if (readSealed(dir, 'manifest.sha256').toString('utf8') !== `${digest}  manifest.json\n`) throw Error('speech payload: manifest digest');
  const file = name => {
    const bytes = readSealed(dir, name), entry = manifest.files.find(f => f.path === name);
    if (!entry || entry.sha256 !== sha256(bytes) || entry.bytes !== bytes.length) throw Error(`speech payload: ${name} differs from the verified manifest`);
    return bytes;
  };
  const capture = JSON.parse(file('capture.json')), speech = parseLane(file('speech.jsonl'));
  const handle = Object.freeze({manifest_sha256: digest});
  verified.set(handle, structuredClone({manifest_sha256: digest, step_map: manifest.step_map, transform: manifest.transform, capture, speech}));
  return handle;
}

/**
 * buildR2SpeechPayload({capture, stepMap, redaction, manifest, fixture_id}) -> {model_eligible, reasons, payload,
 * arm_input}. manifest must be a handle from openVerifiedR2SpeechEvidence; any other value (including an object
 * claiming class 'genuine-unqualified' or verified:true) throws. capture and stepMap are optional and, when given,
 * must equal the verified sealed ones exactly. The arm-input record is the S6 manifest entry; it is not written into
 * the S3-sealed page directory (the S3 verifier refuses extra files).
 */
export function buildR2SpeechPayload({capture, stepMap, redaction, manifest, fixture_id} = {}) {
  const source = (object(manifest) || typeof manifest === 'function') ? verified.get(manifest) : undefined;
  if (!source) throw Error('speech payload: manifest is not an independently verified genuine evidence handle');
  if (capture !== undefined && canonical(capture) !== canonical(source.capture)) throw Error('speech payload: capture differs from the verified sealed capture');
  if (stepMap !== undefined && canonical(stepMap) !== canonical(source.step_map)) throw Error('speech payload: step map differs from the verified sealed step map');
  const result = assessR2SpeechPayload({capture: source.capture, stepMap: source.step_map, speech: source.speech, transform: source.transform, fixture_id, redaction});
  const arm_input = {schema: ARM_INPUT_SCHEMA, builder: BUILDER_VERSION, redaction_version: REDACTION_VERSION, manifest_sha256: source.manifest_sha256,
    payload_sha256: result.payload_sha256, redaction: result.redaction, model_eligible: result.model_eligible, reasons: [...result.reasons]};
  return {model_eligible: result.model_eligible, reasons: result.reasons, payload: result.payload, arm_input};
}
