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
