// R2-L2 R-1/R-2: coordinator-held process custody. Offline only: an in-memory process table stands in for the OS, and a
// fake spawn stands in for powershell.exe. No test creates, inspects or terminates a real process. Linux results here do
// not qualify Windows behaviour (handle pinning, CIM creation times, libuv job closure); see the R-1/R-2 handoff.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createPageCustody, parseProcessSnapshot, processBaseline, quiescenceOf, wallMicros, windowsProcessTools, PROCESS_SNAPSHOT_PS, PROCESS_TERMINATE_PS,
  SNAPSHOT_SCHEMA, SPAWN_CLOCK_TOLERANCE_US } from '../scripts/tabwise/r2-proctree.mjs';
import { runR2Pages, r2RunSealable, EXIT } from '../scripts/tabwise/r2-run.mjs';
import { R2_FILES } from '../scripts/tabwise/r2-policy.mjs';

const T0 = 13_400_000_000_000_000n; // microseconds since 1601 (2025)
const us = (offset) => (T0 + BigInt(offset)).toString();
const p = (pid, ppid, name, at) => ({ pid, ppid, name, created: at === null ? null : us(at) });

// In-memory OS: snapshot() copies the table; terminate() removes exact identities unless a pid is marked stubborn.
function fakeOs(rows, { stubborn = [], lie = false, failSnapshots = 0, failTerminate = false, onTerminate = null } = {}) {
  const os = { table: rows.map((r) => ({ ...r })), snapshots: 0, terminateCalls: [], listeners: [] };
  os.tools = {
    snapshot: async () => {
      os.snapshots++;
      if (os.snapshots <= failSnapshots) throw Error('helper timed out');
      return Object.freeze({ now: us(1e9), processes: Object.freeze(os.table.map((r) => Object.freeze({ ...r }))), nvda_listeners: Object.freeze([...os.listeners]) });
    },
    terminate: async (targets) => {
      os.terminateCalls.push(targets.map((t) => ({ ...t })));
      if (failTerminate) throw Error('process helper exit 1');
      const out = targets.map((t) => {
        const row = os.table.find((r) => r.pid === t.pid);
        if (!row) return { ...t, result: 'gone' };
        if (row.created !== t.created) return { ...t, result: 'mismatch' };
        if (stubborn.includes(t.pid)) return { ...t, result: lie ? 'terminated' : 'error' };
        os.table = os.table.filter((r) => r !== row);
        return { ...t, result: 'terminated' };
      });
      onTerminate?.(os, targets);
      return out;
    },
  };
  return os;
}
const SYSTEM = [p(4, 0, 'System', 0), p(600, 4, 'services.exe', 1), p(900, 600, 'svchost.exe', 2), p(50, 40, 'node.exe', 5)]; // 50 = coordinator

// ---- snapshot parsing ----
const rawSnap = (over = {}) => JSON.stringify({ schema: SNAPSHOT_SCHEMA, now: '134000000000000005', processes: [{ pid: 4, ppid: 0, name: 'System', created: '133999999999999999' },
  { pid: 0, ppid: 0, name: 'System Idle Process', created: null }], nvda_listeners: [], ...over });

test('PT-P1 snapshot parser truncates FILETIME to microseconds and freezes rows', () => {
  const s = parseProcessSnapshot(rawSnap());
  assert.equal(s.now, '13400000000000000');
  assert.deepEqual(s.processes[0], { pid: 4, ppid: 0, name: 'System', created: '13399999999999999' });
  assert.equal(s.processes[1].created, null);
  assert.ok(Object.isFrozen(s) && Object.isFrozen(s.processes[0]));
});

test('PT-P2 snapshot parser refuses malformed, duplicate, extra-field and out-of-range rows', () => {
  const row = { pid: 8, ppid: 4, name: 'a.exe', created: '1' };
  const bad = ['', 'x', '[]', rawSnap({ schema: 'other' }), rawSnap({ extra: 1 }), rawSnap({ now: 5 }), rawSnap({ processes: [] }), rawSnap({ processes: [row, row] }),
    rawSnap({ processes: [{ ...row, created: 1 }] }), rawSnap({ processes: [{ ...row, created: '01' }] }), rawSnap({ processes: [{ ...row, pid: -1 }] }),
    rawSnap({ processes: [{ ...row, pid: 2 ** 33 }] }), rawSnap({ processes: [{ ...row, extra: 1 }] }), rawSnap({ processes: [{ ...row, name: 'x'.repeat(261) }] }),
    rawSnap({ nvda_listeners: ['6837'] }), rawSnap({ nvda_listeners: null })];
  for (const text of bad) assert.throws(() => parseProcessSnapshot(text), /process snapshot/, text.slice(0, 80));
});

// ---- tree attribution ----
test('PT-T1 descendants are attributed by ppid and creation order; unrelated and pid-reuse impostors are not', async () => {
  const os = fakeOs([...SYSTEM,
    p(100, 50, 'node.exe', 100), // page child (root)
    p(200, 100, 'chrome.exe', 200), p(201, 200, 'chrome.exe', 210), p(300, 100, 'nvda.exe', 300), p(301, 300, 'nvda_slave.exe', 310),
    p(400, 100, 'stale.exe', 50), // ppid 100 but created before the root: an orphan of an earlier holder of pid 100
    p(500, 900, 'unrelated.exe', 220)]);
  const c = createPageCustody({ tools: os.tools, pid: 100, spawnedAfter: us(99), protect: [50, 40] });
  await c.sample();
  os.table = os.table.filter((r) => ![100, 200, 201, 300, 301].includes(r.pid)); // everything of ours already gone
  const ev = await c.reap();
  assert.deepEqual(ev.observed.map((o) => o.pid).sort((a, b) => a - b), [100, 200, 201, 300, 301]);
  assert.deepEqual([ev.confirmed, ev.quiescent, ev.residue.length, os.terminateCalls.length], [true, true, 0, 0]);
  assert.deepEqual(ev.root, { pid: 100, created: us(100), exact: true });
});

test('PT-T2 a live newer holder of a dead parent pid blocks attribution through that pid', async () => {
  const os = fakeOs([...SYSTEM, p(100, 50, 'node.exe', 100), p(200, 100, 'chrome.exe', 200)]);
  const c = createPageCustody({ tools: os.tools, pid: 100, spawnedAfter: us(99), protect: [50] });
  await c.sample();
  // 200 dies; pid 200 is reused by an unrelated process that then spawns 700. 700 must not be attributed to our 200.
  os.table = [...SYSTEM, p(200, 900, 'other.exe', 500), p(700, 200, 'child-of-other.exe', 600)];
  const ev = await c.reap();
  assert.deepEqual([ev.confirmed, ev.residue.length, os.terminateCalls.length], [true, 0, 0]);
  assert.ok(os.table.some((r) => r.pid === 700) && os.table.some((r) => r.pid === 200), 'unrelated processes untouched');
});

test('PT-T3 an orphan whose parent died after being sampled stays attributed and is reaped', async () => {
  const os = fakeOs([...SYSTEM, p(100, 50, 'node.exe', 100), p(200, 100, 'chrome.exe', 200), p(201, 200, 'chrome-renderer.exe', 210)]);
  const c = createPageCustody({ tools: os.tools, pid: 100, spawnedAfter: us(99), protect: [50] });
  await c.sample();
  os.table = os.table.filter((r) => r.pid !== 100 && r.pid !== 200); // root and 200 gone; 201 orphaned
  const ev = await c.reap();
  assert.deepEqual(ev.residue.map((r) => r.pid), [201]);
  assert.deepEqual(os.terminateCalls, [[{ pid: 201, created: us(210) }]]);
  assert.deepEqual([ev.confirmed, ev.quiescent], [true, true]);
});

test('PT-T4 an unobserved root is bounded by the spawn clock; children created before the bound are refused', async () => {
  const before = Number(SPAWN_CLOCK_TOLERANCE_US) + 10;
  const os = fakeOs([...SYSTEM, p(200, 100, 'chrome.exe', 2_000_000), p(201, 100, 'old-orphan.exe', 2_000_000 - before)]);
  const c = createPageCustody({ tools: os.tools, pid: 100, spawnedAfter: us(2_000_000), protect: [50] });
  const ev = await c.reap();
  assert.deepEqual(ev.root, { pid: 100, created: null, exact: false });
  assert.deepEqual(os.terminateCalls.flat().map((t) => t.pid), [200]);
  assert.ok(os.table.some((r) => r.pid === 201), 'process older than the spawn bound untouched');
});

test('PT-T5 protected pids (coordinator, its parent, System) are never targeted even with a matching ppid link', async () => {
  // The coordinator (50) appears as a child of the root (a forged or reused link); its parent (40) likewise.
  const os = fakeOs([...SYSTEM.filter((r) => r.pid !== 50), p(100, 50, 'node.exe', 100), p(50, 100, 'node.exe', 150), p(40, 100, 'runner.exe', 160)]);
  const c = createPageCustody({ tools: os.tools, pid: 100, spawnedAfter: us(99), protect: [50, 40] });
  const ev = await c.reap();
  assert.deepEqual(os.terminateCalls.flat().map((t) => t.pid), [100]);
  assert.ok(os.table.some((r) => r.pid === 50) && os.table.some((r) => r.pid === 40) && ev.confirmed);
  assert.throws(() => createPageCustody({ tools: os.tools, pid: 4, spawnedAfter: us(0) }), /invalid child pid/);
  assert.throws(() => createPageCustody({ tools: os.tools, pid: 100, spawnedAfter: 'now' }), /spawnedAfter/);
  assert.throws(() => createPageCustody({ tools: {}, pid: 100, spawnedAfter: us(0) }), /snapshot and terminate/);
});

test('PT-T6 after the observed exit, a process that reused the root pid is never adopted or terminated, nor are its children', async () => {
  let now = 0;
  const clock = () => Number((T0 + BigInt(now) - 11_644_473_600_000_000n) / 1000n);
  const os = fakeOs([...SYSTEM]);
  const c = createPageCustody({ tools: os.tools, pid: 100, spawnedAfter: us(0), protect: [50], wallClock: clock });
  now = 5_000_000; c.exited(); // the root exited before any sample observed it
  os.table.push(p(100, 900, 'reused.exe', 6_000_000), p(101, 100, 'reused-child.exe', 6_100_000));
  const ev = await c.reap();
  assert.deepEqual([ev.root.exact, os.terminateCalls.length, ev.confirmed], [false, 0, true]);
  assert.ok(os.table.some((r) => r.pid === 100) && os.table.some((r) => r.pid === 101), 'unrelated pid holder and its child untouched');
  // With the reuser itself gone: a ppid-100 process created after the exit is not ours; one created before it is.
  const gone = fakeOs([...SYSTEM, p(102, 100, 'orphan-of-reuser.exe', 6_200_000), p(103, 100, 'ours.exe', 4_000_000)]);
  const e = createPageCustody({ tools: gone.tools, pid: 100, spawnedAfter: us(0), protect: [50], wallClock: clock });
  e.exited();
  await e.reap();
  assert.deepEqual(gone.terminateCalls.flat().map((t) => t.pid), [103]);
  // Before the exit is observed, the same snapshot adopts the root (the coordinator's handle prevents pid reuse).
  const before = fakeOs([...SYSTEM, p(100, 50, 'node.exe', 10)]);
  const d = createPageCustody({ tools: before.tools, pid: 100, spawnedAfter: us(0), protect: [50], wallClock: clock });
  await d.sample(); d.exited();
  assert.equal((await d.reap()).root.exact, true);
});

test('PT-C8 coordinator: a pid reused after the child exited (never sampled) is left alone', async () => {
  const os = fakeOs(SYSTEM);
  const launch = () => stubChild(100, { run: (c) => { c.emit('exit', 2, null); os.table.push(p(100, 900, 'reused.exe', 9e15)); c.emit('close', 2, null); } });
  // The launch-time sample runs before the child exists in the table; every later snapshot is post-exit.
  const r = await runR2Pages({ pages: ['a'], launch, processes: os.tools, wallClock: clockAt(0), ...LIMITS, sampleMs: 3_600_000 });
  assert.deepEqual([r.pages[0].exit_code, r.pages[0].outcome, os.terminateCalls.length], [2, 'failed', 0]);
  assert.ok(os.table.some((x) => x.pid === 100));
  // A periodic sample between 'exit' and 'close' (stdio still draining) must not adopt the reused pid either.
  const late = fakeOs(SYSTEM);
  const slow = () => stubChild(100, { run: (c) => { c.emit('exit', 2, null); late.table.push(p(100, 900, 'reused.exe', 9e15)); setTimeout(() => c.emit('close', 2, null), 60); } });
  const r2 = await runR2Pages({ pages: ['a'], launch: slow, processes: late.tools, wallClock: clockAt(0), ...LIMITS, sampleMs: 10 });
  assert.deepEqual([r2.pages[0].exit_code, late.terminateCalls.length, r2.pages[0].custody.root.exact], [2, 0, false]);
  assert.ok(r2.pages[0].custody.samples >= 2, 'samples ran between exit and close');
});

// ---- reap: termination failure, unconfirmed termination, repeated cleanup ----
test('PT-R1 parents are terminated before children; a later OS snapshot confirms', async () => {
  const os = fakeOs([...SYSTEM, p(100, 50, 'node.exe', 100), p(201, 200, 'r.exe', 210), p(200, 100, 'chrome.exe', 200)]);
  const ev = await createPageCustody({ tools: os.tools, pid: 100, spawnedAfter: us(99), protect: [50] }).reap();
  assert.deepEqual(os.terminateCalls[0].map((t) => t.pid), [100, 200, 201]);
  assert.deepEqual([ev.confirmed, os.snapshots], [true, 2]);
});

test('PT-R2 termination failure (denied/error) that leaves the process alive is unconfirmed after the round limit', async () => {
  const os = fakeOs([...SYSTEM, p(100, 50, 'node.exe', 100), p(300, 100, 'nvda.exe', 300)], { stubborn: [300] });
  const ev = await createPageCustody({ tools: os.tools, pid: 100, spawnedAfter: us(99), protect: [50], rounds: 3 }).reap();
  assert.deepEqual([ev.confirmed, ev.quiescent], [false, false]);
  assert.equal(os.terminateCalls.length, 3);
  assert.match(ev.errors.join('\n'), /not confirmed by an OS snapshot after 3 rounds/);
});

test('PT-R3 a self-reported "terminated" is never trusted: only the next snapshot decides', async () => {
  const os = fakeOs([...SYSTEM, p(100, 50, 'node.exe', 100), p(300, 100, 'nvda.exe', 300)], { stubborn: [300], lie: true });
  const ev = await createPageCustody({ tools: os.tools, pid: 100, spawnedAfter: us(99), protect: [50], rounds: 2 }).reap();
  assert.ok(ev.terminations.some((t) => t.pid === 300 && t.result === 'terminated'));
  assert.equal(ev.confirmed, false);
});

test('PT-R4 snapshot or terminate helper failures are unconfirmed, never a pass', async () => {
  let os = fakeOs([...SYSTEM], { failSnapshots: 99 });
  let ev = await createPageCustody({ tools: os.tools, pid: 100, spawnedAfter: us(99), protect: [50] }).reap();
  assert.deepEqual([ev.confirmed, ev.quiescent], [false, false]);
  os = fakeOs([...SYSTEM, p(100, 50, 'node.exe', 100)], { failTerminate: true });
  ev = await createPageCustody({ tools: os.tools, pid: 100, spawnedAfter: us(99), protect: [50] }).reap();
  assert.equal(ev.confirmed, false);
  assert.match(ev.errors[0], /terminate 1: process helper exit 1/);
  os = fakeOs([...SYSTEM, p(100, 50, 'node.exe', 100)], { failSnapshots: 1 }); // a transient failure recovers in a later round
  ev = await createPageCustody({ tools: os.tools, pid: 100, spawnedAfter: us(99), protect: [50] }).reap();
  assert.equal(ev.confirmed, true);
});

test('PT-R5 repeated and concurrent cleanup run the reap once; samples never overlap and stop after reap', async () => {
  const os = fakeOs([...SYSTEM, p(100, 50, 'node.exe', 100)]);
  let inFlight = 0, maxInFlight = 0;
  const snapshot = os.tools.snapshot;
  os.tools.snapshot = async () => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await new Promise((r) => setTimeout(r, 5)); try { return await snapshot(); } finally { inFlight--; } };
  const c = createPageCustody({ tools: os.tools, pid: 100, spawnedAfter: us(99), protect: [50] });
  c.sample(); c.sample();
  const [a, b] = await Promise.all([c.reap(), c.reap()]);
  const again = await c.reap();
  assert.ok(a === b && b === again);
  assert.equal(maxInFlight, 1);
  assert.equal(os.terminateCalls.length, 1);
  const count = os.snapshots;
  await c.sample();
  assert.equal(os.snapshots, count, 'no sampling after reap');
});

test('PT-R6 samples coalesce: one in flight and one queued, shared by later callers, so a slow helper builds no backlog before the reap', async () => {
  const os = fakeOs([...SYSTEM, p(100, 50, 'node.exe', 100)]);
  let starts = 0;
  const snapshot = os.tools.snapshot;
  os.tools.snapshot = async () => { starts++; await new Promise((r) => setTimeout(r, 5)); return snapshot(); };
  const c = createPageCustody({ tools: os.tools, pid: 100, spawnedAfter: us(99), protect: [50] });
  const first = c.sample();
  await new Promise((r) => setImmediate(r)); // the first snapshot is now in flight
  assert.equal(starts, 1);
  const later = Array.from({ length: 10 }, () => c.sample());
  assert.ok(later.every((q) => q === later[0]) && later[0] !== first, 'later callers share the one queued sample');
  await later[0];
  assert.equal(starts, 2, 'the queued sample started after the in-flight one, and only once');
  const ev = await c.reap(); // the live root: one terminate round, then one confirming snapshot
  assert.deepEqual([ev.confirmed, os.terminateCalls.length], [true, 1]);
  assert.equal(starts, 2 + 2, 'the reap waited for two samples, not eleven');
});

// ---- quiescence and baseline ----
test('PT-Q1 any NVDA image or relay listener refuses quiescence; foreign NVDA is reported but never terminated', async () => {
  const os = fakeOs([...SYSTEM, p(100, 50, 'node.exe', 100), p(800, 900, 'nvda.exe', 50)]);
  os.listeners = [800];
  const ev = await createPageCustody({ tools: os.tools, pid: 100, spawnedAfter: us(99), protect: [50] }).reap();
  assert.deepEqual([ev.confirmed, ev.quiescent], [true, false]);
  assert.ok(!os.terminateCalls.flat().some((t) => t.pid === 800), 'foreign NVDA untouched');
  assert.match(ev.errors.join('\n'), /NVDA process running: nvda.exe pid 800/);
  assert.match(ev.errors.join('\n'), /NVDA relay listener on 6837 owned by pid 800/);
  const q = quiescenceOf({ processes: [p(1, 0, 'NVDA_noUIAccess.exe', 1), p(2, 0, 'notnvda.exe', 1)], nvda_listeners: [] });
  assert.deepEqual(q.nvda_processes.map((x) => x.pid), [1]);
});

test('PT-Q2 baseline refuses on NVDA, a listener or a failed snapshot; passes on a quiet system', async () => {
  assert.equal((await processBaseline(fakeOs(SYSTEM).tools)).quiescent, true);
  assert.equal((await processBaseline(fakeOs([...SYSTEM, p(800, 900, 'nvda.exe', 5)]).tools)).quiescent, false);
  const listening = fakeOs(SYSTEM); listening.listeners = [900];
  assert.equal((await processBaseline(listening.tools)).quiescent, false);
  const failed = await processBaseline(fakeOs(SYSTEM, { failSnapshots: 1 }).tools);
  assert.deepEqual([failed.quiescent, failed.errors], [false, ['baseline snapshot: helper timed out']]);
});

// ---- coordinator integration (stub children, no process) ----
function stubChild(pid, script = {}) {
  const child = new EventEmitter();
  child.pid = pid; child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kills = [];
  child.kill = (signal) => { child.kills.push(signal); script.onKill?.(child); return true; };
  setImmediate(() => script.run?.(child));
  return child;
}
const exitLine = (page, over = {}) => JSON.stringify({ schema: 'tabwise-r2-page-exit/1', page, completed: true, nvda: 'stopped', manifest_sha256: 'a'.repeat(64), reasons: [], ...over }) + '\n';
const LIMITS = { timeoutMs: 200, killGraceMs: 80, maxOutputBytes: 4096, sampleMs: 20, censusMs: 50, protect: [50, 40] };
const clockAt = (offset) => () => Number((T0 + BigInt(offset) - 11_644_473_600_000_000n) / 1000n);

test('PT-C1 accepted page with a confirmed empty tree is accepted with custody evidence', async () => {
  const os = fakeOs(SYSTEM);
  const launch = (id) => { os.table.push(p(100, 50, 'node.exe', 100)); return stubChild(100, { run: (c) => setTimeout(() => { os.table = os.table.filter((r) => r.pid !== 100); c.stdout.emit('data', Buffer.from(exitLine(id))); c.emit('close', 0, null); }, 30) }); };
  const r = await runR2Pages({ pages: ['a', 'b'], launch, processes: os.tools, wallClock: clockAt(0), ...LIMITS });
  assert.deepEqual(r.pages.map((x) => [x.id, x.exit_code, x.outcome]), [['a', 0, 'accepted'], ['b', 0, 'accepted']]);
  assert.deepEqual([r.pages[0].custody.confirmed, r.pages[0].custody.quiescent, r.pages[0].custody.root.exact], [true, true, true]);
  assert.equal(os.terminateCalls.length, 0);
});

test('PT-C2 orphaned descendants after a page reports nvda:"stopped" refuse the page (residue) and are reaped', async () => {
  const os = fakeOs(SYSTEM);
  const launch = (id) => {
    os.table.push(p(100, 50, 'node.exe', 100), p(300, 100, 'nvda.exe', 300), p(200, 100, 'chrome.exe', 200));
    return stubChild(100, { run: (c) => setTimeout(() => { os.table = os.table.filter((r) => r.pid !== 100); c.stdout.emit('data', Buffer.from(exitLine(id))); c.emit('close', 0, null); }, 40) });
  };
  const r = await runR2Pages({ pages: ['a', 'b'], launch, processes: os.tools, wallClock: clockAt(0), ...LIMITS });
  assert.deepEqual(r.pages.map((x) => [x.id, x.exit_code, x.outcome]), [['a', EXIT.residue, 'process-residue']]);
  assert.match(r.pages[0].reason, /2 live process\(es\) in the page tree after exit/);
  assert.deepEqual(r.pages[0].custody.residue.map((x) => x.pid).sort(), [200, 300]);
  assert.equal(r.stopped_after, 'a');
  assert.equal(r2RunSealable(r), true, 'confirmed termination: the failed run may be sealed (incomplete)');
  assert.ok(!os.table.some((x) => [200, 300].includes(x.pid)));
});

test('PT-C3 timeout: census before kill, then the orphaned tree is reaped; unconfirmed reap is never sealable', async () => {
  let os = fakeOs(SYSTEM);
  let censusBeforeKill = null;
  let launch = () => {
    os.table.push(p(100, 50, 'node.exe', 100), p(200, 100, 'chrome.exe', 200), p(201, 200, 'renderer.exe', 210));
    return stubChild(100, { onKill: (c) => { censusBeforeKill ??= os.snapshots; os.table = os.table.filter((r) => r.pid !== 100 && r.pid !== 200); setImmediate(() => c.emit('close', null, 'SIGKILL')); } });
  };
  let r = await runR2Pages({ pages: ['a'], launch, processes: os.tools, wallClock: clockAt(0), ...LIMITS });
  assert.deepEqual([r.pages[0].exit_code, r.pages[0].outcome], [EXIT.timeout, 'timeout']);
  assert.ok(censusBeforeKill >= 1, 'a snapshot preceded the kill');
  assert.deepEqual(r.pages[0].custody.residue.map((x) => x.pid), [201]);
  assert.equal(r.pages[0].custody.confirmed, true);
  os = fakeOs(SYSTEM, { stubborn: [201] });
  launch = () => {
    os.table.push(p(100, 50, 'node.exe', 100), p(200, 100, 'chrome.exe', 200), p(201, 200, 'renderer.exe', 210));
    return stubChild(100, { onKill: (c) => { os.table = os.table.filter((x) => x.pid !== 100 && x.pid !== 200); setImmediate(() => c.emit('close', null, 'SIGKILL')); } });
  };
  r = await runR2Pages({ pages: ['a', 'b'], launch, processes: os.tools, wallClock: clockAt(0), ...LIMITS });
  assert.deepEqual([r.pages[0].exit_code, r.pages[0].outcome, r.pages.length], [EXIT.unconfirmed, 'exit-unconfirmed', 1]);
  assert.match(r.pages[0].reason, /process tree termination unconfirmed .*; was timeout/);
  assert.equal(r2RunSealable(r), false);
});

test('PT-C3b the pre-kill census attributes descendants spawned since the last sample, before the kill breaks their links', async () => {
  const os = fakeOs(SYSTEM);
  const launch = () => {
    os.table.push(p(100, 50, 'node.exe', 100));
    setTimeout(() => os.table.push(p(200, 100, 'chrome.exe', 200), p(201, 200, 'renderer.exe', 210)), 20);
    // The kill takes the root and its direct child (job closure); the renderer is orphaned with a dead parent pid.
    return stubChild(100, { onKill: (c) => { os.table = os.table.filter((r) => r.pid !== 100 && r.pid !== 200); setImmediate(() => c.emit('close', null, 'SIGKILL')); } });
  };
  const r = await runR2Pages({ pages: ['a'], launch, processes: os.tools, wallClock: clockAt(0), ...LIMITS, sampleMs: 3_600_000 });
  assert.deepEqual(r.pages[0].custody.residue.map((x) => x.pid), [201]);
  assert.ok(!os.table.some((x) => x.pid === 201), 'orphan reaped');
});

test('PT-C4 crash (signal exit) and failure before startup are reaped and confirmed; the child exit code is kept', async () => {
  let os = fakeOs(SYSTEM);
  let launch = () => { os.table.push(p(100, 50, 'node.exe', 100), p(200, 100, 'chrome.exe', 200)); return stubChild(100, { run: (c) => { os.table = os.table.filter((r) => r.pid !== 100); c.emit('close', null, 'SIGSEGV'); } }); };
  let r = await runR2Pages({ pages: ['a', 'b'], launch, processes: os.tools, wallClock: clockAt(0), ...LIMITS });
  assert.deepEqual([r.pages[0].exit_code, r.pages[0].outcome, r.pages[0].custody.confirmed], [EXIT.signal, 'failed', true]);
  assert.deepEqual(os.terminateCalls.flat().map((t) => t.pid), [200]);
  os = fakeOs(SYSTEM); // gate refusal: exits 2 before any descendant exists
  launch = () => stubChild(100, { run: (c) => c.emit('close', 2, null) });
  r = await runR2Pages({ pages: ['a', 'b'], launch, processes: os.tools, wallClock: clockAt(0), ...LIMITS });
  assert.deepEqual([r.pages[0].exit_code, r.pages[0].outcome, r.pages[0].custody.confirmed, r.pages[0].custody.quiescent], [2, 'failed', true, true]);
  os = fakeOs(SYSTEM); // spawn error: no pid, the system is still checked
  launch = () => stubChild(undefined, { run: (c) => { c.emit('error', Error('spawn EACCES')); c.emit('close', null, null); } });
  r = await runR2Pages({ pages: ['a'], launch, processes: os.tools, wallClock: clockAt(0), ...LIMITS });
  assert.deepEqual([r.pages[0].exit_code, r.pages[0].outcome, r.pages[0].custody.root, r.pages[0].custody.confirmed], [EXIT.spawn, 'spawn-error', null, true]);
});

test('PT-C5 a non-quiescent baseline launches nothing; a failed baseline snapshot launches nothing', async () => {
  for (const os of [fakeOs([...SYSTEM, p(800, 900, 'nvda.exe', 5)]), fakeOs(SYSTEM, { failSnapshots: 1 })]) {
    let launched = 0;
    const r = await runR2Pages({ pages: ['a', 'b'], launch: () => { launched++; return stubChild(100); }, processes: os.tools, ...LIMITS });
    assert.equal(launched, 0);
    assert.deepEqual([r.pages.length, r.pages[0].exit_code, r.pages[0].outcome, r.stopped_after], [1, EXIT.residue, 'not-quiescent', 'a']);
    assert.match(r.pages[0].reason, /^not launched: /);
    assert.equal(r2RunSealable(r), true);
  }
});

test('PT-C6 cancellation kills the running child, reaps its tree and launches nothing more', async () => {
  const os = fakeOs(SYSTEM), cancel = new AbortController();
  let launched = 0;
  const launch = () => {
    launched++;
    os.table.push(p(100, 50, 'node.exe', 100), p(300, 100, 'nvda.exe', 300));
    setTimeout(() => cancel.abort(), 30);
    return stubChild(100, { onKill: (c) => { os.table = os.table.filter((r) => r.pid !== 100); setImmediate(() => c.emit('close', null, 'SIGKILL')); } });
  };
  const r = await runR2Pages({ pages: ['a', 'b'], launch, processes: os.tools, signal: cancel.signal, wallClock: clockAt(0), ...LIMITS, timeoutMs: 5000 });
  assert.equal(launched, 1);
  assert.deepEqual([r.pages[0].exit_code, r.pages[0].outcome, r.stopped_after], [EXIT.cancelled, 'cancelled', 'a']);
  assert.deepEqual(r.pages[0].custody.residue.map((x) => x.pid), [300]);
  assert.ok(!os.table.some((x) => x.pid === 300));
  const pre = new AbortController(); pre.abort();
  const again = await runR2Pages({ pages: ['a'], launch: () => assert.fail('launched after abort'), processes: os.tools, signal: pre.signal, ...LIMITS });
  assert.deepEqual([again.pages[0].exit_code, again.pages[0].outcome], [EXIT.cancelled, 'cancelled']);
  const during = new AbortController(), snapshot = os.tools.snapshot; // cancelled while the baseline snapshot runs
  const late = await runR2Pages({ pages: ['a'], launch: () => assert.fail('launched after abort'), signal: during.signal, ...LIMITS,
    processes: { ...os.tools, snapshot: async () => { during.abort(); return snapshot(); } } });
  assert.deepEqual([late.pages[0].exit_code, late.pages[0].outcome], [EXIT.cancelled, 'cancelled']);
});

test('PT-C7 invalid custody options refuse before any launch', async () => {
  for (const bad of [{ processes: {} }, { processes: { snapshot() {} } }, { signal: {} }, { sampleMs: 0 }, { censusMs: 0 }, { protect: 'x' }, { wallClock: 1 }])
    await assert.rejects(runR2Pages({ pages: ['a'], launch: () => assert.fail('launched'), ...LIMITS, ...bad }), /R2 run/);
});

// ---- PowerShell adapter with a fake spawn ----
function fakeSpawn(reply) {
  const calls = [];
  const spawn = (file, args, options) => {
    const child = new EventEmitter(), call = { file, args, options, stdin: '', killed: 0 };
    calls.push(call);
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.stdin = { end: (data) => { call.stdin = data; }, on() {} };
    child.kill = () => { call.killed++; };
    setImmediate(() => reply(child, call));
    return child;
  };
  return { spawn, calls };
}
const decode = (args) => Buffer.from(args.at(-1), 'base64').toString('utf16le');

test('PT-W1 helper: %SystemRoot% powershell, argument vector, no shell, hidden, constant scripts; data only on stdin', async () => {
  const f = fakeSpawn((c) => { c.stdout.emit('data', Buffer.from(rawSnap())); c.emit('close', 0, null); });
  const tools = windowsProcessTools({ spawn: f.spawn, env: { SystemRoot: 'C:\\Windows' } });
  const snap = await tools.snapshot();
  assert.equal(snap.processes.length, 2);
  const [call] = f.calls;
  assert.equal(call.file, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.deepEqual(call.args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-EncodedCommand']);
  assert.deepEqual([call.options.shell, call.options.windowsHide], [false, true]);
  assert.equal(decode(call.args), PROCESS_SNAPSHOT_PS);
  const g = fakeSpawn((c, call2) => { const t = JSON.parse(call2.stdin); c.stdout.emit('data', Buffer.from(JSON.stringify(t.map((x) => ({ ...x, result: 'terminated' }))))); c.emit('close', 0, null); });
  const kill = windowsProcessTools({ spawn: g.spawn, env: { SYSTEMROOT: 'C:\\Windows\\' } });
  assert.deepEqual(await kill.terminate([{ pid: 100, created: us(100) }]), [{ pid: 100, created: us(100), result: 'terminated' }]);
  assert.equal(decode(g.calls[0].args), PROCESS_TERMINATE_PS);
  assert.deepEqual(JSON.parse(g.calls[0].stdin), [{ pid: 100, created_us: us(100) }]);
});

test('PT-W2 helper refuses: missing SystemRoot, invalid targets, non-zero exit, timeout (helper killed), mismatched rows', async () => {
  for (const env of [{}, { SystemRoot: 'Windows' }, { SystemRoot: 'C:\\Win"dows' }]) assert.throws(() => windowsProcessTools({ spawn: () => {}, env }), /SystemRoot/);
  const ok = windowsProcessTools({ spawn: fakeSpawn(() => {}).spawn, env: { SystemRoot: 'C:\\Windows' } });
  for (const t of [[], [{ pid: 4, created: '1' }], [{ pid: 2 ** 31, created: '1' }], [{ pid: 100, created: 'x' }], 'x']) await assert.rejects(ok.terminate(t), /invalid targets/);
  let f = fakeSpawn((c) => c.emit('close', 1, null));
  await assert.rejects(windowsProcessTools({ spawn: f.spawn, env: { SystemRoot: 'C:\\Windows' } }).snapshot(), /exit 1/);
  f = fakeSpawn(() => {});
  await assert.rejects(windowsProcessTools({ spawn: f.spawn, env: { SystemRoot: 'C:\\Windows' }, timeoutMs: 20 }).snapshot(), /timed out/);
  assert.equal(f.calls[0].killed, 1);
  f = fakeSpawn((c) => { c.stdout.emit('data', Buffer.from(JSON.stringify([{ pid: 999, created_us: us(100), result: 'terminated' }]))); c.emit('close', 0, null); });
  await assert.rejects(windowsProcessTools({ spawn: f.spawn, env: { SystemRoot: 'C:\\Windows' } }).terminate([{ pid: 100, created: us(100) }]), /do not match/);
  f = fakeSpawn((c) => { c.stdout.emit('data', Buffer.from(JSON.stringify({ pid: 100, created_us: us(100), result: 'killed-maybe' }))); c.emit('close', 0, null); });
  await assert.rejects(windowsProcessTools({ spawn: f.spawn, env: { SystemRoot: 'C:\\Windows' } }).terminate([{ pid: 100, created: us(100) }]), /do not match/);
});

// ---- static safety properties ----
test('PT-S1 scripts terminate only by a pinned handle after a creation-time match; no name, tree-wide or interpolated kill', () => {
  for (const script of [PROCESS_SNAPSHOT_PS, PROCESS_TERMINATE_PS]) {
    assert.doesNotMatch(script, /taskkill|Stop-Process|wmic|-Recurse|Invoke-Expression|iex |\$env:|Kill\(\$true\)|Get-Process -Name/i);
  }
  assert.doesNotMatch(PROCESS_SNAPSHOT_PS, /Kill\(/);
  const t = PROCESS_TERMINATE_PS;
  assert.ok(t.indexOf('$null=$p.Handle') < t.indexOf('$p.StartTime') && t.indexOf('$p.StartTime') < t.indexOf('$p.Kill()'), 'handle pinned, identity checked, then kill');
  assert.equal(t.match(/\.Kill\(/g).length, 1);
});

test('PT-S2 the entry wires custody, cancellation and protection into the coordinator; scope and status unchanged', () => {
  const entry = readFileSync('scripts/tabwise-r2.mjs', 'utf8').replace(/\r\n/g, '\n');
  assert.match(entry, /const processes = windowsProcessTools\(\{spawn, env: process\.env\}\);/);
  assert.match(entry, /processes, signal: cancel\.signal, protect: \[process\.pid, process\.ppid\],/);
  assert.ok(entry.indexOf('windowsProcessTools({') < entry.indexOf('mkdirSync(runDir)'), 'tools exist before any run directory or child');
  assert.match(entry, /for \(const name of CANCEL_SIGNALS\) process\.off\(name, onCancel\);\n\s*removeCrash\(\);/);
  const tree = readFileSync('scripts/tabwise/r2-proctree.mjs', 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(tree, /\bimport\s*\(|child_process|node:net|node:http|playwright|qualification-loader|r2-session|r2-compose|worker_threads|^import /m);
  assert.ok(R2_FILES.includes('scripts/tabwise/r2-proctree.mjs'));
  const status = JSON.parse(readFileSync('scripts/tabwise/r2-status.json', 'utf8'));
  assert.deepEqual([status.enabled, status.verdict], [false, 'BLOCK']);
  assert.equal(wallMicros(() => 0), (11_644_473_600_000n * 1000n).toString());
});
