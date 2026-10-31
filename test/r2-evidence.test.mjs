import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createR2PageSource} from '../src/r2/page-source.mjs';
import {createPageJournal} from '../src/r2/page-journal.mjs';
import {captureJourney} from '../src/r2/capture.mjs';
import {VK} from '../src/speech/sendguard.mjs';
import {createR2EvidenceWriter, verifyR2PageEvidence, planR2EvidenceCaps, buildR2StepMap, applyTitleNonce, encodeBounded,
  sealR2Run, verifyR2Run, LANES, TOTAL_CAP, REJECTED_CAP, ATTESTATION_UNAVAILABLE} from '../scripts/tabwise/r2-evidence.mjs';

// ---- R2-L2 S3: evidence writer and independent page-read reconstruction verifier (design §8.1, §8.2, §8.4, §8.5) ----
// Code was written before these tests, so there is no recorded RED run; mutation checks are reported separately.
const manifest = JSON.parse(readFileSync(new URL('../fixtures/r2/manifest.json', import.meta.url), 'utf8'));
const pair = manifest.pairs.find(p => p.id === 'validation');
const FIXTURE = readFileSync(new URL(`../fixtures/r2/${pair.healthy.file}`, import.meta.url));
const APPROVED = {fixture_sha256: pair.healthy.sha256, task: pair.task.map(({step, press}) => ({step, press}))};
const SPEC = {actions: 3, ackMs: 1000, timeoutMs: 2000, observationMs: 1500, pollMs: 50};
const PAGE = {fixture_id: 'validation', session: 'page-s3', port: 4100};
const NONCE = '0a1b2c3d';
const FLAGS = {shift: false, ctrl: false, alt: false, meta: false, repeat: false};
const INPUTS = {fixture: FIXTURE, approved: APPROVED};
const sha256 = data => createHash('sha256').update(data).digest('hex');

const roots = [];
const temp = () => { const d = mkdtempSync(join(tmpdir(), 'tabwise-r2-s3-')); roots.push(d); return d; };
test.after(() => { for (const d of roots) rmSync(d, {recursive: true, force: true}); });
const options = (dir, extra = {}) => ({enabled: true, dir, page: PAGE, fixture: FIXTURE, approved: APPROVED, nonce: NONCE, spec: SPEC, ...extra});

// Real S2 page source and R2-L1 adapter over a scripted raw journal, writing through the S3 writer.
function harness(dir, {edit, approved} = {}) {
  const writer = createR2EvidenceWriter(options(dir, approved ? {approved} : {}));
  const raw = {session: PAGE.session, complete: true, clock: 'page-monotonic-ms', t: 100, active: 'body', title: writer.identity.title,
    url: writer.identity.url, state: {dialogs: [], invalid: [], live: []}, state_overflow: false, event_count: 0, overflow: false,
    dropped: 0, events: [], page_reported: null, page_reported_overflow: false, reasons: [], network_restrictions: true};
  const h = {writer, raw, intents: [], now: 0, samples: [], records: []};
  h.add = (type, detail = {}) => {
    raw.t += 1;
    const event = {seq: raw.events.length + 1, t: raw.t, type, target: raw.active, active: raw.active, element: null, ...detail};
    if (['keydown', 'focusin', 'focusout'].includes(type) && !('isTrusted' in detail)) event.isTrusted = true;
    raw.active = event.active; raw.events.push(event); raw.event_count = raw.events.length;
  };
  h.key = (key, flags = {}) => h.add('keydown', {key, code: key, location: 0, ...FLAGS, ...flags});
  h.intent = (action, ...vks) => { h.intents.push({action, keys: vks}); writer.append('intents', {action, keys: vks}); };
  h.source = createR2PageSource({evaluate: async () => { const v = structuredClone(raw); edit?.(v); return v; }, session: PAGE.session,
    served: {title: writer.identity.title, url: writer.identity.url}, journey: writer.identity.step_map.actions.map(({action, press}) => ({action, press})),
    intents: () => h.intents, writer, now: () => (h.now += 5)});
  h.journal = createPageJournal({source: h.source, writer});
  h.sample = async () => {
    const v = await h.journal.snapshot();
    const s = {session: v.session, clock: v.clock, t: v.t, active: v.active, state: v.state, cursor: v.events.length, node_received: {clock: 'node-monotonic-ms', t: h.now}};
    return s;
  };
  return h;
}

// Healthy validation journey through the real captureJourney (src/r2/capture.mjs) on a fake Node clock: Tab to
// email, Tab to submit, Enter raises the validation error. The state change arrives with its runner-observed
// mutation in one read (the page-authored app event alone never justifies it); a later read extends page_reported.
const PRESS_VKS = {Tab: [VK.Tab], 'Shift+Tab': [VK.Shift, VK.Tab], Enter: [VK.Enter], Space: [VK.Space]};
async function journey(h, {capture = true, steps: override = {}} = {}) {
  let T = 0;
  const phrases = [], later = [];
  const steps = {
    a1: () => { h.key('Tab'); h.add('focusin', {target: 'email', active: 'email'}); },
    a2: () => { h.key('Tab'); h.add('focusout', {target: 'email', active: 'email'}); h.add('focusin', {target: 'submit', active: 'submit'}); },
    a3: () => {
      h.key('Enter');
      h.add('app', {name: 'validation-error', detail: {field: 'email'}, source: 'page-authored'});
      h.add('mutation', {target: 'email-error'});
      h.raw.state = {dialogs: [], invalid: ['email'], live: ['Enter your email address']};
      h.raw.page_reported = [{name: 'validation-error'}];
      phrases.push('Enter your email address');
      later.push(null, () => { h.raw.page_reported = [{name: 'validation-error'}, {name: 'announced'}]; h.add('mutation', {target: 'email-error'}); });
    },
    ...override,
  };
  const result = await captureJourney({fixture_id: PAGE.fixture_id,
    actions: h.writer.identity.step_map.actions.map(({action, press}) => ({step: action, press})),
    speech: {read: async () => ({source: 'unattested', session: 'speech-s3', connected: true, complete: true, phrases: [...phrases]})},
    page: {read: async () => { later.shift()?.(); return h.journal.snapshot(); }},
    execute: async ({step, press}) => { h.intent(step, ...PRESS_VKS[press]); steps[step](); },
    observationMs: SPEC.observationMs, pollMs: SPEC.pollMs, timeoutMs: SPEC.timeoutMs,
    clock: {now: () => T, wait: async ms => { T += ms; }}});
  await h.source.flush();
  if (capture) h.writer.put('capture.json', JSON.stringify(result));
  return result;
}
async function sealed(extra, run = {}) {
  const dir = join(temp(), 'validation'), h = harness(dir, run);
  await journey(h, run);
  const result = await h.writer.seal(extra);
  return {dir, h, result};
}

const readJsonl = (dir, name) => readFileSync(join(dir, name), 'utf8').trimEnd().split('\n').filter(Boolean).map(l => JSON.parse(l));
const writeJsonl = (dir, name, rows) => writeFileSync(join(dir, name), rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
// A forger who also rewrites the manifest digests: integrity passes, so only reconstruction can refuse it.
function reseal(dir, mutateManifest) {
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  m.files = m.files.filter(f => { try { readFileSync(join(dir, f.path)); return true; } catch { return false; } }).map(f => {
    const data = readFileSync(join(dir, f.path));
    return {path: f.path, bytes: data.length, sha256: sha256(data)};
  });
  mutateManifest?.(m);
  const bytes = Buffer.from(JSON.stringify(m, null, 2) + '\n');
  writeFileSync(join(dir, 'manifest.json'), bytes);
  writeFileSync(join(dir, 'manifest.sha256'), `${sha256(bytes)}  manifest.json\n`);
}
const canonical = value => JSON.stringify(value, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);
// Rewrites page-reads deltas and recomputes every prefix hash, as a careful forger would.
function forgeReads(dir, mutate) {
  const rows = readJsonl(dir, 'page-reads.jsonl');
  mutate(rows);
  let events = [], state = null;
  for (const r of rows) if (r.kind === 'read' && Array.isArray(r.new_events)) {
    events = [...events.slice(0, r.events_from), ...r.new_events]; r.prefix_sha256 = sha256(canonical(events));
    if (r.state_same === false) state = r.state; else r.state_sha256 = sha256(canonical(state));
  }
  writeJsonl(dir, 'page-reads.jsonl', rows);
  reseal(dir);
}
// Rewrites capture.json and reseals, so only the capture contract checks can refuse it.
function forgeCapture(dir, mutate) {
  const cap = JSON.parse(readFileSync(join(dir, 'capture.json'), 'utf8'));
  mutate(cap);
  writeFileSync(join(dir, 'capture.json'), JSON.stringify(cap)); reseal(dir);
}
async function refused(dir, pattern, inputs = INPUTS) {
  const v = await verifyR2PageEvidence(dir, inputs);
  assert.equal(v.ok, false, 'verification must fail');
  assert.equal(v.class, 'incomplete');
  assert.match(v.errors.join('\n'), pattern);
  return v;
}

// ---- positive ----
test('S3-P1 write, seal and independently verify synthetic evidence from disk', async () => {
  const {dir, result} = await sealed();
  assert.equal(result.class, 'synthetic');
  const v = await verifyR2PageEvidence(dir, INPUTS);
  assert.deepEqual(v.errors, []);
  assert.equal(v.ok, true); assert.equal(v.class, 'synthetic'); assert.equal(v.manifest_class, 'synthetic');
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  assert.equal(m.schema, 'tabwise-r2-page-evidence/1');
  assert.deepEqual(m.authenticity, {status: 'absent', reason: 'no authentic runtime claim: synthetic'});
  assert.equal(readFileSync(join(dir, 'manifest.sha256'), 'utf8'), `${sha256(readFileSync(join(dir, 'manifest.json')))}  manifest.json\n`);
  for (const f of m.files) assert.equal(sha256(readFileSync(join(dir, f.path))), f.sha256);
  assert.deepEqual(readdirSync(dir).sort(), [...LANES.map(l => `${l}.jsonl`), 'capture.json', 'manifest.json', 'manifest.sha256'].sort());
});

test('S3-P2 multi-read reconstruction, unchanged-read coalescing and page_reported deltas recompute', async () => {
  const {dir, result} = await sealed();
  const rows = readJsonl(dir, 'page-reads.jsonl');
  const unchanged = rows.filter(r => r.kind === 'unchanged');
  assert.ok(unchanged.length >= 1, 'quiet reads were coalesced');
  assert.ok(rows.some(r => r.kind === 'read' && r.page_reported_from === 1 && r.page_reported_new.length === 1), 'page_reported extended by delta');
  const rec = result.verification.reconstruction;
  assert.equal(rec.reads, readJsonl(dir, 'page.jsonl').length);
  assert.equal(rec.coalesced_reads, unchanged.reduce((a, r) => a + r.reads, 0));
  assert.equal(rec.events, 9); assert.equal(rec.page_authored, 1); assert.equal(rec.runner_observed, 8);
  assert.equal(rec.state_changes, 2); assert.equal(rec.refused_read, null);
  assert.equal(rec.adapter_accepted, rec.reads);
  assert.deepEqual(rec.capture, {records: 3, samples: rec.reads - 1, completed: true});
});

test('S3-P3 fixture identity, served bytes and step map reproduce from the original fixture', () => {
  const {served, record} = applyTitleNonce(FIXTURE, NONCE);
  assert.equal(record.fixture_sha256, pair.healthy.sha256);
  assert.equal(record.original_title, 'Newsletter sign-up');
  assert.equal(record.served_sha256, sha256(Buffer.from(served, 'utf8')));
  assert.match(served, /<title>Newsletter sign-up 0a1b2c3d<\/title>/);
  assert.equal(served.replace(' 0a1b2c3d</title>', '</title>'), FIXTURE.toString('utf8').replace(/\r\n/g, '\n'));
  assert.deepEqual(buildR2StepMap(APPROVED.task), {version: 'tabwise-r2-step-map/1', actions: [
    {action: 'a1', task: 'to-email', press: 'Tab'}, {action: 'a2', task: 'to-submit', press: 'Tab'}, {action: 'a3', task: 'submit', press: 'Enter'}]});
  assert.equal(readFileSync(new URL(`../fixtures/r2/${pair.healthy.file}`, import.meta.url)).equals(FIXTURE), true, 'fixture unchanged');
});

test('S3-P4 manifests are deterministic for the same evidence', async () => {
  const a = await sealed(), b = await sealed();
  assert.equal(readFileSync(join(a.dir, 'manifest.json'), 'utf8'), readFileSync(join(b.dir, 'manifest.json'), 'utf8'));
  assert.equal(a.result.manifest_sha256, b.result.manifest_sha256);
});

test('S3-P5 a page-source refusal seals as incomplete with its rejected payload bound by digest', async () => {
  const dir = join(temp(), 'validation');
  let wrong = false;
  const h = harness(dir, {edit: v => { if (wrong) v.title = 'Other'; }});
  await h.sample();
  wrong = true;
  await assert.rejects(h.sample(), /title differs/);
  const result = await h.writer.seal();
  assert.equal(result.class, 'incomplete');
  const v = await verifyR2PageEvidence(dir, INPUTS);
  assert.equal(v.ok, true); assert.equal(v.class, 'incomplete');
  assert.match(v.reasons.join('\n'), /page source refused read 2: title differs/);
  const last = readJsonl(dir, 'page-reads.jsonl').at(-1);
  assert.equal(last.rejected_sha256, sha256(readFileSync(join(dir, 'page-rejected.json'))));
  assert.ok(readJsonl(dir, 'page.jsonl').some(e => e.complete === false), 'adapter refusal recorded');
});

test('S3-P6 a provenance claim cannot promote evidence: attestation fails closed to incomplete', async () => {
  const {dir, result} = await sealed({provenance: {runtime: 'chromium', attestation: 'claimed'}});
  assert.equal(result.class, 'incomplete');
  assert.deepEqual(result.manifest.authenticity, {status: 'unverifiable', reason: ATTESTATION_UNAVAILABLE});
  const v = await verifyR2PageEvidence(dir, INPUTS);
  assert.equal(v.ok, true); assert.equal(v.class, 'incomplete');
});

test('S3-P7 run manifest orders pages by plan and takes the minimum class', async () => {
  const run = temp(), plan = {pages: [{id: 'p1'}, {id: 'p2'}]};
  for (const id of ['p1', 'p2']) { const h = harness(join(run, id)); await journey(h); await h.writer.seal(); }
  const inputs = {p1: INPUTS, p2: INPUTS};
  const {manifest: m} = await sealR2Run(run, {enabled: true, plan, pages: [{id: 'p1', exit_code: 0}, {id: 'p2', exit_code: 0}], inputs});
  assert.equal(m.schema, 'tabwise-r2-run-evidence/1'); assert.deepEqual(m.order, ['p1', 'p2']); assert.equal(m.run_class, 'synthetic');
  assert.deepEqual(await verifyR2Run(run, {plan, inputs}).then(v => [v.ok, v.run_class]), [true, 'synthetic']);
  writeFileSync(join(run, 'p2', 'events.jsonl'), readFileSync(join(run, 'p2', 'events.jsonl'), 'utf8') + '{}\n');
  const tampered = await verifyR2Run(run, {plan, inputs});
  assert.equal(tampered.ok, false); assert.equal(tampered.run_class, 'incomplete');
});

test('S3-P8 a run that stops after a failing page is incomplete', async () => {
  const run = temp(), plan = {pages: [{id: 'p1'}, {id: 'p2'}]};
  const h = harness(join(run, 'p1')); await journey(h); await h.writer.seal();
  const {manifest: m} = await sealR2Run(run, {enabled: true, plan, pages: [{id: 'p1', exit_code: 1}], inputs: {p1: INPUTS}});
  assert.equal(m.run_class, 'incomplete'); assert.equal(m.pages[0].class, 'incomplete'); assert.equal(m.stopped_after, 'p1');
  await assert.rejects(sealR2Run(temp(), {plan}), /disabled/);
});

// ---- negative: writer ----
test('S3-N1 writer is default-disabled and preflight refuses before any filesystem effect', () => {
  const root = temp();
  assert.throws(() => createR2EvidenceWriter({...options(join(root, 'x')), enabled: undefined}), /disabled/);
  assert.throws(() => createR2EvidenceWriter(options(join(root, 'x'), {spec: {...SPEC, actions: 4, pollMs: 10}})), /exceeds the 12000000-byte page cap/);
  assert.throws(() => createR2EvidenceWriter(options(join(root, 'x'), {approved: {...APPROVED, fixture_sha256: '0'.repeat(64)}})), /approved manifest/);
  assert.throws(() => createR2EvidenceWriter(options(join(root, 'x'), {nonce: 'ZZZZZZZZ'})), /nonce/);
  assert.throws(() => createR2EvidenceWriter(options(join(root, 'x'), {spec: {...SPEC, ackMs: 999}})), /frozen 1000/);
  assert.throws(() => createR2EvidenceWriter(options(join(root, 'x'), {spec: {...SPEC, extra: 1}})), /exactly/);
  assert.throws(() => createR2EvidenceWriter(options(join(root, 'x'), {page: {...PAGE, port: 80}})), /port/);
  assert.deepEqual(readdirSync(root), [], 'nothing was created');
  const dir = join(root, 'y'); createR2EvidenceWriter(options(dir));
  assert.throws(() => createR2EvidenceWriter(options(dir)), /EEXIST/, 'exclusive directory creation');
  const empty = join(root, 'z'); mkdirSync(empty);
  assert.throws(() => createR2EvidenceWriter(options(empty)), /EEXIST/, 'a pre-existing empty directory is refused');
});

test('S3-N2 invalid step maps and transforms are refused', () => {
  assert.throws(() => buildR2StepMap([{step: 'a', press: 'Tab'}, {step: 'a', press: 'Tab'}]), /duplicate/);
  assert.throws(() => buildR2StepMap([{step: 'a', press: 'Escape'}]), /invalid task/);
  assert.throws(() => buildR2StepMap([{step: 'A b', press: 'Tab'}]), /invalid task/);
  assert.throws(() => buildR2StepMap([]), /1\.\.1000/);
  assert.throws(() => applyTitleNonce(Buffer.from('<title>a</title><title>b</title>'), NONCE), /exactly one/);
  assert.throws(() => applyTitleNonce(Buffer.from('<p>no title</p>'), NONCE), /exactly one/);
  assert.throws(() => applyTitleNonce(Buffer.from('<title>  </title>'), NONCE), /empty title/);
  assert.throws(() => createR2EvidenceWriter(options(join(temp(), 'x'), {spec: {...SPEC, actions: 2}})), /differs from the step map/);
});

test('S3-N3 lane, file and one-time rules; caps refuse before allocation', () => {
  const w = createR2EvidenceWriter(options(join(temp(), 'x')));
  assert.throws(() => w.append('nope', {}), /unknown lane/);
  const w2 = createR2EvidenceWriter(options(join(temp(), 'x')));
  assert.throws(() => w2.put('../escape.json', '{}'), /unknown evidence file/);
  const w3 = createR2EvidenceWriter(options(join(temp(), 'x')));
  w3.put('capture.json', '{}');
  assert.throws(() => w3.put('capture.json', '{}'), /already written/);
  const w4 = createR2EvidenceWriter(options(join(temp(), 'x')));
  assert.throws(() => w4.put('page-rejected.json', 'x'.repeat(REJECTED_CAP + 1)), /cap 340000/);
  const w4b = createR2EvidenceWriter(options(join(temp(), 'x')));
  assert.throws(() => w4b.put('page-rejected.json', JSON.stringify('é'.repeat(REJECTED_CAP / 2))), /cap 340000/, 'byte length, not string length');
  const w5 = createR2EvidenceWriter(options(join(temp(), 'x')));
  assert.throws(() => w5.append('page-reads', {kind: 'read', blob: 'x'.repeat(2_000_000)}), /exceeds/);
  const w6 = createR2EvidenceWriter(options(join(temp(), 'x')));
  for (let i = 0; i < 16; i++) w6.append('page-reads', {kind: 'read', state: {i}});
  assert.throws(() => w6.append('page-reads', {kind: 'read', state: {i: 16}}), /state change cap 16/);
  const w7 = createR2EvidenceWriter(options(join(temp(), 'x')));
  let n = 0;
  assert.throws(() => { for (;; n++) w7.append('events', {pad: 'x'.repeat(10000)}); }, /cap 262144|exceeds/);
  assert.ok(n > 20 && n < 27);
});

test('S3-N4 malformed and unbounded records are refused without being serialized', () => {
  const cyclic = {}; cyclic.self = cyclic;
  for (const [value, pattern] of [[{a: undefined}, /undefined/], [{a: () => 1}, /non-JSON function/], [{a: NaN}, /non-finite/],
    [{a: 1n}, /non-JSON bigint/], [cyclic, /cyclic/], [{a: new Date(0)}, /non-plain/], [{a: [undefined]}, /undefined array/],
    [{[Symbol('s')]: 1}, /symbol/], [{a: 'x'.repeat(100)}, /exceeds 50/]]) assert.throws(() => encodeBounded(value, 50), pattern);
  let deep = {}; for (let i = 0; i < 70; i++) deep = {d: deep};
  assert.throws(() => encodeBounded(deep, 1e6), /nesting/);
  const value = {b: [1, 'two', {c: null, d: true}], a: -0.5};
  assert.equal(encodeBounded(value, 1e6), JSON.stringify(value));
  const w = createR2EvidenceWriter(options(join(temp(), 'x')));
  assert.throws(() => w.append('events', 'not an object'), /must be an object/);
  assert.throws(() => w.append('events', {}), /r2 evidence: .*must be an object/, 'the first failure latches');
});

test('S3-N5 a writer exception latches the writer and nothing can be sealed', async () => {
  const dir = join(temp(), 'x'), w = createR2EvidenceWriter(options(dir));
  unlinkSync(join(dir, 'focus.jsonl')); mkdirSync(join(dir, 'focus.jsonl'));
  assert.throws(() => w.append('focus', {a: 1}), /EISDIR|EPERM|illegal operation/);
  assert.throws(() => w.append('events', {a: 1}), /EISDIR|EPERM|illegal operation/);
  assert.throws(() => w.put('capture.json', '{}'), /EISDIR|EPERM|illegal operation/);
  await assert.rejects(w.seal(), /EISDIR|EPERM|illegal operation/);
  assert.ok(w.failure());
  await refused(dir, /unsealed|unexpected directory/);
});

test('S3-N6 an incomplete seal leaves no verifiable directory, and sealing is single-use', async () => {
  const dir = join(temp(), 'validation'), h = harness(dir);
  await journey(h);
  mkdirSync(join(dir, 'manifest.sha256'));
  await assert.rejects(h.writer.seal(), /EISDIR|EEXIST|EPERM|illegal operation/);
  await assert.rejects(h.writer.seal(), /EISDIR|EEXIST|EPERM|illegal operation/);
  await refused(dir, /unsealed|unexpected directory/);
  const ok = await sealed();
  await assert.rejects(ok.h.writer.seal(), /already sealed/);
  assert.throws(() => ok.h.writer.append('events', {}), /sealed/);
});

test('S3-N7 seal refuses a caller-supplied class and tampering before seal', async () => {
  const dir = join(temp(), 'validation'), h = harness(dir);
  await journey(h);
  await assert.rejects(h.writer.seal({class: 'genuine-unqualified'}), /recomputed, never supplied/);
  const dir2 = join(temp(), 'validation'), h2 = harness(dir2);
  await journey(h2);
  writeFileSync(join(dir2, 'page.jsonl'), readFileSync(join(dir2, 'page.jsonl'), 'utf8').replace('"complete":true', '"complete":false'));
  await assert.rejects(h2.writer.seal(), /changed on disk before seal/);
  const dir3 = join(temp(), 'validation'), h3 = harness(dir3);
  await journey(h3);
  writeFileSync(join(dir3, 'stray.txt'), 'x');
  await assert.rejects(h3.writer.seal(), /does not verify: .*unexpected evidence file stray\.txt/);
});

test('S3-N8 refusal markers and a real incomplete capture seal as incomplete with their diagnostics', async () => {
  const dir = join(temp(), 'validation'), h = harness(dir);
  const cap = await journey(h, {steps: {a2: () => {}}});
  assert.deepEqual([cap.completed, cap.outcome, cap.records.length, cap.records[1].capture_status], [false, 'INSUFFICIENT_EVIDENCE', 2, 'incomplete']);
  h.writer.append('events', {phase: 'refusal', reason: 'helper refused'});
  const r = await h.writer.seal({incomplete: ['runner exit 3']});
  assert.equal(r.class, 'incomplete');
  const reasons = r.verification.reasons.join('\n');
  assert.match(reasons, /session refusal: helper refused/);
  assert.match(reasons, /capture not completed: a2: ack: not observed within 1000 ms/);
  assert.match(reasons, /capture covers 2 of 3 actions/);
  assert.match(reasons, /accepted history has keys for 1 of 3 actions/);
  assert.match(reasons, /intents cover 2 of 3 actions/);
  const v = await verifyR2PageEvidence(dir, INPUTS);
  assert.deepEqual([v.ok, v.class, v.errors], [true, 'incomplete', []]);
});

// ---- negative: verifier (after seal) ----
test('S3-N9 a modified event after seal fails integrity', async () => {
  const {dir} = await sealed();
  writeFileSync(join(dir, 'page-reads.jsonl'), readFileSync(join(dir, 'page-reads.jsonl'), 'utf8').replace('"key":"Enter"', '"key":"Space"'));
  await refused(dir, /file integrity: page-reads\.jsonl/);
});

test('S3-N10 a missing or extra file is refused', async () => {
  const a = await sealed();
  unlinkSync(join(a.dir, 'speech.jsonl'));
  await refused(a.dir, /missing evidence file speech\.jsonl/);
  const b = await sealed();
  writeFileSync(join(b.dir, 'extra.json'), '{}');
  await refused(b.dir, /unexpected evidence file extra\.json/);
  const c = await sealed();
  mkdirSync(join(c.dir, 'nested'));
  await refused(c.dir, /unexpected directory/);
  const d = await sealed();
  reseal(d.dir, m => m.files.push({...m.files[0]}));
  await refused(d.dir, /lists a file twice/);
  const e = await sealed();
  reseal(e.dir, m => m.files.push({path: '../x', bytes: 0, sha256: sha256('')}));
  await refused(e.dir, /outside the allowlist/);
});

test('S3-N11 duplicate seq, broken prefix hash and rewritten history are refused', async () => {
  const a = await sealed();
  forgeReads(a.dir, rows => { const r = rows.find(x => x.kind === 'read' && x.new_events?.length >= 2); r.new_events[1].seq = r.new_events[0].seq; });
  await refused(a.dir, /seq .* duplicated, missing or out of order/);
  const b = await sealed();
  const rows = readJsonl(b.dir, 'page-reads.jsonl'); rows.find(x => x.new_events?.length).prefix_sha256 = '0'.repeat(64);
  writeJsonl(b.dir, 'page-reads.jsonl', rows); reseal(b.dir);
  await refused(b.dir, /prefix hash does not recompute/);
  const c = await sealed();
  forgeReads(c.dir, rows => { const r = rows.filter(x => x.new_events?.length).at(-1); r.events_from -= 1; r.new_events.unshift({...r.new_events[0], seq: r.events_from + 1}); r.events_to = r.events_from + r.new_events.length; });
  await refused(c.dir, /events_from .* does not continue/);
  const d = await sealed();
  forgeReads(d.dir, rows => { rows.find(x => x.new_events?.length).new_events[0].key = 'Enter'; });
  await refused(d.dir, /differs from the reconstructed history/);
});

test('S3-N12 a state change without a mutation and a broken page_reported delta are refused', async () => {
  const a = await sealed();
  forgeReads(a.dir, rows => {
    const r = rows.filter(x => x.kind === 'read' && x.new_events?.length && x.state_same === true)[0];
    r.state_same = false; r.state = {dialogs: ['forged'], invalid: [], live: []}; r.state_sha256 = sha256(canonical(r.state));
  });
  await refused(a.dir, /read \d+: state changed without a runner-observed mutation event/);
  const b = await sealed();
  forgeReads(b.dir, rows => { rows.find(x => x.page_reported_from === 1).page_reported_from = 2; });
  await refused(b.dir, /neither a continuation nor a reset/);
  const c = await sealed();
  const cr = readJsonl(c.dir, 'page-reads.jsonl'); cr.find(x => x.kind === 'read' && x.state_same === true).state_sha256 = '1'.repeat(64);
  writeJsonl(c.dir, 'page-reads.jsonl', cr); reseal(c.dir);
  await refused(c.dir, /state hash does not recompute/);
  const d = await sealed();
  forgeReads(d.dir, rows => { const u = rows.find(x => x.kind === 'unchanged'); u.read_first += 1; u.read_last += 1; });
  await refused(d.dir, /unchanged run read numbers/);
});

test('S3-N13 a missing or altered rejected payload is refused', async () => {
  const make = async () => {
    const dir = join(temp(), 'validation');
    let wrong = false;
    const h = harness(dir, {edit: v => { if (wrong) v.title = 'Other'; }});
    await h.sample(); wrong = true;
    await assert.rejects(h.sample());
    await h.writer.seal();
    return dir;
  };
  const a = await make();
  unlinkSync(join(a, 'page-rejected.json')); reseal(a);
  await refused(a, /rejected-read payload missing/);
  const b = await make();
  writeFileSync(join(b, 'page-rejected.json'), '{"title":"x"}'); reseal(b);
  await refused(b, /rejected-read payload digest/);
});

test('S3-N14 forged fixture, transform, step map or caps are refused', async () => {
  const {dir} = await sealed();
  await refused(dir, /approved manifest/, {fixture: Buffer.concat([FIXTURE, Buffer.from(' ')]), approved: APPROVED});
  await refused(dir, /step map differs|differs from the step map/, {fixture: FIXTURE, approved: {...APPROVED, task: [...APPROVED.task.slice(0, 2), {step: 'submit', press: 'Space'}]}});
  const b = await sealed();
  reseal(b.dir, m => { m.transform.served_sha256 = '0'.repeat(64); });
  await refused(b.dir, /served-title transformation does not reproduce/);
  const c = await sealed();
  reseal(c.dir, m => { m.transform.nonce = 'ffffffff'; });
  await refused(c.dir, /served-title transformation|evidence-begin/);
  const d = await sealed();
  reseal(d.dir, m => { m.caps.files['page.jsonl'] += 1; });
  await refused(d.dir, /caps do not recompute/);
});

test('S3-N15 forged genuine or qualified class is refused', async () => {
  for (const cls of ['genuine-unqualified', 'qualified']) {
    const {dir} = await sealed();
    reseal(dir, m => { m.class = cls; });
    await refused(dir, cls === 'qualified' ? /never assigned/ : /differs from the recomputed class synthetic/);
  }
  const {dir} = await sealed({provenance: {runtime: 'chromium'}});
  reseal(dir, m => { m.class = 'genuine-unqualified'; m.authenticity = {status: 'verified', reason: 'forged'}; });
  await refused(dir, /authenticity record does not recompute/);
});

test('S3-N16 oversized files are refused by size before being read', async () => {
  const a = await sealed();
  writeFileSync(join(a.dir, 'page-rejected.json'), 'x'.repeat(REJECTED_CAP + 1)); reseal(a.dir, m => { m.files.push({path: 'page-rejected.json', bytes: 0, sha256: ''}); m.files.sort((x, y) => x.path < y.path ? -1 : 1); });
  await refused(a.dir, /page-rejected\.json is 340001 bytes, over its 340000-byte cap/);
  const b = await sealed();
  const cap = planR2EvidenceCaps(SPEC).files['page.jsonl'];
  writeFileSync(join(b.dir, 'page.jsonl'), 'x'.repeat(cap + 1)); reseal(b.dir);
  await refused(b.dir, /page\.jsonl is \d+ bytes, over its \d+-byte cap/);
  const c = await sealed();
  writeFileSync(join(c.dir, 'manifest.json'), 'x'.repeat(1_000_001));
  await refused(c.dir, /manifest\.json is 1000001 bytes/);
});

test('S3-N17 cap plan follows the §8.2 formula and rejects over-budget plans', () => {
  const caps = planR2EvidenceCaps(SPEC);
  assert.equal(caps.max_reads, 3 * (100 + 2 + 90 + 4) + 8);
  assert.equal(caps.files['page-reads.jsonl'], 262144 + caps.max_reads * 512 + 16 * 4096);
  assert.equal(caps.files['page.jsonl'], caps.max_reads * 256);
  assert.equal(caps.files['capture.json'], caps.max_reads * 4608);
  assert.equal(caps.files['page-rejected.json'], 340000);
  assert.ok(caps.worst_case <= TOTAL_CAP);
  assert.throws(() => planR2EvidenceCaps({...SPEC, actions: 3, pollMs: 1}), /exceeds/);
  assert.throws(() => planR2EvidenceCaps({...SPEC, actions: 1001}), /1\.\.1000/);
  assert.throws(() => planR2EvidenceCaps({...SPEC, pollMs: 0}), /pollMs/);
  assert.throws(() => planR2EvidenceCaps(null), /exactly/);
});

test('S3-N18 an unsealed or truncated directory is incomplete and never repaired', async () => {
  const dir = join(temp(), 'validation'), h = harness(dir);
  await journey(h);
  const before = readdirSync(dir).sort();
  await refused(dir, /unsealed/);
  assert.deepEqual(readdirSync(dir).sort(), before, 'the verifier wrote nothing');
  const b = await sealed();
  writeFileSync(join(b.dir, 'page.jsonl'), readFileSync(join(b.dir, 'page.jsonl'), 'utf8').slice(0, -1)); reseal(b.dir);
  await refused(b.dir, /does not end with a newline/);
  const c = await sealed();
  const rows = readJsonl(c.dir, 'page.jsonl'); rows.pop(); writeJsonl(c.dir, 'page.jsonl', rows); reseal(c.dir);
  await refused(c.dir, /adapter replay consumed|page lane does not equal/);
  const d = await sealed();
  const lane = readJsonl(d.dir, 'page.jsonl'); lane[0].seq_max += 1; writeJsonl(d.dir, 'page.jsonl', lane); reseal(d.dir);
  await refused(d.dir, /page lane does not equal the adapter replay/);
});

test('S3-N19 capture records must follow the step map and match accepted reads', async () => {
  const a = await sealed();
  const cap = JSON.parse(readFileSync(join(a.dir, 'capture.json'), 'utf8'));
  cap.records[1].press = 'Enter';
  writeFileSync(join(a.dir, 'capture.json'), JSON.stringify(cap)); reseal(a.dir);
  await refused(a.dir, /capture record 2 differs from step map/);
  const b = await sealed();
  const cap2 = JSON.parse(readFileSync(join(b.dir, 'capture.json'), 'utf8'));
  cap2.records[0].page.samples[0].active = 'submit';
  writeFileSync(join(b.dir, 'capture.json'), JSON.stringify(cap2)); reseal(b.dir);
  await refused(b.dir, /no matching accepted page read/);
  const c = await sealed();
  const intents = readJsonl(c.dir, 'intents.jsonl'); intents.reverse(); writeJsonl(c.dir, 'intents.jsonl', intents); reseal(c.dir);
  await refused(c.dir, /intent 1 does not follow the step map/);
});

// ---- review round: completeness (H1), capture contract (H2), mutation-backed state (H3), keys (M1), caps (M2) ----
test('S3-N20 evidence without page observations or a capture never seals as synthetic', async () => {
  const empty = join(temp(), 'validation'), w = createR2EvidenceWriter(options(empty));
  const r = await w.seal();
  assert.equal(r.class, 'incomplete');
  assert.match(r.verification.reasons.join('\n'), /no accepted page observations/);
  assert.match(r.verification.reasons.join('\n'), /capture\.json missing: no action observations/);
  assert.match(r.verification.reasons.join('\n'), /intents cover 0 of 3 actions/);
  const v = await verifyR2PageEvidence(empty, INPUTS);
  assert.deepEqual([v.ok, v.class], [true, 'incomplete']);
  const {result} = await sealed(undefined, {capture: false});
  assert.equal(result.class, 'incomplete');
  assert.match(result.verification.reasons.join('\n'), /capture\.json missing/);
});

test('S3-N21 a completed capture must satisfy the captureJourney contract', async () => {
  const cases = [
    [c => { c.records[0].ack_seq = null; }, /capture record 1: ack_seq null is not the acknowledging keydown/],
    [c => { c.records[1].ack_seq = c.records[0].ack_seq; }, /capture record 2: ack_seq \d+ is not one of its keydowns/],
    [c => { c.records[0].capture_status = 'captured'; }, /capture record 1: invalid capture_status "captured"/],
    [c => { const p = c.records[0].page; p.samples = p.samples.slice(0, 1); p.before = p.after = p.samples[0]; p.events = []; },
      /capture record 1: missing page samples/],
    [c => { c.records[2].page.samples.pop(); c.records[2].page.after = c.records[2].page.samples.at(-1); }, /completed capture holds 95 page samples for 97 accepted reads/],
    [c => { c.records[0].page.after = c.records[0].page.before; }, /page before\/after are not its first\/last samples/],
    [c => { c.records[1].execution.settled = false; }, /capture record 2: execution not started and settled/],
    [c => { c.records[2].text = 'forged'; }, /capture record 3: text is not its raw_seq speech/],
    [c => { c.records[2].capture_status = 'observed-silence'; }, /capture record 3: observed-silence does not match/],
    [c => { c.records[1].invalidated = {by: 'gate-stop'}; }, /capture record 2: observed-silence record with reasons, invalidation/],
    [c => { c.reasons.push('a1: late'); }, /capture claims completed but is not a complete captureJourney result/],
    [c => { c.outcome = 'INSUFFICIENT_EVIDENCE'; }, /capture claims completed/],
    [c => { c.schema = 'r2-capture/0'; }, /not an r2-capture\/1 result/],
    [c => { c.records.push({...c.records[2], seq: 4}); }, /more records than the step map/],
    [c => { c.records[0].capture_status = 'failed'; }, /capture record 1: failed record followed by a later action/],
    [c => { c.records[0].page.events.push(c.records[1].page.events.shift()); }, /capture record 1: page event seq 3 is not associated/],
  ];
  for (const [mutate, pattern] of cases) {
    const {dir} = await sealed();
    forgeCapture(dir, mutate);
    await refused(dir, pattern).catch(e => { throw Error(`${pattern}: ${e.message}`); });
  }
});

test('S3-N22 a forged completed status over a real incomplete capture is refused', async () => {
  // Wrong key at a2: the real capture stops incomplete; forging it complete must not pass.
  const make = async () => {
    const dir = join(temp(), 'validation'), h = harness(dir);
    const cap = await journey(h, {steps: {a2: () => { h.key('Enter'); }}});
    assert.match(cap.records[1].reasons[0], /ack:/);
    await h.writer.seal();
    return dir;
  };
  const a = await make();
  forgeCapture(a, c => { c.completed = true; c.outcome = 'COMPLETE'; c.reasons = []; });
  await refused(a, /capture claims completed but is not a complete captureJourney result/);
  const b = await make();
  forgeCapture(b, c => {
    const r = c.records[1];
    r.capture_status = 'observed-silence'; r.reasons = []; r.execution.settled = true; r.execution.cancellation_requested = false;
    r.silence = {transport_live: true}; r.ack_seq = r.page.events.find(e => e.type === 'keydown').seq;
  });
  await refused(b, /capture record 2: page keys do not acknowledge Tab/);
  const c = await make();
  forgeCapture(c, x => { x.outcome = 'COMPLETE'; });
  await refused(c, /incomplete capture with a COMPLETE outcome/);
  const d = await make();
  forgeCapture(d, x => { x.records[1].raw_seq = [99]; });
  await refused(d, /capture record 2: raw_seq names speech not in capture\.raw/);
  const v = await verifyR2PageEvidence(await make(), INPUTS);
  assert.deepEqual([v.ok, v.class], [true, 'incomplete']);
  assert.match(v.reasons.join('\n'), /accepted keydown "Enter" \(shift false\) at seq \d+ is not a2 Tab/);
});

test('S3-N23 a state change justified only by a page-authored app event is refused', async () => {
  const dir = join(temp(), 'validation'), h = harness(dir);
  await journey(h, {steps: {a3: () => {
    h.key('Enter'); h.add('app', {name: 'validation-error', detail: {field: 'email'}, source: 'page-authored'});
    h.raw.state = {dialogs: [], invalid: ['email'], live: ['Enter your email address']};
  }}});
  await assert.rejects(h.writer.seal(), /state changed without a runner-observed mutation event/);
});

test('S3-N24 intents must carry their press VKs in step-map order', async () => {
  const a = await sealed();
  const rows = readJsonl(a.dir, 'intents.jsonl'); rows[0].keys = [VK.Enter]; writeJsonl(a.dir, 'intents.jsonl', rows); reseal(a.dir);
  await refused(a.dir, /intent 1 keys \[13\] are not the Tab VKs/);
  const b = await sealed();
  const more = readJsonl(b.dir, 'intents.jsonl'); more.push({action: 'a4', keys: [VK.Tab]}); writeJsonl(b.dir, 'intents.jsonl', more); reseal(b.dir);
  await refused(b.dir, /intent 4 does not follow the step map/);
  const c = await sealed();
  const extra = readJsonl(c.dir, 'intents.jsonl'); extra[1].note = 'x'; writeJsonl(c.dir, 'intents.jsonl', extra); reseal(c.dir);
  await refused(c.dir, /intent 2 does not follow the step map/);
});

// A Shift+Tab journey over the same approved fixture bytes exercises the action-specific prefix accounting.
const SHIFT = {fixture_sha256: APPROVED.fixture_sha256, task: [{step: 'to-email', press: 'Tab'}, {step: 'back', press: 'Shift+Tab'}, {step: 'submit', press: 'Enter'}]};
const SHIFT_INPUTS = {fixture: FIXTURE, approved: SHIFT};
async function shiftJourney(a2) {
  const dir = join(temp(), 'validation'), run = {approved: SHIFT, steps: {}}, h = harness(dir, run);
  run.steps.a2 = () => a2(h);
  const cap = await journey(h, run);
  return {dir, h, cap};
}
const shiftTab = h => { h.key('Shift', {shift: true}); h.key('Tab', {shift: true}); h.add('focusout', {target: 'email', active: 'email'}); h.add('focusin', {target: 'submit', active: 'submit'}); };
test('S3-P9 a Shift+Tab action with an observed Shift prefix verifies; a forged prefix is refused', async () => {
  const {dir, h, cap} = await shiftJourney(shiftTab);
  assert.equal(cap.completed, true);
  const r = await h.writer.seal();
  assert.deepEqual([r.class, r.verification.errors, r.verification.reasons], ['synthetic', [], []]);
  const prefixes = readJsonl(dir, 'page-reads.jsonl').flatMap(x => x.shift_prefix ?? []);
  assert.deepEqual(prefixes.map(p => [p.action, p.prefix]), [['a2', 'observed']]);
  const copy = join(temp(), 'validation'); mkdirSync(copy);
  for (const f of readdirSync(dir)) writeFileSync(join(copy, f), readFileSync(join(dir, f)));
  forgeCapture(copy, c => { c.records[1].ack_seq = c.records[1].page.events.find(e => e.key === 'Shift').seq; });
  await refused(copy, /capture record 2: ack_seq \d+ is not the acknowledging keydown/, SHIFT_INPUTS);
  forgeReads(dir, rows => { rows.find(x => x.shift_prefix?.length).shift_prefix[0].prefix = 'not-observed'; });
  await refused(dir, /shift_prefix records do not recompute/, SHIFT_INPUTS);
});

test('S3-N25 a Shift+Tab whose Shift never resolves seals as incomplete', async () => {
  const {h, cap} = await shiftJourney(x => { x.key('Shift', {shift: true}); });
  assert.equal(cap.completed, false);
  const r = await h.writer.seal();
  assert.equal(r.class, 'incomplete');
  assert.match(r.verification.reasons.join('\n'), /unresolved Shift at seq \d+ at the end of the accepted history/);
});

test('S3-N26 an accepted Shift inside a plain Tab action is refused', async () => {
  const {dir} = await sealed();
  forgeReads(dir, rows => {
    let shift = 0;
    for (const r of rows.filter(x => x.kind === 'read' && Array.isArray(x.new_events))) {
      r.events_from += shift;
      const k = shift ? -1 : r.new_events.findIndex(e => e.key === 'Tab');
      if (k >= 0) { r.new_events.splice(k, 0, {...r.new_events[k], key: 'Shift', code: 'Shift', shift: true}); shift = 1; }
      r.new_events.forEach((e, i) => { e.seq = r.events_from + i + 1; });
      r.events_to = r.events_from + r.new_events.length;
      if (r.header) r.header.event_count = r.events_to;
    }
  });
  await refused(dir, /accepted Shift keydown at seq 1 outside a Shift\+Tab action/);
});

test('S3-P10 realistic 3- and 4-action plans fit at a 20 ms poll; 10 ms plans fail closed', () => {
  for (const actions of [3, 4]) {
    const caps = planR2EvidenceCaps({...SPEC, actions, pollMs: 20});
    assert.equal(caps.max_reads, actions * (100 + 2 + 225 + 4) + 8);
    assert.ok(caps.worst_case <= TOTAL_CAP, `${actions} actions at 20 ms: ${caps.worst_case}`);
  }
  for (const actions of [3, 4]) assert.throws(() => planR2EvidenceCaps({...SPEC, actions, pollMs: 10}), /exceeds the 12000000-byte page cap/);
  assert.equal(TOTAL_CAP, 12_000_000);
});

// ---- R2-L2 C-3 production boundary over sealed S3 directories (CLOUD-R2-L2-04) ----
// openVerifiedR2SpeechEvidence runs this file's verifier and requires 'genuine-unqualified', which S3 cannot assign
// before S5b/S6. Every sealed directory is therefore refused; the authentic-positive case is pending S5b/S6.
import {openVerifiedR2SpeechEvidence, buildR2SpeechPayload} from '../src/r2/speech-payload.mjs';
const c3Open = (dir, inputs = INPUTS) => openVerifiedR2SpeechEvidence(dir, inputs);

test('C3-S1 a sealed, verifying synthetic directory is refused: genuine evidence required, attestation unavailable', async () => {
  const {dir, result} = await sealed();
  assert.equal(result.class, 'synthetic');
  assert.equal((await verifyR2PageEvidence(dir, INPUTS)).ok, true, 'S3 verifier unchanged: synthetic verifies');
  await assert.rejects(c3Open(dir), err => /genuine evidence required; verifier class is synthetic/.test(err.message) && err.message.includes(ATTESTATION_UNAVAILABLE));
});

test('C3-S2 incomplete, forged-class, forged-provenance, unsealed, altered and wrong-fixture directories are refused', async () => {
  const cases = [
    ['incomplete', async () => (await sealed({incomplete: ['session refusal']})).dir, /verifier class is incomplete/],
    ['forged genuine class', async () => { const {dir} = await sealed(); reseal(dir, m => { m.class = 'genuine-unqualified'; }); return dir; }, /does not verify/],
    ['forged provenance and class', async () => { const {dir} = await sealed(); reseal(dir, m => { m.class = 'genuine-unqualified'; m.provenance = {kind: 'owned-vendored-runtime'}; }); return dir; }, /does not verify/],
    ['provenance claim sealed by the writer', async () => (await sealed({provenance: {kind: 'owned-vendored-runtime', class: 'genuine-unqualified'}})).dir, /verifier class is incomplete/],
    ['missing seal', async () => { const {dir} = await sealed(); unlinkSync(join(dir, 'manifest.sha256')); return dir; }, /does not verify/],
    ['altered capture', async () => { const {dir} = await sealed(); writeFileSync(join(dir, 'capture.json'), '{}'); return dir; }, /does not verify/],
    ['altered speech lane', async () => { const {dir} = await sealed(); writeFileSync(join(dir, 'speech.jsonl'), '{"phrases":["forged"]}\n'); return dir; }, /does not verify/],
  ];
  for (const [name, make, pattern] of cases) {
    const dir = await make();
    await assert.rejects(c3Open(dir), pattern, name);
  }
  const {dir} = await sealed();
  const other = manifest.pairs.find(p => p.id === 'status');
  await assert.rejects(c3Open(dir, {fixture: readFileSync(new URL(`../fixtures/r2/${other.healthy.file}`, import.meta.url)), approved: APPROVED}), /does not verify/, 'wrong approved fixture');
});

test('C3-S3 no verified handle exists after a refusal; caller objects never authorize the production builder', async () => {
  const {dir} = await sealed();
  const manifestJson = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const capture = JSON.parse(readFileSync(join(dir, 'capture.json'), 'utf8'));
  await assert.rejects(c3Open(dir));
  for (const forged of [manifestJson, {...manifestJson, class: 'genuine-unqualified'}, {manifest_sha256: sha256(readFileSync(join(dir, 'manifest.json')))},
    Object.freeze({verified: true, class: 'genuine-unqualified'})]) {
    assert.throws(() => buildR2SpeechPayload({capture, stepMap: manifestJson.step_map, manifest: forged, fixture_id: 'f-ab12'}),
      /independently verified genuine evidence handle/);
  }
});

// ---- R2-L2 O-10: offline hosted-provenance verifier (D-85 hybrid) ----
// GitHub's `gh attestation verify` does the cryptography; src/r2/provenance.mjs only runs it (explicit executable,
// argv array, no shell, timeout, output cap, exit check) and applies owner policy to its JSON. These tests never run
// gh or any process: the spawn seam is an in-memory fake, and a verifier built on an injected spawn is marked
// simulated, so its handle is never authority. Authentic signed-artifact verification is PENDING owner authorization.
import {EventEmitter} from 'node:events';
import {createRequire, syncBuiltinESMExports} from 'node:module';
import {dirname} from 'node:path';
import {verifyR2HostedProvenance, readVerifiedHostedProvenance, r2ProvenancePolicyDigest, PROVENANCE_POLICY_SCHEMA, VERIFICATION_RESULT_MEDIA} from '../src/r2/provenance.mjs';

const O10_GH = 'fake gh executable bytes (never run)\n', O10_ROOT = '{"root":1}\n';
const O10_SHA = 'a'.repeat(40);
function o10Fixture() {
  const root = temp(), run = join(root, 'run');
  mkdirSync(run);
  const manifestBytes = Buffer.from(JSON.stringify({schema: 'tabwise-r2-run-evidence/1', pages: []}, null, 2) + '\n');
  writeFileSync(join(run, 'run-manifest.json'), manifestBytes);
  writeFileSync(join(run, 'run-manifest.sha256'), `${sha256(manifestBytes)}  run-manifest.json\n`);
  for (const [name, body] of [['gh.exe', O10_GH], ['bundle.jsonl', '{"bundle":1}\n'], ['trusted_root.jsonl', O10_ROOT]]) writeFileSync(join(root, name), body);
  const policy = {schema: PROVENANCE_POLICY_SCHEMA, gh_executable: join(root, 'gh.exe'), gh_sha256: sha256(O10_GH), trusted_root_sha256: sha256(O10_ROOT),
    repository: 'ANIRUDDH-001/Tabwise', repository_id: '900001', owner_id: '800001', workflow: '.github/workflows/tabwise-r2.yml',
    ref: 'refs/heads/main', sha: O10_SHA, run_id: '123456789', run_attempt: 1, actor: 'ANIRUDDH-001', trigger: 'workflow_dispatch',
    oidc_issuer: 'https://token.actions.githubusercontent.com', predicate_type: 'https://slsa.dev/provenance/v1',
    not_before: '2026-11-01T00:00:00Z', not_after: '2026-11-05T00:00:00Z'};
  return {root, run, subject: sha256(manifestBytes), policy, bundle: join(root, 'bundle.jsonl'), trustedRoot: join(root, 'trusted_root.jsonl')};
}
const O10_SIGNER = 'https://github.com/ANIRUDDH-001/Tabwise/.github/workflows/tabwise-r2.yml@refs/heads/main';
function o10Certificate() {
  return {certificateIssuer: 'CN=sigstore-intermediate,O=sigstore.dev', subjectAlternativeName: O10_SIGNER,
    issuer: 'https://token.actions.githubusercontent.com', githubWorkflowTrigger: 'workflow_dispatch', githubWorkflowSHA: O10_SHA,
    githubWorkflowName: 'tabwise-r2', githubWorkflowRepository: 'ANIRUDDH-001/Tabwise', githubWorkflowRef: 'refs/heads/main',
    buildSignerURI: O10_SIGNER, buildSignerDigest: O10_SHA, runnerEnvironment: 'github-hosted',
    sourceRepositoryURI: 'https://github.com/ANIRUDDH-001/Tabwise', sourceRepositoryDigest: O10_SHA, sourceRepositoryRef: 'refs/heads/main',
    sourceRepositoryIdentifier: '900001', sourceRepositoryOwnerURI: 'https://github.com/ANIRUDDH-001', sourceRepositoryOwnerIdentifier: '800001',
    buildConfigURI: O10_SIGNER, buildConfigDigest: O10_SHA, buildTrigger: 'workflow_dispatch',
    runInvocationURI: 'https://github.com/ANIRUDDH-001/Tabwise/actions/runs/123456789/attempts/1', sourceRepositoryVisibilityAtSigning: 'private'};
}
function o10Output(subject, edit) {
  const entry = {attestation: {bundle: {opaque: true}}, verificationResult: {mediaType: VERIFICATION_RESULT_MEDIA,
    statement: {_type: 'https://in-toto.io/Statement/v1', subject: [{name: 'run-manifest.json', digest: {sha256: subject}}],
      predicateType: 'https://slsa.dev/provenance/v1', predicate: {buildDefinition: {externalParameters: {workflow: {repository: 'https://github.com/ANIRUDDH-001/Tabwise'}}}}},
    signature: {certificate: o10Certificate()},
    verifiedTimestamps: [{type: 'Tlog', uri: 'https://rekor.sigstore.dev', timestamp: '2026-11-02T10:00:00Z'}],
    verifiedIdentity: {subjectAlternativeName: {subjectAlternativeName: O10_SIGNER}}}};
  const out = [entry];
  edit?.(out, entry.verificationResult);
  return out;
}
// In-memory child process. behave(child, args) drives it; a child that is never closed models a hang.
function o10Spawn(behave) {
  const calls = [];
  const spawnImpl = (file, args, options) => {
    calls.push({file, args, options});
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.kill = signal => { child.killed = signal; setImmediate(() => child.emit('close', null, signal)); return true; };
    setImmediate(() => behave(child, args));
    return child;
  };
  spawnImpl.calls = calls;
  return spawnImpl;
}
const o10Emit = (text, code = 0, signal = null) => child => { if (text) child.stdout.emit('data', Buffer.from(text)); child.emit('close', code, signal); };
const o10Json = (subject, edit) => o10Emit(JSON.stringify(o10Output(subject, edit)));
function o10Run(f, spawnImpl, extra = {}) {
  return verifyR2HostedProvenance({runDir: f.run, bundle: f.bundle, trustedRoot: f.trustedRoot, policy: f.policy, spawnImpl, ...extra});
}

test('O10-1 policy-conforming output yields workflow-origin claims; the simulated handle is never authority', async () => {
  const f = o10Fixture(), spawnImpl = o10Spawn(o10Json(f.subject));
  const leak = ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST', 'GH_REPO', 'GH_ENTERPRISE_TOKEN'], saved = leak.map(k => process.env[k]);
  for (const k of leak) process.env[k] = 'placeholder-not-a-credential';
  let r;
  try { r = await o10Run(f, spawnImpl); } finally { leak.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; }); }
  assert.equal(r.simulated, true);
  assert.deepEqual(r.claims, {schema: 'tabwise-r2-workflow-origin/1', evidence_class: 'workflow-origin', runtime_attested: false,
    physical_input_attested: false, actor_bound: false, subject_name: 'run-manifest.json', subject_sha256: f.subject,
    repository: 'ANIRUDDH-001/Tabwise', repository_id: '900001', owner_id: '800001', workflow: '.github/workflows/tabwise-r2.yml',
    ref: 'refs/heads/main', sha: O10_SHA, run_id: '123456789', run_attempt: 1, trigger: 'workflow_dispatch', runner_environment: 'github-hosted',
    timestamps: [{type: 'Tlog', uri: 'https://rekor.sigstore.dev', timestamp: '2026-11-02T10:00:00Z'}],
    authority: 'gh attestation verify certificate summary and verified timestamps; predicate ignored',
    trusted_root_sha256: sha256(O10_ROOT), policy_sha256: r2ProvenancePolicyDigest(f.policy)});
  assert.ok(Object.isFrozen(r.claims) && Object.isFrozen(r.handle));
  assert.throws(() => readVerifiedHostedProvenance(r.handle), /simulated/);
  const [call] = spawnImpl.calls;
  assert.equal(spawnImpl.calls.length, 1);
  assert.equal(call.file, f.policy.gh_executable);
  assert.deepEqual(call.args, ['attestation', 'verify', join(f.run, 'run-manifest.json'), `--bundle=${f.bundle}`,
    `--custom-trusted-root=${f.trustedRoot}`, '--repo=ANIRUDDH-001/Tabwise', '--signer-workflow=ANIRUDDH-001/Tabwise/.github/workflows/tabwise-r2.yml',
    `--source-digest=${O10_SHA}`, '--source-ref=refs/heads/main', '--cert-oidc-issuer=https://token.actions.githubusercontent.com',
    '--predicate-type=https://slsa.dev/provenance/v1', '--deny-self-hosted-runners', '--format=json']);
  assert.equal(call.options.shell, false);
  assert.equal(call.options.cwd, dirname(f.policy.gh_executable), 'gh runs in the owner-pinned install directory, not the caller cwd');
  for (const name of leak) assert.equal(name in call.options.env, false, `${name} is never forwarded to gh`);
  assert.doesNotMatch(JSON.stringify(r.claims), /externalParameters/, 'the predicate never reaches the claims');
});

test('O10-2 forged, copied or plain handles are refused', async () => {
  const f = o10Fixture(), r = await o10Run(f, o10Spawn(o10Json(f.subject)));
  for (const forged of [undefined, null, {}, {...r.handle}, Object.freeze({...r.handle}), structuredClone(r.handle), {verified: true, simulated: false}]) {
    assert.throws(() => readVerifiedHostedProvenance(forged), /^Error: provenance: /, JSON.stringify(forged));
  }
  await assert.rejects(o10Run(f, o10Spawn(o10Json(f.subject)), {verified: true}), /^Error: provenance: unknown option/);
});

test('O10-3 malformed owner policy refuses before any process starts', async () => {
  const cases = [
    ['missing policy', p => null], ['wrong schema', p => ({...p, schema: 'x/1'})], ['extra key', p => ({...p, success: true})],
    ...Object.keys(o10Fixture().policy).filter(k => k !== 'schema').map(k => [`missing ${k}`, p => { const q = {...p}; delete q[k]; return q; }]),
    ['non-numeric repository id', p => ({...p, repository_id: 'Tabwise'})], ['numeric owner id as a number', p => ({...p, owner_id: 800001})],
    ['short sha', p => ({...p, sha: 'abc'})], ['run attempt zero', p => ({...p, run_attempt: 0})], ['repository with a path', p => ({...p, repository: 'a/b/c'})],
    ['workflow outside .github/workflows', p => ({...p, workflow: 'tabwise-r2.yml'})], ['ref not a branch', p => ({...p, ref: 'main'})],
    ['window reversed', p => ({...p, not_before: p.not_after, not_after: p.not_before})], ['value starting with a dash', p => ({...p, actor: '--help'})]];
  for (const [name, edit] of cases) {
    const f = o10Fixture(), spawnImpl = o10Spawn(o10Json(f.subject));
    f.policy = edit(f.policy);
    await assert.rejects(o10Run(f, spawnImpl), /^Error: provenance: policy/, name);
    assert.equal(spawnImpl.calls.length, 0, name);
  }
});

test('O10-4 the executable is pinned: relative, shell-wrapper and digest-mismatched executables refuse before spawn', async () => {
  for (const [name, edit] of [['relative path', (f) => { f.policy.gh_executable = 'gh.exe'; }],
    ['batch wrapper', (f) => { writeFileSync(join(f.root, 'gh.cmd'), O10_GH); f.policy.gh_executable = join(f.root, 'gh.cmd'); }],
    ['digest mismatch', (f) => { writeFileSync(f.policy.gh_executable, 'swapped binary'); }],
    ['missing executable', (f) => { unlinkSync(f.policy.gh_executable); }]]) {
    const f = o10Fixture(), spawnImpl = o10Spawn(o10Json(f.subject));
    edit(f);
    await assert.rejects(o10Run(f, spawnImpl), /^Error: provenance: /, name);
    assert.equal(spawnImpl.calls.length, 0, name);
  }
});

test('O10-5 the subject digest is recomputed from the sealed run manifest; copied or tampered evidence refuses', async () => {
  const cases = [
    ['attestation for other evidence (copied bundle)', f => o10Json('b'.repeat(64))],
    ['sealed manifest edited after sealing', f => { writeFileSync(join(f.run, 'run-manifest.json'), '{"tampered":true}\n'); return o10Json(f.subject); }],
    ['manifest and attestation both swapped, digest file stale', f => {
      const bytes = Buffer.from('{"forged":true}\n'); writeFileSync(join(f.run, 'run-manifest.json'), bytes); return o10Json(sha256(bytes)); }],
    ['missing digest file', f => { unlinkSync(join(f.run, 'run-manifest.sha256')); return o10Json(f.subject); }],
    ['manifest changed while gh ran', f => child => { writeFileSync(join(f.run, 'run-manifest.json'), 'late edit\n'); o10Json(f.subject)(child); }],
    ['uppercase digest in the attestation', f => o10Json(f.subject.toUpperCase())],
    ['second digest algorithm', f => o10Json(f.subject, (o, v) => { v.statement.subject[0].digest.sha512 = 'c'.repeat(128); })],
    ['two subjects', f => o10Json(f.subject, (o, v) => { v.statement.subject.push({name: 'other', digest: {sha256: f.subject}}); })],
    ['no subjects', f => o10Json(f.subject, (o, v) => { v.statement.subject = []; })],
    ['subject named for another file', f => o10Json(f.subject, (o, v) => { v.statement.subject[0].name = 'manifest.json'; })]];
  for (const [name, behave] of cases) {
    const f = o10Fixture();
    await assert.rejects(o10Run(f, o10Spawn(behave(f))), /^Error: provenance: /, name);
  }
});

test('O10-6 certificate identity must equal owner policy: wrong repo, id, workflow, run, attempt, commit, ref, trigger, runner or issuer refuse', async () => {
  const cert = o10Certificate();
  const wrong = {
    certificateIssuer: '', subjectAlternativeName: O10_SIGNER.replace('tabwise-r2', 'other'), issuer: 'https://evil.example',
    githubWorkflowTrigger: 'push', githubWorkflowSHA: 'b'.repeat(40), githubWorkflowRepository: 'attacker/Tabwise', githubWorkflowRef: 'refs/heads/dev',
    buildSignerURI: O10_SIGNER.replace('main', 'dev'), buildSignerDigest: 'b'.repeat(40), runnerEnvironment: 'self-hosted',
    sourceRepositoryURI: 'https://github.com/attacker/Tabwise', sourceRepositoryDigest: 'b'.repeat(40), sourceRepositoryRef: 'refs/heads/dev',
    sourceRepositoryIdentifier: '900002', sourceRepositoryOwnerURI: 'https://github.com/attacker', sourceRepositoryOwnerIdentifier: '800002',
    buildConfigURI: 'https://github.com/ANIRUDDH-001/Tabwise/.github/workflows/r1.yml@refs/heads/main', buildConfigDigest: 'b'.repeat(40),
    buildTrigger: 'push', runInvocationURI: cert.runInvocationURI.replace('123456789', '123456788')};
  for (const [field, value] of Object.entries(wrong)) {
    const f = o10Fixture();
    await assert.rejects(o10Run(f, o10Spawn(o10Json(f.subject, (o, v) => { v.signature.certificate[field] = value; }))),
      new RegExp(`^Error: provenance: certificate ${field}`), field);
  }
  for (const [name, uri] of [['replayed attempt', cert.runInvocationURI.replace(/1$/, '2')], ['run URI in another repository', cert.runInvocationURI.replace('ANIRUDDH-001/Tabwise', 'attacker/Tabwise')]]) {
    const f = o10Fixture();
    await assert.rejects(o10Run(f, o10Spawn(o10Json(f.subject, (o, v) => { v.signature.certificate.runInvocationURI = uri; }))), /^Error: provenance: certificate runInvocationURI/, name);
  }
  const second = o10Fixture();
  second.policy.run_attempt = 2;
  await assert.rejects(o10Run(second, o10Spawn(o10Json(second.subject))), /^Error: provenance: certificate runInvocationURI/, 'attempt 1 replayed where the owner approved attempt 2');
  const rerun = o10Fixture();
  rerun.policy.run_attempt = 2;
  const ok = await o10Run(rerun, o10Spawn(o10Json(rerun.subject, (o, v) => { v.signature.certificate.runInvocationURI = cert.runInvocationURI.replace(/1$/, '2'); })));
  assert.equal(ok.claims.run_attempt, 2, 'the approved attempt comes from owner policy');
  const renamed = o10Fixture();
  renamed.policy.repository_id = '900009';
  await assert.rejects(o10Run(renamed, o10Spawn(o10Json(renamed.subject))), /^Error: provenance: certificate sourceRepositoryIdentifier/, 'a same-name repository with another numeric id (rename or re-creation)');
});

test('O10-7 missing, mistyped or unsupported certificate fields refuse', async () => {
  const required = ['certificateIssuer', 'subjectAlternativeName', 'issuer', 'buildSignerURI', 'buildSignerDigest', 'runnerEnvironment',
    'sourceRepositoryURI', 'sourceRepositoryDigest', 'sourceRepositoryRef', 'sourceRepositoryIdentifier', 'sourceRepositoryOwnerURI',
    'sourceRepositoryOwnerIdentifier', 'buildConfigURI', 'buildConfigDigest', 'buildTrigger', 'runInvocationURI'];
  for (const field of required) {
    const f = o10Fixture();
    await assert.rejects(o10Run(f, o10Spawn(o10Json(f.subject, (o, v) => { delete v.signature.certificate[field]; }))), new RegExp(`^Error: provenance: certificate ${field}`), `missing ${field}`);
    const g = o10Fixture();
    await assert.rejects(o10Run(g, o10Spawn(o10Json(g.subject, (o, v) => { v.signature.certificate[field] = 1; }))), new RegExp(`^Error: provenance: certificate ${field}`), `mistyped ${field}`);
  }
  for (const field of ['githubWorkflowTrigger', 'githubWorkflowSHA', 'githubWorkflowName', 'githubWorkflowRepository', 'githubWorkflowRef', 'sourceRepositoryVisibilityAtSigning']) {
    const f = o10Fixture();
    const r = await o10Run(f, o10Spawn(o10Json(f.subject, (o, v) => { delete v.signature.certificate[field]; })));
    assert.equal(r.claims.run_id, '123456789', `optional ${field} may be absent`);
  }
  const f = o10Fixture();
  await assert.rejects(o10Run(f, o10Spawn(o10Json(f.subject, (o, v) => { v.signature.certificate.actorIdentifier = '1'; }))), /^Error: provenance: certificate has unsupported field actorIdentifier/);
});

test('O10-8 output structure is strict: one entry, allowlisted media type, statement type and predicate type, no unknown keys', async () => {
  const cases = [
    ['empty array', o => { o.length = 0; }], ['two entries', o => { o.push(structuredClone(o[0])); }],
    ['object instead of array', null], ['media type', (o, v) => { v.mediaType = 'application/json'; }],
    ['statement type', (o, v) => { v.statement._type = 'https://in-toto.io/Statement/v0.1'; }],
    ['predicate type', (o, v) => { v.statement.predicateType = 'https://example.com/custom'; }],
    ['unknown result key', (o, v) => { v.verified = true; }], ['unknown entry key', o => { o[0].success = true; }],
    ['missing signature', (o, v) => { delete v.signature; }], ['missing statement', (o, v) => { delete v.statement; }],
    ['unknown signature key', (o, v) => { v.signature.key = 'x'; }], ['certificate not an object', (o, v) => { v.signature.certificate = 'x'; }]];
  for (const [name, edit] of cases) {
    const f = o10Fixture();
    const behave = edit ? o10Json(f.subject, edit) : o10Emit(JSON.stringify(o10Output(f.subject)[0]));
    await assert.rejects(o10Run(f, o10Spawn(behave)), /^Error: provenance: /, name);
  }
});

test('O10-9 verified timestamps are required, well-formed and inside the owner window', async () => {
  const cases = [
    ['none', (o, v) => { v.verifiedTimestamps = []; }], ['missing', (o, v) => { delete v.verifiedTimestamps; }],
    ['before the window', (o, v) => { v.verifiedTimestamps[0].timestamp = '2026-10-31T23:59:59Z'; }],
    ['after the window', (o, v) => { v.verifiedTimestamps[0].timestamp = '2026-11-05T00:00:01Z'; }],
    ['one of two outside the window', (o, v) => { v.verifiedTimestamps.push({type: 'TimestampAuthority', uri: 'https://tsa.example', timestamp: '2025-01-01T00:00:00Z'}); }],
    ['malformed', (o, v) => { v.verifiedTimestamps[0].timestamp = 'yesterday'; }], ['unknown type', (o, v) => { v.verifiedTimestamps[0].type = 'Local'; }],
    ['unknown key', (o, v) => { v.verifiedTimestamps[0].trusted = true; }], ['too many', (o, v) => { v.verifiedTimestamps = Array(9).fill(v.verifiedTimestamps[0]); }]];
  for (const [name, edit] of cases) {
    const f = o10Fixture();
    await assert.rejects(o10Run(f, o10Spawn(o10Json(f.subject, edit))), /^Error: provenance: .*timestamp/, name);
  }
});

test('O10-10 predicate content never gains certificate authority', async () => {
  const f = o10Fixture();
  const r = await o10Run(f, o10Spawn(o10Json(f.subject, (o, v) => {
    v.statement.predicate = {repository: 'attacker/Tabwise', runner_environment: 'self-hosted', run_id: '1', actor: 'attacker', sha: 'b'.repeat(40)};
  })));
  assert.equal(r.claims.repository, 'ANIRUDDH-001/Tabwise');
  assert.equal(r.claims.run_id, '123456789');
  assert.equal(r.claims.actor_bound, false, 'the actor is not in the certificate, so it stays an unbound workflow claim');
  assert.doesNotMatch(JSON.stringify(r.claims), /attacker|self-hosted/);
});

test('O10-11 process boundary: non-zero exit, signal, timeout, oversized output, malformed or empty JSON and spawn errors refuse', async () => {
  const big = 'x'.repeat(16384);
  const cases = [
    ['non-zero exit with valid JSON', f => o10Emit(JSON.stringify(o10Output(f.subject)), 1), /exit/],
    ['killed by a signal', f => o10Emit(JSON.stringify(o10Output(f.subject)), null, 'SIGTERM'), /exit/],
    ['hang (timeout)', f => () => {}, /timed out/],
    ['stdout over the cap', f => child => { child.stdout.emit('data', Buffer.from(big)); child.emit('close', 0, null); }, /output exceeds/],
    ['stderr over the cap', f => child => { child.stderr.emit('data', Buffer.from(big)); child.emit('close', 0, null); }, /output exceeds/],
    ['malformed JSON', f => o10Emit('[{"verificationResult":'), /JSON/],
    ['empty output', f => o10Emit(''), /JSON/],
    ['trailing garbage after JSON', f => o10Emit(JSON.stringify(o10Output(f.subject)) + ' ok'), /JSON/],
    ['spawn error', f => child => child.emit('error', Error('ENOENT')), /ENOENT/]];
  for (const [name, behave, reason] of cases) {
    const f = o10Fixture(), spawnImpl = o10Spawn(behave(f));
    const t0 = performance.now();
    await assert.rejects(o10Run(f, spawnImpl, {timeoutMs: 50, maxOutputBytes: 8192}), err => /^provenance: /.test(err.message) && reason.test(err.message), name);
    assert.ok(performance.now() - t0 < 5000, `${name}: bounded`);
  }
  const f = o10Fixture();
  for (const extra of [{timeoutMs: 0}, {timeoutMs: 10 * 60_000}, {maxOutputBytes: 0}, {maxOutputBytes: 64 * 1024 * 1024}]) {
    await assert.rejects(o10Run(f, o10Spawn(o10Json(f.subject)), extra), /^Error: provenance: /, JSON.stringify(extra));
  }
});

test('O10-12 a spawn that throws or returns a child without pipes refuses promptly', async () => {
  for (const [name, spawnImpl, reason] of [['spawn throws', () => { throw Error('EACCES'); }, /could not start: EACCES/],
    ['no child', () => undefined, /no output pipes/], ['child without pipes', () => ({on() {}}), /no output pipes/]]) {
    const f = o10Fixture(), t0 = performance.now();
    await assert.rejects(o10Run(f, spawnImpl, {timeoutMs: 60_000}), err => /^provenance: /.test(err.message) && reason.test(err.message), name);
    assert.ok(performance.now() - t0 < 1000, `${name}: refused without waiting for the timeout`);
  }
});

test('O10-13 the trusted root is pinned by owner policy digest before and after gh runs (adversarial review)', async () => {
  const f = o10Fixture(), spawnImpl = o10Spawn(o10Json(f.subject));
  writeFileSync(f.trustedRoot, '{"root":"attacker CA"}\n');
  await assert.rejects(o10Run(f, spawnImpl), /^Error: provenance: trusted root digest does not match owner policy/);
  assert.equal(spawnImpl.calls.length, 0);
  const g = o10Fixture();
  await assert.rejects(o10Run(g, o10Spawn(child => { writeFileSync(g.trustedRoot, '{"root":"swapped"}\n'); o10Json(g.subject)(child); })),
    /^Error: provenance: trusted root changed during verification/);
  const h = o10Fixture();
  h.policy.trusted_root_sha256 = 'A'.repeat(64);
  await assert.rejects(o10Run(h, o10Spawn(o10Json(h.subject))), /^Error: provenance: policy trusted_root_sha256/);
});

test('O10-14 the policy digest covers every owner field; rebinding child_process.spawn cannot mint an authentic handle', async () => {
  const f = o10Fixture(), base = r2ProvenancePolicyDigest(f.policy);
  assert.match(base, /^[0-9a-f]{64}$/);
  for (const k of Object.keys(f.policy)) {
    const q = {...f.policy, [k]: k === 'run_attempt' ? 2 : `${f.policy[k]}x`};
    assert.notEqual(r2ProvenancePolicyDigest(q), base, k);
  }
  const cp = createRequire(import.meta.url)('node:child_process'), original = cp.spawn, fake = o10Spawn(o10Json(f.subject));
  cp.spawn = fake;
  syncBuiltinESMExports();
  let r;
  try { r = await o10Run(f, fake); } finally { cp.spawn = original; syncBuiltinESMExports(); }
  assert.equal(r.simulated, true, 'a spawn rebound after load is still an injected seam');
  assert.throws(() => readVerifiedHostedProvenance(r.handle), /simulated/);
});

// ---- R2 S7 (A-3): --verify-run re-verification from disk. Synthetic sealed runs only; nothing here is genuine evidence. ----
const s7Run = () => import('../scripts/tabwise/r2-run.mjs');
// A gate-shaped object as checkR2Entry returns it (plan, approved pages, hash-bound fixtures); never a real gate.
const s7Gate = (ids = ['p1', 'p2']) => ({plan: {pages: ids.map(id => ({id, task: APPROVED.task}))},
  pages: ids.map(id => ({id, fixture_sha256: APPROVED.fixture_sha256})), fixtures: new Map(ids.map(id => [id, FIXTURE]))});
async function s7Sealed(gate, exits = gate.pages.map(() => 0)) {
  const {r2RunInputs} = await s7Run();
  const run = temp(), {plan, inputs} = r2RunInputs(gate);
  for (const [i] of exits.entries()) { const h = harness(join(run, gate.pages[i].id)); await journey(h); await h.writer.seal(); }
  const sealedRun = await sealR2Run(run, {enabled: true, plan, pages: exits.map((exit_code, i) => ({id: gate.pages[i].id, exit_code})), inputs});
  return {run, plan, inputs, sealedRun};
}

test('S7-V1 verifyR2Run reports the digest of the exact verified run-manifest bytes, and null whenever it refuses', async () => {
  const {run, plan, inputs, sealedRun} = await s7Sealed(s7Gate());
  const v = await verifyR2Run(run, {plan, inputs});
  assert.deepEqual([v.ok, v.manifest_sha256], [true, sealedRun.manifest_sha256]);
  assert.equal(v.manifest_sha256, sha256(readFileSync(join(run, 'run-manifest.json'))));
  writeFileSync(join(run, 'p2', 'events.jsonl'), readFileSync(join(run, 'p2', 'events.jsonl'), 'utf8') + '{}\n');
  const tampered = await verifyR2Run(run, {plan, inputs});
  assert.deepEqual([tampered.ok, tampered.manifest_sha256], [false, null]);
  const missing = await verifyR2Run(join(run, 'absent'), {plan, inputs});
  assert.deepEqual([missing.ok, missing.manifest_sha256], [false, null]);
});

test('S7-V2 r2RunInputs derives the approved inputs from the gate exactly as the run step seals them', async () => {
  const {r2RunInputs} = await s7Run();
  const gate = s7Gate(['p1']), {plan, inputs} = r2RunInputs(gate);
  assert.deepEqual(plan, gate.plan); assert.notEqual(plan, gate.plan, 'a copy; the frozen gate plan is never handed out');
  assert.deepEqual(inputs, {p1: {fixture: FIXTURE, approved: {fixture_sha256: APPROVED.fixture_sha256, task: APPROVED.task}}});
});

test('S7-V3 r2VerifyRun: a complete verified run exits 0 with its digest; tampered, missing, stopped and failed runs exit 2', async () => {
  const {r2VerifyRun} = await s7Run();
  const gate = s7Gate(), good = await s7Sealed(gate);
  const ok = await r2VerifyRun(gate, good.run);
  assert.equal(ok.code, 0);
  assert.deepEqual(ok.summary, {schema: 'tabwise-r2-verify/1', ok: true, complete: true, run_class: 'synthetic', errors: [],
    run_manifest_sha256: good.sealedRun.manifest_sha256, genuine_evidence: false});
  const refused = async (summary, code, why) => {
    assert.equal(code, 2, why);
    assert.equal(summary.schema, 'tabwise-r2-verify/1', why); assert.equal(summary.complete, false, why); assert.equal(summary.genuine_evidence, false, why);
    assert.ok(summary.errors.length > 0, why);
  };
  const stopped = await s7Sealed(gate, [1]);
  let r = await r2VerifyRun(gate, stopped.run);
  await refused(r.summary, r.code, 'stopped after a failing page');
  assert.equal(r.summary.ok, true, 'the stopped run itself verifies; it is just not complete');
  const lastFailed = await s7Sealed(gate, [0, 3]);
  r = await r2VerifyRun(gate, lastFailed.run);
  await refused(r.summary, r.code, 'last page failed');
  r = await r2VerifyRun(gate, join(good.run, 'absent'));
  await refused(r.summary, r.code, 'missing run directory');
  assert.deepEqual([r.summary.ok, r.summary.run_manifest_sha256], [false, null]);
  writeFileSync(join(good.run, 'run-manifest.sha256'), `${'0'.repeat(64)}  run-manifest.json\n`);
  r = await r2VerifyRun(gate, good.run);
  await refused(r.summary, r.code, 'digest file swapped');
  assert.deepEqual([r.summary.ok, r.summary.run_manifest_sha256, r.summary.run_class], [false, null, 'incomplete']);
  const other = await s7Sealed(s7Gate(['p1']));
  r = await r2VerifyRun(gate, other.run);
  await refused(r.summary, r.code, 'a run sealed under a different plan');
});

test('S7-V4 r2VerifyOutcome trusts nothing but a verified result with a digest and a complete, all-zero run', async () => {
  const {r2VerifyOutcome} = await s7Run();
  const page = {id: 'p1', dir: 'p1', manifest_sha256: 'a'.repeat(64), exit_code: 0, class: 'synthetic'};
  const v = (over = {}, manifest = {}) => ({ok: true, run_class: 'synthetic', errors: [], manifest_sha256: 'b'.repeat(64), manifest: {pages: [page], ...manifest}, ...over});
  assert.equal(r2VerifyOutcome(v()).code, 0);
  for (const [why, input] of [['not ok', v({ok: false, errors: ['x']})], ['ok is truthy, not true', v({ok: 1})], ['no digest', v({manifest_sha256: null})],
    ['uppercase digest', v({manifest_sha256: 'B'.repeat(64)})], ['stopped', v({}, {stopped_after: 'p1'})], ['failed page', v({}, {pages: [{...page, exit_code: 2}]})],
    ['unsealed page', v({}, {pages: [{...page, manifest_sha256: null}]})], ['no pages', v({}, {pages: []})], ['no manifest', v({manifest: null})],
    ['null', null], ['string', 'ok']]) {
    const r = r2VerifyOutcome(input);
    assert.equal(r.code, 2, why); assert.equal(r.summary.complete, false, why); assert.ok(r.summary.errors.length > 0, why);
    if (!r.summary.ok) assert.deepEqual([r.summary.run_class, r.summary.run_manifest_sha256], ['incomplete', null], `${why}: nothing of a refused verification is reported`);
  }
  const r = r2VerifyOutcome(v({ok: false, errors: Array.from({length: 100}, () => 'e'.repeat(2000))}));
  assert.ok(r.summary.errors.length <= 64 && r.summary.errors.every(e => e.length <= 512), 'errors are capped');
  assert.equal(r.summary.run_manifest_sha256, null, 'no digest is reported for a refused run');
});
