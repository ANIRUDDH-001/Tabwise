import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildArmPayload } from '../src/r2/preparation.mjs';

test('R2 arms: both receive only the same declared keys, and observations have citable identities', () => {
  const evidence = {
    fixture_id: 'f-abc', actions: [{ step: 'a01', press: 'Tab', expect_focus: 'secret', healthy: true }],
    speech: [{ seq: 7, step: 'a01', text: 'Control' }], screenshots: [{ seq: 3, step: 'a01', image: 'data:image/png;base64,AAAA' }],
  };
  const speech = buildArmPayload('speech', evidence), visual = buildArmPayload('visual', evidence);
  assert.deepEqual(speech.actions, [{ step: 'a01', press: 'Tab' }]);
  assert.deepEqual(visual.actions, speech.actions);
  assert.equal(speech.observations[0].ref, 'speech:7');
  assert.equal(visual.observations[0].ref, 'visual:3');
  assert.equal(JSON.stringify(speech).includes('secret'), false);
});

// ---- R2-L2 C-3: production speech payload builder, pure core (design §8.6, §8.7; CLOUD-R2-L2-04) ----
// Controlled in-memory evidence in the captureJourney (receipts) shape. The production entry, which requires
// independently verified genuine evidence, is exercised against sealed S3 directories in test/r2-evidence.test.mjs.
import { readFileSync as readC3 } from 'node:fs';
import { createHash as hashC3 } from 'node:crypto';
import { assessR2SpeechPayload, redactNonce, buildR2SpeechPayload, speechLaneRecord, REDACTION_VERSION, NONCE_MARKER,
  SPEECH_LANE_SCHEMA } from '../src/r2/speech-payload.mjs';
import { buildR2StepMap, applyTitleNonce } from '../scripts/tabwise/r2-evidence.mjs';
import { speechModelPayload } from '../src/r2/binding.mjs';

const C3_MANIFEST = JSON.parse(readC3(new URL('../fixtures/r2/manifest.json', import.meta.url), 'utf8'));
const C3_PAIR = C3_MANIFEST.pairs.find(p => p.id === 'validation');
const C3_FIXTURE = readC3(new URL(`../fixtures/r2/${C3_PAIR.healthy.file}`, import.meta.url));
const C3_NONCE = '3f9a0c1b';
const C3_TRANSFORM = applyTitleNonce(C3_FIXTURE, C3_NONCE).record;
const C3_MAP = buildR2StepMap(C3_PAIR.task.map(({ step, press }) => ({ step, press })));
const C3_ID = 'f-9c2e';
const NODE = 'node-monotonic-ms';
const c3sha = value => hashC3('sha256').update(value).digest('hex');

// Record k (1-based) opens at 100k, releases at 100k+10, observes until 100k+60; speech arrives 5..10 ms after release.
function c3Evidence({ texts = ['email, edit text', 'Submit, button', null], pre = ['Newsletter sign-up 3f9a0c1b'] } = {}) {
  const phrases = [...pre], raw = [];
  const records = C3_MAP.actions.map((a, i) => {
    const from = 100 * (i + 1), release = from + 10, to = release + 50;
    const record = { seq: i + 1, step: a.action, press: a.press, capture_status: 'observed-silence', text: '', raw_seq: [], ack_seq: 2 * i + 1,
      ack_timing: { clock: NODE, reference: 'gate-release', deadline_ms: 1000, release_at: release, commit_not_before: release - 2, observed_at: release + 1, late_observed_at: null },
      execution: { started: true, settled: true, cancellation_requested: false, quiescence: 'UNVERIFIED' },
      association: 'observation-window-only', node_window: { clock: NODE, from, to: to + 1 },
      page: { before: { cursor: 2 * i }, after: { cursor: 2 * i + 2 }, samples: [], events: [{ seq: 2 * i + 1, type: 'keydown', key: a.press }], rejected: [] },
      reasons: [], gate_receipt: { step: a.action, complete: true },
      observation_window: { clock: NODE, reference: 'gate-release', from: release, to, policy_ms: 50 } };
    const said = texts[i];
    if (said === null) record.silence = { transport_live: true, from: release, to, unit: NODE };
    else {
      for (const [j, text] of (Array.isArray(said) ? said : [said]).entries()) {
        phrases.push(text);
        raw.push({ seq: phrases.length, source: 'nvda', text, received: { clock: NODE, t: release + 6 + j }, arrived_after: { clock: NODE, t: release + 1 } });
        record.raw_seq.push(phrases.length);
      }
      record.capture_status = 'speech';
      record.text = record.raw_seq.map(seq => phrases[seq - 1]).join('\n');
    }
    return record;
  });
  const capture = { schema: 'r2-capture/1', fixture_id: 'validation', source: 'nvda', evidence_class: 'MACHINE', evidence_scope: 'injected transport; no hosted provenance attestation',
    guarded_execution_verified: false, completed: true, outcome: 'COMPLETE', preexisting_phrases: pre.length, records, raw,
    unattributed: [], unattributed_page: [], reasons: [], gate_receipts: { complete: true, receipts: [] } };
  const speech = speechLaneRecord({ source: 'nvda', session: 'observer-1', connected: true, complete: true, phrases });
  return { capture, stepMap: structuredClone(C3_MAP), speech: [speech], transform: { ...C3_TRANSFORM }, fixture_id: C3_ID };
}
const c3 = (mutate, options) => { const e = c3Evidence(options); mutate?.(e); return assessR2SpeechPayload(e); };
function c3Refused(result, pattern, where) {
  assert.equal(result.model_eligible, false, where);
  assert.equal(result.payload, null, `${where}: no payload on refusal`);
  assert.equal(result.payload_sha256, null, where);
  assert.equal(result.source_verified, false, where);
  assert.match(result.reasons.join('\n'), pattern, where);
}
const keysDeep = value => Array.isArray(value) ? value.map(keysDeep) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, keysDeep(value[k])])) : typeof value;

// ---- positive ----
test('C3-P1 exact allowlisted payload: task ids, presses, speech:<record seq> refs, silence as empty string', () => {
  const evidence = c3Evidence(), before = structuredClone(evidence);
  const r = assessR2SpeechPayload(evidence);
  assert.equal(r.model_eligible, true, r.reasons.join('; '));
  assert.deepEqual(r.payload, {
    fixture_id: C3_ID,
    actions: [{ step: 'to-email', press: 'Tab' }, { step: 'to-submit', press: 'Tab' }, { step: 'submit', press: 'Enter' }],
    observations: [{ step: 'to-email', ref: 'speech:1', speech: 'email, edit text' }, { step: 'to-submit', ref: 'speech:2', speech: 'Submit, button' },
      { step: 'submit', ref: 'speech:3', speech: '' }],
  });
  // Recursive key/type shape, not just top-level keys.
  assert.deepEqual(keysDeep(r.payload), { actions: [{ press: 'string', step: 'string' }, { press: 'string', step: 'string' }, { press: 'string', step: 'string' }],
    fixture_id: 'string', observations: [{ ref: 'string', speech: 'string', step: 'string' }, { ref: 'string', speech: 'string', step: 'string' }, { ref: 'string', speech: 'string', step: 'string' }] });
  assert.doesNotMatch(JSON.stringify(r.payload), /\ba[0-9]\b|validation|3f9a0c1b|nvda|release|window|page|gate|ack|Newsletter/);
  assert.equal(r.source_verified, false, 'the pure core never claims a verified source');
  assert.deepEqual(evidence, before, 'inputs are not mutated');
});

test('C3-P2 deterministic payload hash over canonical JSON; equal inputs give equal hashes', () => {
  const a = c3(), b = c3();
  const canonical = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x);
  assert.equal(a.payload_sha256, c3sha(canonical(a.payload)));
  assert.equal(a.payload_sha256, b.payload_sha256);
  assert.notEqual(c3(e => { e.fixture_id = 'f-9c2f'; }).payload_sha256, a.payload_sha256);
});

test('C3-P3 multi-phrase speech record joins its raw entries with newlines, in raw order', () => {
  const r = c3(null, { texts: [['email,', 'edit text'], 'Submit, button', null] });
  assert.equal(r.model_eligible, true, r.reasons.join('; '));
  assert.equal(r.payload.observations[0].speech, 'email,\nedit text');
});

test('C3-P4 literal nonce redacted case-insensitively; raw transcripts unchanged; edits replay exactly', () => {
  const e = c3Evidence({ texts: ['Newsletter sign-up 3F9A0C1B, email, edit text', 'Submit 3f9a0c1b button 3f9a0c1b', null] });
  const before = structuredClone(e.capture);
  const r = assessR2SpeechPayload(e);
  assert.equal(r.model_eligible, true, r.reasons.join('; '));
  assert.equal(r.payload.observations[0].speech, `Newsletter sign-up ${NONCE_MARKER}, email, edit text`);
  assert.equal(r.payload.observations[1].speech, `Submit ${NONCE_MARKER} button ${NONCE_MARKER}`);
  assert.deepEqual(r.redaction, { version: REDACTION_VERSION, nonce_sha256: c3sha(C3_NONCE), edits: [
    { seq: 1, form: 'literal', start: 19, end: 27, original: '3F9A0C1B' },
    { seq: 2, form: 'literal', start: 7, end: 15, original: '3f9a0c1b' },
    { seq: 2, form: 'literal', start: 23, end: 31, original: '3f9a0c1b' }] });
  assert.deepEqual(e.capture, before, 'raw capture is never modified');
  assert.doesNotMatch(JSON.stringify(r.payload), /3f9a0c1b/i, 'the model payload never carries the nonce');
  assert.doesNotMatch(JSON.stringify({ ...r, redaction: { ...r.redaction, edits: [] } }), /3f9a0c1b/i, 'only edit originals (arm-input record, never model-facing) keep it');
  // Replay: applying the recorded edits to the raw text reproduces the payload text.
  for (const record of e.capture.records.filter(x => x.text)) {
    let text = record.text;
    for (const edit of r.redaction.edits.filter(x => x.seq === record.seq).reverse()) {
      assert.equal(text.slice(edit.start, edit.end), edit.original);
      text = text.slice(0, edit.start) + NONCE_MARKER + text.slice(edit.end);
    }
    assert.equal(text, r.payload.observations[record.seq - 1].speech);
  }
});

test('C3-P5 NVDA-spaced nonce with whitespace and single , . - separators is redacted; UTF-16 offsets', () => {
  for (const [spoken, form] of [['3 f 9 a 0 c 1 b', 'spaced'], ['3, F. 9 - a 0 c 1 b', 'spaced'], ['3  f\t9 a 0 c 1 b', 'spaced']]) {
    const text = `Drafts 😀 ${spoken} edit`;
    const r = c3(null, { texts: [text, 'Submit, button', null] });
    assert.equal(r.model_eligible, true, `${spoken}: ${r.reasons.join('; ')}`);
    assert.equal(r.payload.observations[0].speech, `Drafts 😀 ${NONCE_MARKER} edit`);
    const [edit] = r.redaction.edits;
    assert.deepEqual(edit, { seq: 1, form, start: 10, end: 10 + spoken.length, original: spoken }, 'UTF-16 offsets (the emoji is two code units)');
    assert.equal(text.slice(edit.start, edit.end), spoken);
  }
});

test('C3-P6 supplied redaction record that reproduces exactly is accepted (verifier rebuild)', () => {
  const first = c3(null, { texts: ['Drafts 3f9a0c1b', 'Submit, button', null] });
  const again = c3(e => { e.redaction = structuredClone(first.redaction); }, { texts: ['Drafts 3f9a0c1b', 'Submit, button', null] });
  assert.equal(again.model_eligible, true, again.reasons.join('; '));
  assert.equal(again.payload_sha256, first.payload_sha256);
});

test('C3-P7 redactNonce is pure: no nonce present gives no edits and identical texts', () => {
  const out = redactNonce([{ seq: 1, text: 'email, edit text' }, { seq: 2, text: '' }], C3_NONCE);
  assert.deepEqual(out, { ok: true, reason: null, texts: [{ seq: 1, text: 'email, edit text' }, { seq: 2, text: '' }],
    redaction: { version: REDACTION_VERSION, nonce_sha256: c3sha(C3_NONCE), edits: [] } });
});

test('C3-P8 speech lane record is a fixed allowlisted shape over a detached observer read', () => {
  const read = { source: 'nvda', session: 's', connected: true, complete: true, phrases: ['a'], extra: 'dropped' };
  const lane = speechLaneRecord(read);
  assert.deepEqual(lane, { kind: 'observer-journal', schema: SPEECH_LANE_SCHEMA, source: 'nvda', session: 's', connected: true, complete: true, phrases: ['a'] });
  read.phrases.push('b'); assert.deepEqual(lane.phrases, ['a']);
  assert.throws(() => speechLaneRecord({ ...read, phrases: [1] }), /speech lane/);
});

// ---- negative: eligibility (every refusal names its boundary and yields no payload) ----
const C3_NEGATIVE = [
  ['capture not completed', e => { e.capture.completed = false; }, /^capture: /],
  ['capture outcome not COMPLETE', e => { e.capture.outcome = 'INSUFFICIENT_EVIDENCE'; }, /^capture: /],
  ['capture reasons present', e => { e.capture.reasons.push('a1: ack'); }, /^capture: /],
  ['gate_stop present', e => { e.capture.gate_stop = { where: 'completion' }; }, /^capture: .*gate_stop/],
  ['forged COMPLETE over an invalidated record', e => { e.capture.records[1].invalidated = { by: 'gate-stop' }; }, /^record 2: .*invalidat/],
  ['non-empty unattributed speech', e => { e.capture.unattributed.push({ seq: 9, text: 'stray' }); }, /^capture: .*unattributed/],
  ['non-empty unattributed page', e => { e.capture.unattributed_page.push({ events: [] }); }, /^capture: .*unattributed/],
  ['failed record status', e => { e.capture.records[2].capture_status = 'failed'; }, /^record 3: .*status/],
  ['record with reasons', e => { e.capture.records[0].reasons.push('x'); }, /^record 1: /],
  ['other association', e => { e.capture.records[0].association = 'causal'; }, /^record 1: .*association/],
  ['executor not settled', e => { e.capture.records[0].execution.settled = false; }, /^record 1: .*execution/],
  ['missing action (count)', e => { e.capture.records.pop(); }, /^capture: .*3 actions/],
  ['extra action (count)', e => { e.capture.records.push({ ...structuredClone(e.capture.records[2]), seq: 4, step: 'a4' }); }, /^capture: .*3 actions/],
  ['reordered actions', e => { const [a, b] = e.capture.records; e.capture.records[0] = { ...b, seq: 1 }; e.capture.records[1] = { ...a, seq: 2 }; }, /^record 1: .*step map/],
  ['wrong press', e => { e.capture.records[2].press = 'Space'; }, /^record 3: .*step map/],
  ['wrong action identity', e => { e.capture.records[0].step = 'a9'; }, /^record 1: .*step map/],
  ['wrong record seq', e => { e.capture.records[1].seq = 5; }, /^record 2: /],
  ['step map not tabwise-r2-step-map/1', e => { e.stepMap.version = 'x'; }, /^step-map: /],
  ['step map not the recomputed bijection', e => { e.stepMap.actions[1].action = 'a7'; }, /^step-map: /],
  ['step map with an invalid task id', e => { e.stepMap.actions[0].task = 'To Email'; }, /^step-map: /],
  ['duplicate raw sequence reference', e => { e.capture.records[1].raw_seq = [2, 2]; e.capture.records[1].text = 'email, edit text\nemail, edit text'; }, /^record 2: .*raw/],
  ['raw sequence reused by two records', e => { e.capture.records[1].raw_seq = [2]; e.capture.records[1].text = 'email, edit text'; }, /^record 2: .*raw/],
  ['missing raw entry', e => { e.capture.records[1].raw_seq = [7]; }, /^record 2: .*raw/],
  ['raw-to-record text mismatch', e => { e.capture.records[0].text = 'forged'; }, /^record 1: .*text/],
  ['raw entry altered (differs from speech lane)', e => { e.capture.raw[0].text = 'forged'; e.capture.records[0].text = 'forged'; }, /^speech-lane: /],
  ['raw entries not contiguous after preexisting phrases', e => { e.capture.raw[0].seq = 1; e.capture.records[0].raw_seq = [1]; e.capture.records[0].text = e.speech[0].phrases[0]; }, /^raw: /],
  ['raw duplicated', e => { e.capture.raw.push(structuredClone(e.capture.raw[1])); }, /^raw: /],
  ['speech lane missing', e => { e.speech = []; }, /^speech-lane: /],
  ['two speech lane records', e => { e.speech.push(structuredClone(e.speech[0])); }, /^speech-lane: /],
  ['speech lane journal shorter than capture', e => { e.speech[0].phrases.pop(); }, /^speech-lane: /],
  ['speech lane disconnected', e => { e.speech[0].connected = false; }, /^speech-lane: /],
  ['speech lane wrong schema', e => { e.speech[0].schema = 'x'; }, /^speech-lane: /],
  ['speech lane source differs from the capture', e => { e.speech[0].source = 'other'; }, /^speech-lane: /],
  ['non-string observation text', e => { e.capture.records[0].text = { dom: '<div>' }; }, /^record 1: /],
  ['non-string raw text', e => { e.capture.raw[0].text = 5; }, /^raw: /],
  ['silence without a window', e => { delete e.capture.records[2].silence; }, /^record 3: .*silence/],
  ['silence with transport not live', e => { e.capture.records[2].silence.transport_live = false; }, /^record 3: .*silence/],
  ['silence window differs from observation window', e => { e.capture.records[2].silence.to -= 1; }, /^record 3: .*silence/],
  ['silence carrying text', e => { e.capture.records[2].text = 'x'; }, /^record 3: /],
  ['speech record carrying a silence claim', e => { e.capture.records[0].silence = { transport_live: true }; }, /^record 1: /],
  ['observation window missing', e => { delete e.capture.records[0].observation_window; }, /^record 1: .*window/],
  ['observation window not gate-release anchored', e => { e.capture.records[0].observation_window.reference = 'executor-request'; }, /^record 1: .*window/],
  ['observation window regressing (to before from)', e => { e.capture.records[0].observation_window.to = 5; }, /^record 1: .*window/],
  ['release time not the window start', e => { e.capture.records[0].ack_timing.release_at = 12; }, /^record 1: .*release/],
  ['records overlapping in time', e => { e.capture.records[1].node_window.from = 120; }, /^record 2: .*window/],
  ['missing observation timestamp', e => { e.capture.records[1].ack_timing.observed_at = null; }, /^record 2: /],
  ['acknowledgement beyond 1000 ms of release', e => { e.capture.records[1].ack_timing.observed_at = e.capture.records[1].ack_timing.release_at + 1001; }, /^record 2: /],
  ['ack_seq not increasing', e => { e.capture.records[1].ack_seq = 1; }, /^record 2: .*ack/],
  ['premature speech labelled as action speech', e => { e.capture.raw[0].arrived_after.t = 105; }, /^record 1: .*before/],
  ['late speech labelled as action speech', e => { e.capture.raw[0].received.t = 200; }, /^record 1: .*after/],
  ['raw entry without arrival bound', e => { delete e.capture.raw[0].arrived_after; }, /^raw: /],
  ['blinded fixture id not opaque', e => { e.fixture_id = 'validation'; }, /^payload: .*fixture/],
  ['nonce transform not title-nonce-suffix/1', e => { e.transform.transform = 'other'; }, /^transform: /],
  ['nonce not 8 lowercase hex', e => { e.transform.nonce = '3F9A0C1B'; }, /^transform: /],
  ['supplied redaction with an extra edit', e => { e.redaction = { version: REDACTION_VERSION, nonce_sha256: c3sha(C3_NONCE), edits: [{ seq: 1, form: 'literal', start: 0, end: 8, original: 'email, e' }] }; }, /^redaction: .*reproduce/],
  ['supplied redaction for another nonce (transform mismatch)', e => { e.redaction = { version: REDACTION_VERSION, nonce_sha256: c3sha('00000000'), edits: [] }; }, /^redaction: .*reproduce/],
  ['supplied redaction of another version', e => { e.redaction = { version: 'nonce-redact/0', nonce_sha256: c3sha(C3_NONCE), edits: [] }; }, /^redaction: .*reproduce/],
  ['HTML injected as speech', e => { e.capture.raw[0].text = '<html><body>x'; e.capture.records[0].text = '<html><body>x'; e.speech[0].phrases[1] = '<html><body>x'; }, /^payload: .*visual/],
  ['image data URI injected as speech', e => { const t = 'data:image/png;base64,AAAA'; e.capture.raw[0].text = t; e.capture.records[0].text = t; e.speech[0].phrases[1] = t; }, /^payload: .*visual/],
  ['capture not an r2-capture/1 result', e => { e.capture.schema = 'r2-capture/0'; }, /^capture: /],
  ['records with a getter (untrusted object behaviour)', e => { Object.defineProperty(e.capture.records[0], 'text', { get: () => 'email, edit text', enumerable: true }); }, /^capture: .*plain/],
  ['capture with a non-plain prototype', e => { e.capture = Object.assign(Object.create({ completed: true }), e.capture); }, /^capture: .*plain/],
];
for (const [name, mutate, pattern] of C3_NEGATIVE) test(`C3-N ${name}`, () => c3Refused(c3(mutate), pattern, name));

// ---- negative: nonce-redact/1 ambiguity (the page is refused for model use, evidence untouched) ----
const C3_AMBIGUOUS = [
  ['partially spoken (spaced, 5 of 8)', '3 f 9 a 0 email'],
  ['partially spoken (spaced, exactly 4)', 'title 3 f 9 a done'],
  ['interrupted spelling', '3 f 9 a, uh, 0 c 1 b'],
  ['digit words mixed with hex characters', 'three f nine a zero c one b'],
  ['digit words partial', 'three F nine A'],
  ['spaced with two punctuation marks', '3 ,, f 9 a 0 c 1 b'],
  ['pre-existing marker in raw text', `Drafts ${NONCE_MARKER}`],
  ['overlapping candidate spellings', null],
];
for (const [name, text] of C3_AMBIGUOUS) test(`C3-A ${name}`, () => {
  const e = text === null ? c3Evidence({ texts: ['3 f 9 a 0 c 1 b 3 f 9 a 0 c 1 b', 'x', null] }) : c3Evidence({ texts: [text, 'Submit, button', null] });
  if (text === null) { e.transform = { ...e.transform, nonce: 'abababab' }; for (const s of [e.capture.raw[0], e.capture.records[0]]) s.text = 'a b a b a b a b a b'; e.speech[0].phrases[1] = 'a b a b a b a b a b'; }
  const before = structuredClone(e.capture);
  const r = assessR2SpeechPayload(e);
  c3Refused(r, /^nonce-sanitization-ambiguous/, name);
  assert.deepEqual(e.capture, before, 'evidence untouched');
  assert.equal(r.redaction, null);
});

test('C3-A nonce spelled across a record boundary is ambiguous, not two clean records', () => {
  for (const texts of [['email 3 f 9 a', '0 c 1 b button', null], ['email 3f9a', '0c1b', null]]) {
    const r = c3(null, { texts });
    if (texts[0].includes(' 3 f')) c3Refused(r, /^nonce-sanitization-ambiguous/, texts.join('|'));
    else assert.equal(r.model_eligible, true, 'contiguous fragments are outside nonce-redact/1 rule 1 (disclosed limitation)');
  }
});

test('C3-A nonce spelled across two observer phrases inside one record is ambiguous', () => {
  c3Refused(c3(null, { texts: [['email 3 f 9 a', '0 c 1 b'], 'Submit, button', null] }), /^nonce-sanitization-ambiguous/, 'phrase boundary');
});

// Review correction A (security): the literal form needs non-alphanumeric neighbours (design §8.7), so a nonce glued to
// letters or digits is not redacted. Such a record still holds the complete nonce and must be refused, never passed on.
const C3_ADJACENT = [
  ['letters on both sides', 'prefix3f9a0c1bsuffix'],
  ['hyphen before, letter after', 'account-3f9a0c1bZ'],
  ['digit after', 'hello 3f9a0c1b7 next'],
  ['letter prefix only', 'code x3f9a0c1b'],
  ['letter suffix only', '3f9a0c1bx field'],
  ['digit before', 'id 73f9a0c1b'],
  ['uppercase, letter after', 'ID 3F9A0C1BX'],
  ['mixed case, digit before', 'ref 93F9a0C1b'],
];
for (const [name, text] of C3_ADJACENT) test(`C3-A a complete nonce left after redaction is refused: ${name}`, () => {
  const e = c3Evidence({ texts: [text, 'Submit, button', null] });
  const before = structuredClone(e.capture);
  const r = assessR2SpeechPayload(e);
  c3Refused(r, /^nonce-sanitization-ambiguous: record 1 still contains the complete nonce after redaction/, name);
  assert.equal(r.redaction, null);
  assert.deepEqual(e.capture, before, 'raw evidence untouched');
  assert.doesNotMatch(JSON.stringify(r), /3f9a0c1b/i, 'neither payload nor reasons carry the nonce');
  const direct = redactNonce([{ seq: 1, text: 'ok' }, { seq: 2, text }], C3_NONCE);
  assert.deepEqual([direct.ok, direct.texts, direct.redaction], [false, null, null]);
  assert.match(direct.reason, /record 2 still contains the complete nonce/);
});

test('C3-A a record with one redacted and one adjacent copy is refused; a standalone uppercase copy is still redacted', () => {
  c3Refused(c3(null, { texts: ['3f9a0c1b then x3f9a0c1b', 'Submit, button', null] }), /^nonce-sanitization-ambiguous: record 1 still contains/, 'mixed');
  const r = c3(null, { texts: ['code 3F9A0C1B, edit text', 'Submit, button', null] });
  assert.equal(r.model_eligible, true, r.reasons.join('; '));
  assert.deepEqual(r.redaction.edits.map(e => [e.form, e.original]), [['literal', '3F9A0C1B']]);
  assert.doesNotMatch(JSON.stringify(r.payload), /3f9a0c1b/i);
});

test('C3 synthetic-only speechModelPayload still refuses a genuine-shaped capture', () => {
  const { capture } = c3Evidence();
  assert.throws(() => speechModelPayload({ ...capture, provenance: { kind: 'genuine-unqualified', attestation: 'ATTESTED' } }), /non-synthetic|invalid/);
  assert.throws(() => speechModelPayload(capture), /non-synthetic|invalid/);
});

test('C3 production builder refuses caller-supplied manifests, classes and verification flags (no verified handle)', () => {
  const e = c3Evidence();
  for (const manifest of [undefined, null, {}, { class: 'genuine-unqualified' }, { class: 'genuine-unqualified', verified: true, ok: true },
    Object.freeze({ manifest_sha256: '0'.repeat(64) }), { verification: { ok: true, class: 'genuine-unqualified' } }]) {
    assert.throws(() => buildR2SpeechPayload({ capture: e.capture, stepMap: e.stepMap, manifest, fixture_id: C3_ID }),
      /independently verified genuine evidence handle/, JSON.stringify(manifest));
  }
});

test('C3-R1 adversarial whitespace runs between nonce characters are scanned in linear time (no catastrophic backtracking)', () => {
  const ws = ' '.repeat(4000);
  const text = [...'3f9a0c1'].join(ws) + ws + 'x';
  const t0 = performance.now();
  const out = redactNonce([{ seq: 1, text }], C3_NONCE);
  assert.ok(performance.now() - t0 < 5000, 'bounded scan');
  assert.equal(out.ok, false, 'seven spaced nonce characters remain: ambiguous');
  assert.match(out.reason, /^nonce-sanitization-ambiguous/);
});
