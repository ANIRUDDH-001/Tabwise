// W3/W4 (spec 2026-11-02, amendments A-C): single lifecycle owner for one R2 page. Offline only: real S3 writer and
// verifier on temporary directories, injected callbacks, real timers with small injected bounds. No browser, NVDA,
// socket or child process. The module is loaded dynamically so every row reports on its own (RED evidence).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createR2EvidenceWriter, verifyR2PageEvidence, planR2EvidenceCaps} from '../scripts/tabwise/r2-evidence.mjs';
import {PAGE_DEADLINE_MS, CHILD_TIMEOUT_MS} from '../scripts/tabwise/r2-run.mjs';

const LIFECYCLE = 'scripts/tabwise/r2-lifecycle.mjs';
const load = () => import(`../${LIFECYCLE}`);
const roots = [];
test.after(() => { for (const d of roots) rmSync(d, {recursive: true, force: true}); });

const MANIFEST = JSON.parse(readFileSync(new URL('../fixtures/r2/manifest.json', import.meta.url), 'utf8'));
const PAIR = MANIFEST.pairs.find(p => p.id === 'validation');
const FIXTURE = readFileSync(new URL(`../fixtures/r2/${PAIR.healthy.file}`, import.meta.url));
const TASK = PAIR.task.map(({step, press}) => ({step, press}));
const APPROVED = {fixture_sha256: PAIR.healthy.sha256, task: TASK};
const SPEC = {actions: TASK.length, ackMs: 1000, timeoutMs: 2000, observationMs: 200, pollMs: 20};
planR2EvidenceCaps(SPEC);
const rawWriter = () => {
  const root = mkdtempSync(join(tmpdir(), 'tabwise-r2-life-')); roots.push(root);
  const dir = join(root, 'validation');
  return {dir, writer: createR2EvidenceWriter({enabled: true, dir, page: {fixture_id: 'validation', session: 'page-life', port: 4100}, fixture: FIXTURE,
    approved: APPROVED, nonce: '5e6f7a8b', spec: SPEC})};
};
const events = dir => readFileSync(join(dir, 'events.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const delay = ms => new Promise(r => setTimeout(r, ms));
const never = () => new Promise(() => {});
// Small real bounds; the shipped defaults are pinned separately (B-0).
const quick = (m, extra = {}) => m.createR2Lifecycle({pageStart: performance.now(), settleMs: 400, nvdaAbandonMs: 80, nvdaOrphanMs: 200, ...extra});
const nvdaBounds = l => ({label: 'NVDA start', boundMs: l.bounds.nvdaAbandonMs, orphanMs: l.bounds.nvdaOrphanMs});

// ---- B: bounds and the amendment-B boundary ----
test('B-0 shipped bounds: 40 s / 52 s triggers, 540 s work, 60 s settle, 600 s guard (= PAGE_DEADLINE_MS) < 720 s child deadline, 256 ops', async () => {
  const m = await load();
  const l = m.createR2Lifecycle({pageStart: performance.now()});
  assert.ok(Object.isFrozen(l) && Object.isFrozen(l.bounds));
  assert.deepEqual({...l.bounds}, {nvdaAbandonMs: 40000, nvdaOrphanMs: 52000, workMs: 540000, settleMs: 60000, guardMs: 600000, opCap: 256});
  assert.equal(l.bounds.guardMs, PAGE_DEADLINE_MS, 'the lifecycle guard bound is the entry page guard');
  assert.ok(l.bounds.guardMs < CHILD_TIMEOUT_MS, 'the coordinator child deadline stays authoritative');
  assert.throws(() => m.createR2Lifecycle({}), /pageStart/);
  assert.throws(() => m.createR2Lifecycle({pageStart: 0, guardMs: CHILD_TIMEOUT_MS}), /guard/, 'no bound may reach the coordinator deadline');
  assert.throws(() => m.createR2Lifecycle({pageStart: 0, workMs: 600000}), /work/, 'work must end before the guard');
});

test('B-1 a clean finalize inside the work limit is clean; one started after 540 s is never clean (safe cleanup still seals)', async () => {
  const m = await load();
  const ok = quick(m); const a = rawWriter(); ok.bindWriter(a.writer);
  const r1 = await ok.finalize({incomplete: ['synthetic offline row']});
  assert.equal(r1.clean, true, r1.reasons.join('; '));
  const late = quick(m, {pageStart: performance.now() - 540001}); const b = rawWriter(); late.bindWriter(b.writer);
  const r2 = await late.finalize({incomplete: ['synthetic offline row']});
  assert.equal(r2.clean, false); assert.match(r2.reasons.join('\n'), /work limit 540000 ms passed/);
  assert.equal(r2.sealed !== null, true, 'failure cleanup still seals diagnostic evidence');
  assert.equal((await verifyR2PageEvidence(b.dir, {fixture: FIXTURE, approved: APPROVED})).class, 'incomplete');
});

test('B-2 nothing completes after the 600 s guard: settle never waits past the guard and the result is never clean', async () => {
  const m = await load();
  // The guard is 150 ms away; settle allows 60 s; an operation never settles.
  const l = m.createR2Lifecycle({pageStart: performance.now() - 600000 + 150, workMs: 1, settleMs: 60000, nvdaAbandonMs: 1, nvdaOrphanMs: 2});
  const {dir, writer} = rawWriter(); l.bindWriter(writer);
  l.op('hung', never);
  const t0 = performance.now();
  const r = await l.finalize({incomplete: []});
  const took = performance.now() - t0;
  assert.ok(took < 5000, `settle bounded by the guard, took ${took} ms`);
  assert.equal(r.clean, false);
  assert.match(r.reasons.join('\n'), /guard deadline 600000 ms passed/);
  assert.ok(r.record.deadlines.settle_end_ms <= 600000, 'settle end never exceeds the guard');
  assert.equal((await verifyR2PageEvidence(dir, {fixture: FIXTURE, approved: APPROVED})).class, 'incomplete');
});

test('B-3 a stopped gate at finalize is never clean, even with clean slots and no pending work', async () => {
  const m = await load();
  let stopped = false;
  const l = quick(m, {stopped: () => stopped}); const {writer} = rawWriter(); l.bindWriter(writer);
  stopped = true;
  const r = await l.finalize({incomplete: ['x']});
  assert.equal(r.clean, false); assert.match(r.reasons.join('\n'), /gate stopped at finalize/);
});

// ---- N: NVDA raw start versus validation ----
test('N-1 raw start resolves: slot owned; release runs the stop once (memoized) and leaves the slot released', async () => {
  const m = await load();
  const l = quick(m); let stops = 0;
  const receipt = await l.acquire('nvda', async () => ({pid: 7}), nvdaBounds(l));
  assert.deepEqual(receipt, {pid: 7}); assert.equal(l.slot('nvda'), 'owned');
  await Promise.all([l.release('nvda', async () => { stops++; }), l.release('nvda', async () => { stops++; })]);
  assert.equal(stops, 1); assert.equal(l.slot('nvda'), 'released');
  const r = await l.finalize({fallback: true}); assert.equal(r.record.slots.nvda.state, 'released');
});

test('N-2 raw start rejects: rejected-unconfirmed (sticky), no stop is ever run, CONTAINMENT_REQUIRED', async () => {
  const m = await load();
  const l = quick(m); let stops = 0;
  await assert.rejects(l.acquire('nvda', async () => { throw Error('NVDA failed to start'); }, nvdaBounds(l)), /NVDA failed to start/);
  assert.equal(l.slot('nvda'), 'rejected-unconfirmed');
  await assert.rejects(l.release('nvda', async () => { stops++; }), /not owned \(rejected-unconfirmed\)/);
  assert.equal(stops, 0);
  const {writer} = rawWriter(); l.bindWriter(writer);
  const r = await l.finalize({});
  assert.equal(r.clean, false); assert.ok(r.reasons.includes('CONTAINMENT_REQUIRED:nvda:rejected-unconfirmed'), r.reasons.join('; '));
  assert.equal(l.slot('nvda'), 'rejected-unconfirmed', 'never cleared');
});

test('N-3 raw start still pending at T1: abandoned (trigger, not proof), no stop, orphaned at T2; settle stops waiting at T2', async () => {
  const m = await load();
  const l = quick(m, {settleMs: 5000}); let stops = 0;
  const t = performance.now();
  await assert.rejects(l.acquire('nvda', never, nvdaBounds(l)), /NVDA start: abandoned after 80 ms \(escalation trigger, not a termination proof\)/);
  assert.ok(performance.now() - t >= 75, 'not abandoned before T1');
  assert.equal(l.slot('nvda'), 'acquiring');
  await assert.rejects(l.release('nvda', async () => { stops++; }), /not owned \(acquiring\)/);
  assert.equal(stops, 0, 'no stop after an unsettled start');
  const t1 = performance.now();
  const r = await l.finalize({fallback: true});
  assert.ok(performance.now() - t1 < 2000, 'settle waited for T2 (200 ms), not the 5 s settle allowance');
  assert.equal(r.record.slots.nvda.state, 'orphaned');
  assert.ok(r.reasons.includes('CONTAINMENT_REQUIRED:nvda:orphaned'));
  assert.ok(r.record.pending.some(p => p.startsWith('NVDA start#')), JSON.stringify(r.record.pending));
});

test('N-4 a start that resolves after T1 stays orphaned (owned by nobody), never owned or released', async () => {
  const m = await load();
  const l = quick(m);
  let resolve; const late = new Promise(r => { resolve = r; });
  await assert.rejects(l.acquire('nvda', () => late, nvdaBounds(l)), /abandoned/);
  resolve({pid: 9}); await delay(5);
  assert.equal(l.slot('nvda'), 'orphaned');
  const r = await l.finalize({fallback: true});
  assert.ok(r.reasons.includes('CONTAINMENT_REQUIRED:nvda:orphaned'));
});

test('N-5 an op past its T2 orphan time does not end settlement for another pending op without one (fake clock, deferred)', async () => {
  const m = await load();
  let clock = 0;
  const l = m.createR2Lifecycle({pageStart: 0, now: () => clock, settleMs: 10000, nvdaAbandonMs: 10, nvdaOrphanMs: 20});
  l.acquire('nvda', never, {label: 'NVDA start', orphanMs: 20});
  let settleAck; const ack = l.op('ack read', () => new Promise(r => { settleAck = r; }));
  clock = 100; // past T2 (20) and well inside the 10 s settle allowance
  const t = performance.now();
  const finalizing = l.finalize({fallback: true});
  await new Promise(setImmediate);
  settleAck('ack');
  const r = await finalizing;
  assert.equal(await ack, 'ack');
  assert.ok(performance.now() - t < 2000, 'settlement ended when the ack settled, not at the settle allowance');
  assert.deepEqual(r.record.pending, ['NVDA start#1'], 'the ack settled during finalize; only the orphaned start stays unsettled');
  assert.equal(r.record.slots.nvda.state, 'orphaned');
  assert.ok(r.reasons.includes('operations unsettled at finalize: NVDA start#1'), JSON.stringify(r.reasons));
});

test('T-1 T1 and T2 are fixed from t0 (taken immediately before the raw start) and never reset; a second acquire is refused', async () => {
  const m = await load();
  const pageStart = performance.now();
  const l = quick(m, {pageStart});
  let seen = null;
  const before = performance.now();
  await l.acquire('nvda', async () => { seen = performance.now(); return {pid: 1}; }, nvdaBounds(l));
  const s = l.status().slots.nvda;
  assert.equal(s.abandon_at_ms - s.t0_ms, 80); assert.equal(s.orphan_at_ms - s.t0_ms, 200);
  assert.ok(s.t0_ms + pageStart <= seen + 1 && s.t0_ms + pageStart >= before - 1, 't0 taken immediately before the raw start');
  await assert.rejects(l.acquire('nvda', async () => ({pid: 2}), nvdaBounds(l)), /nvda already acquired/);
  assert.equal(l.status().slots.nvda.t0_ms, s.t0_ms, 'deadlines unchanged');
  assert.ok(l.status().sticky >= 1);
});

// ---- W: producer writes and the seal ----
test('W-1 finalize closes producer writes synchronously: a write from a settling operation is refused, sticky and absent from disk', async () => {
  const m = await load();
  const l = quick(m); const {dir, writer: raw} = rawWriter(); const writer = l.bindWriter(raw);
  writer.append('events', {phase: 'compose-start'});
  let refused = null;
  l.op('late producer', async () => { await delay(30); try { writer.append('events', {phase: 'late'}); } catch (error) { refused = error.message; } });
  const r = await l.finalize({incomplete: ['x']});
  assert.match(refused, /producer writes closed/);
  assert.equal(r.clean, false); assert.ok(r.record.sticky.count >= 1);
  assert.match(r.reasons.join('\n'), /lifecycle refused 1: write after finalize: events/);
  assert.equal(events(dir).some(e => e.phase === 'late'), false);
  assert.deepEqual(events(dir).filter(e => e.phase === 'lifecycle').length, 1, 'exactly one lifecycle event');
  const v = await verifyR2PageEvidence(dir, {fixture: FIXTURE, approved: APPROVED});
  assert.deepEqual([v.ok, v.class], [true, 'incomplete'], v.errors.join('; '));
});

test('W-3 writes after the seal are refused and stay sticky: the live status is never clean again', async () => {
  const m = await load();
  const l = quick(m); const {writer: raw} = rawWriter(); const writer = l.bindWriter(raw);
  const r = await l.finalize({incomplete: ['x']});
  assert.equal(l.status().clean, r.clean);
  assert.throws(() => writer.put('capture.json', '{}'), /producer writes closed/);
  assert.throws(() => writer.append('acks', {late: true}), /producer writes closed/);
  assert.equal(l.status().sticky, 2); assert.equal(l.status().clean, false);
  assert.throws(() => writer.seal({}), /only through lifecycle finalize/);
  assert.equal(l.status().sticky, 3);
});

test('R-1 bindWriter: memoized for the same raw writer and its wrapper; a second raw writer is refused (sticky)', async () => {
  const m = await load();
  const l = quick(m); const a = rawWriter(), b = rawWriter();
  const w = l.bindWriter(a.writer);
  assert.equal(l.bindWriter(a.writer), w); assert.equal(l.bindWriter(w), w);
  assert.ok(Object.isFrozen(w)); assert.equal(w.identity, a.writer.identity); assert.equal(w.failure(), null);
  assert.deepEqual(Object.keys(w).sort(), ['append', 'failure', 'identity', 'put', 'seal']);
  assert.throws(() => l.bindWriter(b.writer), /one evidence writer/);
  assert.equal(l.status().sticky, 1);
});

// ---- O: operations ----
test('O-1 a bounded operation rejects at its bound but stays pending until it settles', async () => {
  const m = await load();
  const l = quick(m); let resolve;
  await assert.rejects(l.op('page close', () => new Promise(r => { resolve = r; }), {boundMs: 20}), /page close: timed out after 20 ms/);
  assert.deepEqual(l.pending(), ['page close#1']);
  resolve(); await delay(1);
  assert.deepEqual(l.pending(), []);
});

test('O-2 an operation still pending at finalize prevents clean even though diagnostic evidence seals', async () => {
  const m = await load();
  const l = quick(m, {settleMs: 50}); const {dir, writer} = rawWriter(); l.bindWriter(writer);
  l.op('executor', never);
  const r = await l.finalize({incomplete: []});
  assert.equal(r.clean, false); assert.ok(r.sealed);
  assert.match(r.reasons.join('\n'), /operations unsettled at finalize: executor#1/);
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.class, 'incomplete'); assert.ok(manifest.incomplete.some(x => /operations unsettled/.test(x)));
});

test('O-3 operations after finalize, over the concurrent cap, or a non-function are refused and sticky', async () => {
  const m = await load();
  const l = quick(m, {opCap: 3});
  for (let i = 0; i < 3; i++) l.op('read', never);
  await assert.rejects(l.op('read', async () => {}), /operation cap 3/);
  await assert.rejects(l.op('x', 'nope'), /function/);
  await l.finalize({fallback: true});
  let ran = false;
  await assert.rejects(l.op('after', async () => { ran = true; }), /operation after finalize: after/);
  assert.equal(ran, false); assert.equal(l.status().sticky, 3);
});

test('O-4 op counts are recorded by label for review; ids are label#n', async () => {
  const m = await load();
  const l = quick(m);
  await l.op('ack read', async () => {}); await l.op('ack read', async () => {}); await l.op('page snapshot', async () => {});
  const r = await l.finalize({fallback: true});
  assert.deepEqual(r.record.op_counts, {'ack read': 2, 'page snapshot': 1});
});

// ---- A: retained and failed resources ----
test('A-1 a retained slot is never released (not by release, not by fallback) and requires containment', async () => {
  const m = await load();
  const l = quick(m); let closes = 0;
  await l.acquire('browser', async () => ({pid: 3}));
  l.retain('browser', 'live sends at teardown');
  await assert.rejects(l.release('browser', async () => { closes++; }), /browser retained: live sends at teardown/);
  const r = await l.finalize({fallback: true});
  assert.equal(closes, 0); assert.equal(r.record.slots.browser.state, 'retained');
  assert.equal(r.record.slots.browser.why, 'live sends at teardown');
  assert.ok(r.reasons.includes('CONTAINMENT_REQUIRED:browser:retained'));
});

test('A-2 release failure and an unsettled release are never reported released; owned-but-unreleased is orphaned', async () => {
  const m = await load();
  const l = quick(m, {settleMs: 50});
  await l.acquire('observer', async () => ({}));
  await assert.rejects(l.release('observer', async () => { throw Error('relay socket error'); }), /relay socket error/);
  await l.acquire('foreground', () => ({}));
  l.release('foreground', never).catch(() => {});
  await l.acquire('browser', async () => ({}));
  const r = await l.finalize({fallback: true});
  assert.deepEqual([r.record.slots.observer.state, r.record.slots.foreground.state, r.record.slots.browser.state], ['release-failed', 'failed-unconfirmed', 'orphaned']);
  for (const x of ['observer:release-failed', 'foreground:failed-unconfirmed', 'browser:orphaned']) assert.ok(r.reasons.includes(`CONTAINMENT_REQUIRED:${x}`), x);
});

test('A-3 a resource acquired after finalize is still closed once, but the sealed record keeps it orphaned and the live status non-clean', async () => {
  const m = await load();
  const l = quick(m, {settleMs: 30}); const {writer} = rawWriter(); l.bindWriter(writer);
  let resolve, closes = 0;
  const acquiring = l.acquire('observer', () => new Promise(r => { resolve = r; }));
  const r = await l.finalize({incomplete: []});
  assert.equal(r.record.slots.observer.state, 'orphaned'); assert.equal(r.clean, false);
  resolve({}); await acquiring;
  await l.release('observer', async () => { closes++; });
  assert.equal(closes, 1); assert.equal(l.slot('observer'), 'released');
  assert.equal(r.record.slots.observer.state, 'orphaned', 'the sealed record is not rewritten');
  assert.equal(l.status().clean, false, 'the unsettled-at-finalize history keeps the live view non-clean');
});

// ---- F: finalize ----
test('F-1 fallback finalize with no writer: nothing sealed, record returned, never clean', async () => {
  const m = await load();
  const l = quick(m);
  const r = await l.finalize({fallback: true, incomplete: ['writer construction failed']});
  assert.deepEqual([r.sealed, r.clean, r.record.fallback], [null, false, true]);
  assert.match(r.reasons.join('\n'), /fallback finalize/);
});

test('F-2 fallback finalize with a bound writer seals incomplete evidence with exactly one diagnostic lifecycle event', async () => {
  const m = await load();
  const l = quick(m); const {dir, writer} = rawWriter(); l.bindWriter(writer);
  const r = await l.finalize({fallback: true, incomplete: ['compose threw']});
  assert.ok(r.sealed); assert.equal(r.clean, false);
  const life = events(dir).filter(e => e.phase === 'lifecycle');
  assert.equal(life.length, 1); assert.equal(life[0].diagnostic, true); assert.equal(life[0].schema, 'tabwise-r2-lifecycle/1');
  assert.equal('class' in life[0] || 'provenance' in life[0], false, 'the lifecycle record claims no class or provenance');
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.class, 'incomplete'); assert.ok(manifest.incomplete.includes('compose threw'));
});

test('F-3 finalize is memoized: concurrent and later calls return the same result and seal once', async () => {
  const m = await load();
  const l = quick(m); const {dir, writer} = rawWriter(); l.bindWriter(writer);
  const [a, b] = await Promise.all([l.finalize({incomplete: ['x']}), l.finalize({fallback: true, incomplete: ['y']})]);
  assert.equal(a, b); assert.equal(await l.finalize({}), a);
  assert.equal(events(dir).filter(e => e.phase === 'lifecycle').length, 1);
  assert.ok(existsSync(join(dir, 'manifest.json')));
});

test('F-4 a writer that already failed is not sealed; the failure is reported and nothing is claimed clean', async () => {
  const m = await load();
  const l = quick(m); const {dir, writer} = rawWriter(); const w = l.bindWriter(writer);
  assert.throws(() => w.append('nope', {}), /unknown lane/);
  const r = await l.finalize({incomplete: []});
  assert.equal(r.sealed, null); assert.equal(r.clean, false); assert.match(r.error, /unknown lane/);
  assert.equal(existsSync(join(dir, 'manifest.json')), false);
});

// ---- S: static boundaries ----
const importsOf = file => [...readFileSync(file, 'utf8').matchAll(/^\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)].map(x => x[1] ?? x[2]);
test('S-1 static: the lifecycle module imports nothing and names no capability; only the session loads it, dynamically, after the brand check', () => {
  const code = readFileSync(LIFECYCLE, 'utf8');
  assert.deepEqual(importsOf(LIFECYCLE), []);
  assert.doesNotMatch(code, /\bimport\s*\(|\brequire\s*\(|process\.|child_process|playwright|guidepup|vendor\/|node:/);
  assert.deepEqual([...code.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/gm)].map(x => x[1]), ['createR2Lifecycle']);
  const session = readFileSync('scripts/tabwise/r2-session.mjs', 'utf8');
  const brand = session.indexOf("if (!isQualificationRuntime(runtime)) throw Error('R2 session requires the owned vendored runtime');");
  const at = session.indexOf("import('./r2-lifecycle.mjs')");
  assert.ok(brand > 0 && at > brand, 'dynamic lifecycle import after the brand check');
  assert.equal(readFileSync('scripts/tabwise/r2-compose.mjs', 'utf8').includes('r2-lifecycle'), false, 'compose receives the lifecycle as a handle, never imports it');
});

test('S-2 static: page mode holds persistent handlers for every cancel signal until the exit line is printed (no once)', () => {
  const code = readFileSync('scripts/tabwise-r2.mjs', 'utf8').replace(/\r\n/g, '\n');
  const start = code.indexOf('async function runPage('), end = code.indexOf('\n}\n', start), body = code.slice(start, end);
  assert.equal(code.includes('process.once'), false);
  assert.match(body, /for \(const name of CANCEL_SIGNALS\) process\.on\(name, onSignal\);/);
  const off = body.indexOf('for (const name of CANCEL_SIGNALS) process.off(name, onSignal);');
  assert.ok(off > body.indexOf('console.log(JSON.stringify(r2PageExit('), 'handlers removed only after the page exit line');
});
