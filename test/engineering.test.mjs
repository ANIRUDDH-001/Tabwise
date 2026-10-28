// D-43 regressions: real gate and vendored transport, with all OS/process boundaries blocked first.
import { fakes, reset, loadVendor, fakeNvdaInstall } from './helpers/sandbox.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { deferred, reached, exactError } from './helpers/reliability.mjs';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { sendGate, pageAck, pageKeyOf, VK } from '../src/speech/sendguard.mjs';
import { foregroundProbe } from '../src/speech/foreground.mjs';

beforeEach(() => reset());
const TAB = { path: 'nvda', keys: [{ vk: VK.Tab, scan: 15, ext: false }] };
const tick = () => new Promise((r) => setImmediate(r));
const reader = (after = async () => ({ ack: true, reasons: [] }), before = async () => []) => Object.assign(after, { before });
function gateAt(now = () => performance.now()) {
  const gate = sendGate({ now, settleMs: 0, maxAgeMs: 100, ackMs: 20 });
  gate.setIntegrity(() => []);
  gate.setCheck(async () => []);
  gate.setAck(reader());
  gate.arm('Tab');
  return gate;
}
async function dispatch(gate, info, sent = []) {
  const t = await gate.admit(info);
  if (!gate.commit(t)) throw new Error('commit refused');
  sent.push(info);
  await gate.release(t);
}

test('D43 freshness: a delayed page pre-read cannot release input from an earlier passing foreground verdict', async () => {
  let clock = 0, away = false;
  const entered = deferred(), finish = deferred();
  const gate = gateAt(() => clock);
  gate.setCheck(async () => away ? ['foreground changed'] : []);
  gate.setAck(reader(undefined, () => { entered.resolve(); return finish.promise; }));
  const sent = [];
  const result = dispatch(gate, TAB, sent).then(() => null, (e) => e);
  await reached(entered.promise, result, 'page pre-read');
  clock = 350;
  away = true;
  finish.resolve([]);
  const error = await result;
  assert.equal(error?.constructor, Error);
  assert.match(error.message, /^R1_REFUSED: before send 1 .*foreground changed/);
  assert.equal(gate.status().kind, 'pre');
  assert.deepEqual(sent, []);
});

test('D43 freshness: the full foreground request/reply and evidence delay count against 100 ms', async () => {
  let clock = 0;
  const gate = gateAt(() => clock);
  gate.setCheck(async () => { clock += 101; return []; });
  const sent = [];
  await assert.rejects(dispatch(gate, TAB, sent), /old|stale|commit|fresh/i);
  assert.deepEqual(sent, []);
});

test('D43 verification: a missing pre-send capability refuses before any physical send', async () => {
  const gate = gateAt();
  gate.setAck(async () => ({ ack: true, reasons: [] }));
  const sent = [];
  await assert.rejects(dispatch(gate, TAB, sent), /before|pre-send|capabilit/i);
  assert.deepEqual(sent, []);
});

test('D43 verification: null cannot confirm a page-reaching key and success cannot carry failure reasons', async () => {
  for (const value of [{ ack: null, reasons: [] }, { ack: true, reasons: ['unexpected X'] }, { ack: true }, { ack: true, reasons: 'not an array' }]) {
    const gate = gateAt();
    gate.setAck(reader(async () => value));
    await dispatch(gate, TAB);
    assert.equal(gate.status().misdelivered, true, JSON.stringify(value));
    assert.equal(gate.status().acks.confirmed, 0);
    assert.equal(gate.status().acks.missing, 1);
  }
});

test('D43 verification: replacing or removing a capability after admission refuses commit', async () => {
  for (const change of [(r) => { delete r.before; }, (r) => { r.before = async () => []; }]) {
    const gate = gateAt();
    const ack = reader();
    gate.setAck(ack);
    const t = await gate.admit(TAB);
    change(ack);
    assert.equal(gate.commit(t), false);
    assert.equal(gate.status().sends, 0);
  }
});

test('D43 acknowledgement: a late page-read result cannot extend the exact acknowledgement deadline', async (t) => {
  let sent = false, clock = 0;
  t.mock.method(performance, 'now', () => clock);
  const ack = pageAck({ ackMs: 10, read: async () => {
    if (!sent) return [];
    clock += 30;
    return [{ seq: 1, key: 'Tab', shift: false }];
  } });
  const token = { id: 1, info: TAB };
  assert.deepEqual(await ack.before(token), []);
  sent = true;
  const result = await ack(token);
  assert.equal(result.ack, false, 'a late read must fail even when its eventual key matches');
  assert.match(result.reasons[0], /^page acknowledgement read exceeded 10 ms/);
});

test('D43 verification: the dispatch gate methods cannot be replaced at runtime', () => {
  const gate = gateAt();
  assert.equal(Object.isFrozen(gate), true);
  assert.throws(() => { gate.commit = () => true; }, TypeError);
});

class Socket extends EventEmitter {
  destroyed = false;
  setEncoding() {}
  write(msg, cb) {
    if (msg.includes('"type":"join"')) setImmediate(() => this.emit('data', '{"type":"channel_joined"}\n'));
    if (cb) setImmediate(() => cb(null));
    return true;
  }
  destroy() { this.destroyed = true; }
}
async function connected() {
  const v = loadVendor();
  fakeNvdaInstall();
  const gate = gateAt();
  gate.setAck(reader(async (t) => ({ ack: pageKeyOf(t.info) === null ? null : true, reasons: [] })));
  v.r1Gate.setGate(gate);
  const socket = new Socket();
  fakes['tls.connect'] = (...args) => { setImmediate(args.at(-1)); return socket; };
  const client = new v.NVDAClient();
  await client.connect({ capture: false });
  return { v, gate, socket, client };
}

test('D43 protocol: coalesced speech and cancel frames preserve exact ordering', async () => {
  const { socket, client } = await connected();
  const seen = [];
  client.on('speak', (s) => seen.push(s));
  client.on('cancel', () => seen.push('<cancel>'));
  socket.emit('data', '{"type":"speak","sequence":["alpha"]}\n{"type":"cancel"}\n{"type":"speak","sequence":["beta"]}\n');
  assert.deepEqual(seen, ['alpha', '<cancel>', 'beta']);
});

test('D43 protocol: fragmented speech frames are retained until the newline', async () => {
  const { socket, client } = await connected();
  const seen = [];
  client.on('speak', (s) => seen.push(s));
  socket.emit('data', '{"type":"spe');
  socket.emit('data', 'ak","sequence":["alpha"]}');
  assert.deepEqual(seen, []);
  socket.emit('data', '\n');
  assert.deepEqual(seen, ['alpha']);
});

test('D43 protocol: malformed and truncated input stops the gate instead of silently dropping evidence', async () => {
  for (const fault of ['malformed', 'truncated']) {
    const { socket, gate } = await connected();
    socket.emit('data', fault === 'malformed' ? 'not json\n' : '{"type":"speak"');
    if (fault === 'truncated') socket.emit('end');
    assert.equal(gate.isStopped(), true, fault);
  }
});

test('D43 protocol: error or close after the final speech immediately invalidates the run without a next key', async () => {
  for (const event of ['error', 'close']) {
    const { socket, gate, client } = await connected();
    socket.emit('data', '{"type":"speak","sequence":["expected final phrase"]}\n');
    socket.emit(event, ...(event === 'error' ? [new Error('connection reset')] : []));
    assert.equal(gate.isStopped(), true, event);
    assert.equal(gate.status().kind, 'send');
    await client.stop();
  }
});

test('D43 lifecycle: a nonzero quit status is an error, not a successful reset', async () => {
  const v = loadVendor();
  fakeNvdaInstall();
  fakes['child_process.spawnSync'] = () => ({ status: 1, error: null });
  fakes['net.connect'] = () => { const s = new EventEmitter(); s.destroy = () => {}; s.end = (cb) => cb?.(); setImmediate(() => s.emit('connect')); return s; };
  fakes['child_process.spawn'] = () => {
    const child = new EventEmitter();
    child.pid = 321;
    child.kill = () => true;
    setImmediate(() => child.emit('close', 1, null));
    return child;
  };
  await assert.rejects(v.lib('windows/NVDA/quit.js').quit({ timeoutMs: 5000, resetMs: 0, probeMs: 5000, pollMs: 1 }), exactError('NVDA cannot be quit', 'NVDA quit exit 1'));
});

function port(running) {
  const s = new EventEmitter(); s.destroy = () => {}; s.end = (cb) => cb?.();
  setImmediate(() => { if (running) s.emit('connect'); else s.emit('error', Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })); });
  return s;
}
test('D43 lifecycle: reset requires listener disappearance after a successful quit process', async () => {
  const v = loadVendor(); fakeNvdaInstall();
  fakes['net.connect'] = () => port(true);
  fakes['child_process.spawn'] = () => { const c = new EventEmitter(); c.pid = 321; c.kill = () => true; setImmediate(() => c.emit('close', 0, null)); return c; };
  fakes['child_process.spawnSync'] = () => ({ status: 0 });
  await assert.rejects(v.lib('windows/NVDA/quit.js').quit({ timeoutMs: 5000, resetMs: 0, probeMs: 5000, pollMs: 1 }), exactError('NVDA cannot be quit', 'NVDA listener still running after quit; reset not established'));
});

test('D51 reset polling: a successful quit waits through present listeners until absence is observed', async () => {
  const v = loadVendor(); fakeNvdaInstall();
  const events = [];
  let probes = 0, launches = 0, kills = 0;
  fakes['net.connect'] = () => {
    const n = ++probes, running = n < 4;
    const socket = port(running);
    socket.once(running ? 'connect' : 'error', () => events.push(`probe ${n}: ${running ? 'present' : 'absent'}`));
    return socket;
  };
  fakes['child_process.spawn'] = (exe, args, options) => {
    launches++;
    assert.deepEqual(args, ['--quit']);
    assert.equal(options.windowsHide, true);
    events.push('quit spawned');
    const child = new EventEmitter(); child.pid = 321;
    child.kill = () => { kills++; return true; };
    setImmediate(() => { events.push('quit closed 0'); child.emit('close', 0, null); });
    return child;
  };
  const result = await v.lib('windows/NVDA/quit.js').quit({ timeoutMs: 5000, resetMs: 5000, probeMs: 5000, pollMs: 1 });
  assert.deepEqual(result, { listener_stopped: true });
  assert.equal(launches, 1);
  assert.equal(probes, 4, 'initial listener plus two still-present polls and the final absent poll');
  assert.equal(kills, 0, 'successful quit needs no kill fallback');
  assert.deepEqual(events, ['probe 1: present', 'quit spawned', 'quit closed 0', 'probe 2: present', 'probe 3: present', 'probe 4: absent']);
});
test('D43 lifecycle: startup returns an owned live PID and refuses an existing listener', async () => {
  const v = loadVendor(); fakeNvdaInstall();
  const gate = gateAt(); v.r1Gate.setGate(gate);
  let checks = 0, launches = 0;
  fakes['net.connect'] = () => port(++checks > 1);
  fakes['child_process.spawn'] = () => { launches++; const c = new EventEmitter(); c.pid = 777; c.exitCode = null; c.kill = () => true; return c; };
  // D-50: readiness comes on the second probe; the window is not under test here (was 100 ms of wall clock,
  // which a 120 ms event-loop stall used up: "NVDA readiness timed out").
  const info = await v.lib('windows/NVDA/start.js').start({ timeoutMs: 5_000, pollMs: 1, probeMs: 5_000 });
  assert.equal(info?.pid, 777);
  assert.equal(info.isAlive(), true);
  fakes['net.connect'] = () => port(true);
  await assert.rejects(v.lib('windows/NVDA/start.js').start({ timeoutMs: 5_000, pollMs: 1, probeMs: 5_000 }), /already|listener|reset/i);
  assert.equal(launches, 1);
});

test('D43 lifecycle: port absence cannot hide an owned process that remains alive', async () => {
  const v = loadVendor(); fakeNvdaInstall();
  fakes['net.connect'] = () => port(false);
  let launched = 0;
  fakes['child_process.spawn'] = () => { launched++; const c = new EventEmitter(); c.pid = 321; c.kill = () => true; setImmediate(() => c.emit('close', 0, null)); return c; };
  const owned = { isAlive: () => true, process: { kill() {} } };
  await assert.rejects(v.lib('windows/NVDA/quit.js').quit({ owned, timeoutMs: 5000, resetMs: 0, probeMs: 5000, pollMs: 1 }), exactError('NVDA cannot be quit', 'NVDA listener still running after quit; reset not established'));
  assert.equal(launched, 1, 'quit must actually launch before rejecting the still-live owner');
  // Positive counterpart: port absent AND owner exited establishes reset; errors cannot stand in for it.
  await assert.doesNotReject(v.lib('windows/NVDA/quit.js').quit({ owned: { isAlive: () => false }, probeMs: 5000 }));
  assert.equal(launched, 1, 'an already stopped owner needs no second quit process');
});
test('D43 lifecycle: the read-only relay owner query rejects ambiguous or malformed PID data', async () => {
  const v = loadVendor();
  for (const output of ['777\n', '777\n778\n', 'not a pid\n']) {
    fakes['child_process.spawn'] = () => { const c = helper(); c.pid = 555; setImmediate(() => { c.stdout.write(output); c.emit('close', 0, null); }); return c; };
    if (output === '777\n') assert.equal(await v.lib('windows/NVDA/start.js').relayOwnerPid(), 777);
    else await assert.rejects(v.lib('windows/NVDA/start.js').relayOwnerPid(), { name: 'Error', message: 'NVDA owner query failed or returned an ambiguous PID' });
  }
});

function helper() {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => true;
  return child;
}
test('D43 foreground: replies are correlated and retain the conservative request-start time', async () => {
  let clock = 10, request;
  const child = helper();
  child.stdin.on('data', (data) => { request = JSON.parse(String(data)); });
  const probe = foregroundProbe({ spawn: () => child, now: () => clock, timeoutMs: 100 });
  const result = probe.check();
  assert.ok(request?.id);
  clock = 70;
  child.stdout.write(JSON.stringify({ request_id: request.id, pid: 123, title: 'fixture' }) + '\n');
  const got = await result;
  assert.equal(got.pid, 123);
  assert.equal(got.request_started_ms, 10);
  assert.equal(got.received_ms, 70);
  probe.close();
});
test('D43 foreground: a wrong or unsolicited reply poisons the helper instead of satisfying the next check', async () => {
  const child = helper();
  const probe = foregroundProbe({ spawn: () => child, timeoutMs: 100 });
  const result = probe.check();
  child.stdout.write('{"request_id":999,"pid":123,"title":"old"}\n');
  assert.equal((await result).pid, null);
  assert.equal((await probe.check()).pid, null);
  probe.close();
});

test('D43 actual NVDA startup: foreign relay PID or stop during ownership never establishes a fresh process', async () => {
  for (const mode of ['foreign', 'stopped', 'healthy']) {
    const v = loadVendor(); fakeNvdaInstall();
    const gate = gateAt(); v.r1Gate.setGate(gate);
    let alive = true;
    const child = new EventEmitter(); child.pid = 777;
    const owned = { pid: 777, process: child, isAlive: () => alive };
    v.lib('windows/isWindows.js').isWindows = () => true;
    const lifecycle = v.lib('windows/NVDA/start.js');
    lifecycle.start = async () => owned;
    lifecycle.relayOwnerPid = async () => { if (mode === 'stopped') gate.stop('signal'); return mode === 'foreign' ? 888 : 777; };
    v.lib('windows/NVDA/quit.js').quit = async () => { if (!alive) return { listener_stopped: true }; return { listener_stopped: true }; };
    const socket = new Socket();
    fakes['tls.connect'] = (...args) => { setImmediate(args.at(-1)); return socket; };
    const nvda = new (v.nvdaModule().NVDA)();
    if (mode === 'healthy') {
      assert.deepEqual(await nvda.start(), { pid: 777, relay_pid: 777, reset_confirmed: true });
      alive = false; child.emit('exit', 0, null);
      assert.equal(gate.isStopped(), true, 'owned process death stops input');
      await nvda.stop();
    } else await assert.rejects(nvda.start(), (e) => /ownership/.test(e.cause?.message ?? e.message));
  }
});
