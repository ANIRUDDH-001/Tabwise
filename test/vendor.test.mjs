// D-39 vendored send boundary (vendor/guidepup-0.36.4-r1), run inside the T0 sandbox: no NVDA, no cscript,
// no socket, no desktop input. Fakes stand in at the Node built-ins; the real vendored code runs on top.
import { fakes, count, reset, loadVendor, fakeNvdaInstall, EMPTY, REAL_LOCALAPPDATA, VENDOR, ROOT, CP } from './helpers/sandbox.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import cp from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { sendGate, pageKeyOf } from '../src/speech/sendguard.mjs';
import { walk, treeHash, closure, checkVendor, vendorIntegrity, upstreamLoaded, CHANGED, ADDED, headerFor } from '../src/speech/vendortree.mjs';

const require = createRequire(import.meta.url);
const UPSTREAM = path.join(ROOT, 'node_modules', '@guidepup', 'guidepup');
const keyMsg = (vk, scan, ext, down) => `${JSON.stringify({ scan_code: scan, extended: ext, vk_code: vk, pressed: down, type: 'key' })}\n`;
const TAB_DOWN = keyMsg(9, 15, false, true);
const TAB_UP = keyMsg(9, 15, false, false);
const tick = () => new Promise((r) => setImmediate(r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// D-50: wait for a point the code under test must reach; if the promise under test settles first, fail at
// once with that reason instead of waiting for the test timeout.
const reached = (event, p, what) => Promise.race([event, p.then(
  () => { throw new Error(`settled before ${what}`); },
  (e) => { throw new Error(`rejected before ${what}: ${e?.message ?? e}`); })]);

beforeEach(() => reset());

// The vendored code against our real gate, with a scripted foreground check.
function wire(v, { verdict = () => [], ...opts } = {}) {
  const gate = sendGate({ checkMs: 5000, settleMs: 0, ackMs: 5000, maxAgeMs: 1000, writeMs: 5000, sendMs: 5000, killMs: 2000, ...opts });
  const log = [];
  gate.setCheck(async (ctx) => { log.push(`${ctx.phase}:${ctx.send}`); return verdict(ctx); });
  gate.setAck(Object.assign(async (token) => ({ ack: pageKeyOf(token.info) === null ? null : true, reasons: [] }), { before: async () => [] }));
  gate.setIntegrity(() => []);
  v.r1Gate.setGate(gate);
  return { gate, log };
}

class FakeSocket extends EventEmitter {
  writes = []; ops = []; destroyed = false; hold = false; failWith = null; autoCancel = false; onWrite = null; onEnd = null;
  setEncoding() {}
  write(msg, cb) {
    this.writes.push(msg);
    this.onWrite?.(msg);
    this.ops.push('write');
    if (msg.includes('"type":"join"')) setImmediate(() => this.emit('data', '{"type":"channel_joined"}\n'));
    if (this.autoCancel && msg === keyMsg(162, 29, false, false)) setImmediate(() => this.emit('data', '{"type":"cancel"}\n'));
    if (cb && !this.hold) setImmediate(() => cb(this.failWith));
    return true;
  }
  end() { this.ops.push('end'); this.onEnd?.(); setImmediate(() => this.emit('finish')); }
  destroy() { this.ops.push('destroy'); this.destroyed = true; }
  keyWrites() { return this.writes.filter((m) => m.includes('"type":"key"')); }
}
async function connected(v, { capture = false } = {}) {
  fakeNvdaInstall();
  const sock = new FakeSocket();
  fakes['tls.connect'] = (port, host, opts, onSecure) => { setImmediate(onSecure); return sock; };
  const client = new v.NVDAClient();
  await client.connect({ capture });
  return { client, sock };
}

class FakeChild extends EventEmitter {
  kills = 0; stdin = { end() {} };
  constructor({ exitWith = 0, diesOnKill = true } = {}) {
    super();
    this.diesOnKill = diesOnKill;
    if (exitWith !== null) setImmediate(() => this.emit('exit', exitWith, null));
  }
  kill() { this.kills += 1; if (this.diesOnKill) setImmediate(() => this.emit('exit', null, 'SIGTERM')); return true; }
}

test('T0 sandbox: every child_process function, net and tls connect throw; the real NVDA cache is not used', () => {
  for (const name of CP) assert.throws(() => cp[name]('nvda.exe'), /SANDBOX: child_process\./);
  assert.throws(() => net.connect(6837, '127.0.0.1'), /SANDBOX: net\.connect/);
  assert.throws(() => net.createConnection(6837, '127.0.0.1'), /SANDBOX: net\.createConnection/);
  assert.throws(() => tls.connect(6837, '127.0.0.1'), /SANDBOX: tls\.connect/);
  assert.equal(process.env.LOCALAPPDATA, EMPTY);
  assert.equal(process.env.GUIDEPUP_SCREEN_READERS_PATH, EMPTY);
  assert.notEqual(EMPTY, REAL_LOCALAPPDATA);
  assert.deepEqual(fs.readdirSync(EMPTY), []);
  const v = loadVendor();
  assert.equal(v.lib('windows/NVDA/isNVDAInstalled.js').isNVDAInstalled(), false);
  assert.equal(v.lib('windows/NVDA/getNVDAInstallationPath.js').getNVDAInstallationPath(), null);
  assert.ok(v.lib('resolveCachePath.js').resolveCachePath().startsWith(EMPTY));
});

test('r1Gate: no gate -> no key; one-shot; an incomplete gate is rejected', async () => {
  const v = loadVendor();
  const { client, sock } = await connected(v);
  await assert.rejects(client.sendKeyCode({ keyCode: v.KeyCodes.Tab }), /R1_NO_GATE/);
  await assert.rejects(v.runVbsScript.runSendKeys('A'), /R1_NO_GATE/);
  assert.deepEqual(sock.keyWrites(), []);
  assert.equal(count('child_process.execFile'), 0);
  assert.throws(() => v.r1Gate.setGate({ admit() {}, commit() {} }), /R1_GATE_INVALID/);
  wire(v);
  assert.throws(() => v.r1Gate.setGate(sendGate()), /R1_GATE_ALREADY_SET/);
  assert.ok(Object.isFrozen(v.r1Gate));
});

test('NVDA key: canonical bytes, all downs then ups reversed, pre-check before and post-check after the write callback (T20)', async () => {
  const v = loadVendor();
  const { client, sock } = await connected(v);
  const { gate, log } = wire(v, { writeMs: 500 });
  gate.arm('Shift+Tab');
  await client.sendKeyCode({ keyCode: [v.KeyCodes.Tab], modifiers: [v.Modifiers.Shift] });
  assert.deepEqual(sock.keyWrites(), [keyMsg(160, 42, false, true), TAB_DOWN, TAB_UP, keyMsg(160, 42, false, false)]);
  assert.equal(TAB_DOWN, `${v.KeyCodes.Tab.toString(true)}\n`, 'same bytes as upstream Key.toString');
  // Upstream sends the left-hand codes: Shift 160, Control 162 (KeyCodes.js), not the generic 16 and 17.
  assert.equal(keyMsg(160, 42, false, true), `${v.Modifiers.Shift.toString(true)}\n`);
  assert.equal(keyMsg(162, 29, false, false), `${v.keyCodeCommands.stopSpeech.keyCode.toString(false)}\n`);
  assert.deepEqual(log, ['pre:1', 'post:1']);
  assert.equal(gate.status().sends, 1);
  assert.equal(gate.status().stopped, false);
  // T20 at the socket: callbacks held, so no post-check until they fire. D-50: checked once the key write has
  // happened and again once the write timeout has ended the socket with the callbacks still held (was: after
  // a 20 ms sleep); the send's rejection is handled from the start.
  sock.hold = true;
  const wrote = new Promise((r) => { sock.onWrite = r; });
  const ended = new Promise((r) => { sock.onEnd = r; });
  const p = client.sendKeyCode({ keyCode: v.KeyCodes.Tab });
  p.catch(() => null);
  await reached(wrote, p, 'the key write');
  assert.deepEqual(log, ['pre:1', 'post:1', 'pre:2']);
  await reached(ended, p, 'the write timeout');
  assert.deepEqual(log, ['pre:1', 'post:1', 'pre:2'], 'no post-check while the write callbacks are held');
  await assert.rejects(p, /R1_SEND_FAILED/);
});

test('NVDA key: invalid key fields are refused before the gate, 0 writes; a custom toString cannot change the bytes', async () => {
  const v = loadVendor();
  const { client, sock } = await connected(v);
  const { gate, log } = wire(v);
  gate.arm('Tab');
  for (const bad of [{ keyCode: 256, scanCode: 15, extended: false }, { keyCode: 9.5, scanCode: 15, extended: false },
    { keyCode: 9, scanCode: -1, extended: false }, { keyCode: 9, scanCode: 15, extended: 'no' }, { keyCode: '9', scanCode: 15, extended: false }]) {
    await assert.rejects(client.sendKeyCode({ keyCode: bad }), /R1_BAD_KEY/);
  }
  await assert.rejects(client.sendKeyCode({ keyCode: [], modifiers: [] }), /R1_BAD_KEY/);
  assert.deepEqual(sock.keyWrites(), []);
  assert.deepEqual(log, []);
  const forged = { keyCode: 9, scanCode: 15, extended: false, toString: () => '{"type":"key","vk_code":91}' };
  await client.sendKeyCode({ keyCode: forged });
  assert.deepEqual(sock.keyWrites(), [TAB_DOWN, TAB_UP]);
});

test('T2 socket destroyed before a key -> 0 writes, 0 connects, rejects, gate stopped', async () => {
  const v = loadVendor();
  const { client, sock } = await connected(v);
  const { gate } = wire(v);
  gate.arm('Tab');
  sock.destroyed = true;
  await assert.rejects(client.sendKeyCode({ keyCode: v.KeyCodes.Tab }), /R1_NO_SOCKET/);
  assert.deepEqual(sock.keyWrites(), []);
  assert.equal(count('tls.connect'), 1);
  assert.equal(gate.status().stopped, true);
  assert.equal(gate.status().sends, 0);
});

test('T2 socket error after connect -> client dead: no reconnect, the next key writes nothing', async () => {
  const v = loadVendor();
  const { client, sock } = await connected(v);
  const { gate } = wire(v);
  sock.emit('error', new Error('ECONNRESET'));
  await sleep(600);
  assert.equal(count('tls.connect'), 1, 'no retry after a successful connect');
  gate.arm('Tab');
  await assert.rejects(client.sendKeyCode({ keyCode: v.KeyCodes.Tab }), /R1_NO_SOCKET/);
  assert.deepEqual(sock.keyWrites(), []);
  assert.equal(gate.status().stopped, true);
});

test('T22 connect retries stop at once when the gate stops; no handshake writes', async () => {
  const v = loadVendor();
  fakeNvdaInstall();
  const sockets = [];
  // D-50: the gate stops once the second connect has failed and its retry is pending (was: a 650 ms sleep
  // against the 500 ms retry interval).
  let retryPending;
  const secondFailed = new Promise((r) => { retryPending = r; });
  fakes['tls.connect'] = () => {
    const s = new FakeSocket();
    sockets.push(s);
    setImmediate(() => { s.emit('error', new Error('ECONNREFUSED')); if (sockets.length === 2) retryPending(); });
    return s;
  };
  const { gate } = wire(v);
  const client = new v.NVDAClient();
  const p = client.connect({ capture: false });
  p.catch(() => null);
  await reached(secondFailed, p, 'the second connect failure');
  assert.equal(count('tls.connect'), 2, 'retries before the first connect while the gate runs');
  gate.stop('test stop');
  await assert.rejects(p, /Cannot connect to NVDA/);
  await sleep(600);
  assert.equal(count('tls.connect'), 2);
  assert.deepEqual(sockets.flatMap((s) => s.writes), []);
});

test('T5 write callback never fires -> end (flush), then destroy; possibly misdelivered; dispatch ended', async () => {
  const v = loadVendor();
  const { client, sock } = await connected(v);
  const { gate } = wire(v, { writeMs: 50, sendMs: 50, killMs: 50 });
  gate.arm('Tab');
  sock.hold = true;
  sock.ops.length = 0;
  await assert.rejects(client.sendKeyCode({ keyCode: v.KeyCodes.Tab }), /R1_SEND_FAILED: write callback/);
  assert.deepEqual(sock.ops, ['write', 'write', 'end', 'destroy']);
  assert.deepEqual(sock.keyWrites(), [TAB_DOWN, TAB_UP], 'the key-up was queued with the key-down');
  assert.equal(gate.status().kind, 'send');
  assert.equal(gate.status().misdelivered, true);
  assert.equal(gate.status().live, 0);
  assert.equal((await gate.quiesce(10)).quiet, true);
});

test('T8 stopSpeech refused or failing -> the action rejects, no unhandled rejection, run stops', async () => {
  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  try {
    const v = loadVendor();
    const { client, sock } = await connected(v, { capture: 'initial' });
    const { gate } = wire(v);
    // Not armed: the stop-speech Control is refused.
    await assert.rejects(client.enqueueAndTap(() => client.sendKeyCode({ keyCode: v.KeyCodes.Tab })), /R1_REFUSED/);
    assert.deepEqual(sock.keyWrites(), []);
    assert.equal(gate.status().stopped, true);
    // Armed, but the Control's write fails.
    const v2 = loadVendor();
    const c2 = await connected(v2, { capture: 'initial' });
    const g2 = wire(v2).gate;
    g2.arm('Tab');
    c2.sock.failWith = new Error('EPIPE');
    await assert.rejects(c2.client.enqueueAndTap(() => c2.client.sendKeyCode({ keyCode: v2.KeyCodes.Tab })), /R1_SEND_FAILED/);
    assert.deepEqual(c2.sock.keyWrites(), [keyMsg(162, 29, false, true), keyMsg(162, 29, false, false)], 'no Tab after the failed Control');
    await sleep(50);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

test('stop-speech is awaited and gated before the action key (capture path)', async () => {
  const v = loadVendor();
  const { client, sock } = await connected(v, { capture: 'initial' });
  const { gate, log } = wire(v);
  sock.autoCancel = true;
  gate.arm('Tab');
  const done = client.enqueueAndTap(async () => {
    await client.sendKeyCode({ keyCode: v.KeyCodes.Tab });
    setImmediate(() => sock.emit('data', JSON.stringify({ type: 'speak', sequence: ['Name', 'edit'] }) + '\n'));
  });
  const r = await done;
  assert.equal(r.spokenPhrase, 'Name, edit');
  assert.deepEqual(sock.keyWrites(), [keyMsg(162, 29, false, true), keyMsg(162, 29, false, false), TAB_DOWN, TAB_UP]);
  assert.deepEqual(log, ['pre:1', 'post:1', 'pre:2', 'post:2']);
});

test('T9 two concurrent chords -> second admit refused, first commit refused, 0 key writes; click is sequential', async () => {
  const v = loadVendor();
  const { client, sock } = await connected(v);
  const { gate } = wire(v);
  gate.arm('click');
  const r = await Promise.allSettled([client.sendKeyCode({ keyCode: v.KeyCodes.Tab }), client.sendKeyCode({ keyCode: v.KeyCodes.Tab })]);
  assert.deepEqual(r.map((x) => x.status), ['rejected', 'rejected']);
  for (const x of r) assert.match(x.reason.message, /^R1_REFUSED:/);
  assert.match(r[1].reason.message, /while send 1 is in flight/);
  assert.match(r[0].reason.message, /stopped|epoch|action ended/);
  assert.deepEqual(sock.keyWrites(), []);
  assert.equal(gate.status().kind, 'protocol');
  const src = fs.readFileSync(path.join(VENDOR, 'lib/windows/NVDA/NVDA.js'), 'utf8');
  const click = src.slice(src.indexOf('    async click(options) {'), src.indexOf('    async lastSpokenPhrase()'));
  assert.doesNotMatch(click, /Promise\.all/);
  assert.match(click, /for \(let i = 0; i < \(options\.clickCount \?\? 1\); i\+\+\) \{\s*await this\.#client\.sendKeyCode\(command\);/);
});

test('T10 after a passing send, the methods and tables cannot be replaced; an instance override cannot reach the socket', async () => {
  const v = loadVendor();
  const nvda = v.nvdaModule();
  const { client, sock } = await connected(v);
  const { gate } = wire(v);
  gate.arm('Tab');
  await client.sendKeyCode({ keyCode: v.KeyCodes.Tab });
  const evil = async () => 'evil';
  assert.throws(() => { v.NVDAClient.prototype.sendKeyCode = evil; }, TypeError);
  assert.throws(() => Object.defineProperty(v.NVDAClient.prototype, 'sendKeyCode', { value: evil }), TypeError);
  assert.throws(() => { v.sendKeys.sendKeys = evil; }, TypeError);
  assert.throws(() => { v.runVbsScript.runSendKeys = evil; }, TypeError);
  assert.throws(() => { v.Key.prototype.toJSON = evil; }, TypeError);
  assert.throws(() => { v.Key.prototype.toString = evil; }, TypeError);
  assert.throws(() => { v.KeyCodes.Tab.keyCode = 91; }, TypeError);
  assert.throws(() => { v.KeyCodes.Tab = v.KeyCodes.KeyA; }, TypeError);
  assert.throws(() => { v.Modifiers.Shift = v.KeyCodes.KeyA; }, TypeError);
  assert.throws(() => { v.keyCodeCommands.stopSpeech = { keyCode: v.KeyCodes.KeyA }; }, TypeError);
  assert.throws(() => { v.keyCodeCommands.stopSpeech.keyCode = v.KeyCodes.KeyA; }, TypeError);
  assert.throws(() => v.keyCodeCommands.reportTitle.keyCode.push(v.KeyCodes.KeyA), TypeError);
  assert.throws(() => { nvda.NVDA = class {}; }, TypeError);
  assert.throws(() => { nvda.NVDA.prototype.press = evil; }, TypeError);
  // An own-property override on an instance only reaches public methods; the socket is private.
  Object.defineProperty(client, 'sendKeyCode', { value: async function () { return [this.socket, this.write, this.send]; } });
  assert.deepEqual(await client.sendKeyCode(), [undefined, undefined, undefined]);
  assert.deepEqual(sock.keyWrites(), [TAB_DOWN, TAB_UP]);
  assert.equal(count('child_process.execFile'), 0);
  assert.deepEqual(vendorIntegrity({ mods: v, nvda, gate, getGate: v.r1Gate.getGate, cache: require.cache }), []);
});

test('T10 integrity reports an unfrozen tree, a foreign gate and an upstream module', async () => {
  const v = loadVendor();
  const { gate } = wire(v);
  const reasons = vendorIntegrity({ mods: v, nvda: null, gate, getGate: v.r1Gate.getGate, cache: require.cache });
  assert.ok(reasons.some((r) => /KeyCodes is not frozen/.test(r)), reasons.join('; '));
  const v2 = loadVendor();
  const nvda = v2.nvdaModule();
  wire(v2);
  const other = vendorIntegrity({ mods: v2, nvda, gate, getGate: v2.r1Gate.getGate, cache: require.cache });
  assert.ok(other.some((r) => /not this run's gate/.test(r)), other.join('; '));
  const fakeCache = { ...require.cache, [path.join(UPSTREAM, 'lib', 'windows', 'Key.js')]: {} };
  assert.ok(vendorIntegrity({ mods: v2, nvda, gate: v2.r1Gate.getGate(), getGate: v2.r1Gate.getGate, cache: fakeCache })
    .some((r) => /upstream Guidepup module loaded/.test(r)));
});

test('T11 an upstream Guidepup lib/ module loaded by require or import() is detected', async () => {
  const before = upstreamLoaded(require.cache, ROOT);
  assert.deepEqual(before, []);
  const viaRequire = path.join(UPSTREAM, 'lib', 'windows', 'Key.js');
  require(viaRequire);
  assert.deepEqual(upstreamLoaded(require.cache, ROOT), [viaRequire]);
  delete require.cache[viaRequire];
  const viaImport = path.join(UPSTREAM, 'lib', 'windows', 'KeyCodes.js');
  await import(pathToFileURL(viaImport).href);
  assert.ok(upstreamLoaded(require.cache, ROOT).includes(viaImport), 'import() of CommonJS lands in require.cache');
  for (const k of upstreamLoaded(require.cache, ROOT)) delete require.cache[k];
});

test('T1 VBS preparation held, the gate stopped, the hold released -> 0 execFile calls, temp removed', async () => {
  const v = loadVendor();
  const { gate } = wire(v);
  gate.arm('type A');
  // D-50: the gate stops once the held write has started (was: a 20 ms sleep, which a slow mkdtemp outran:
  // R1 #2 preflight). The rejection is handled from the start and the hold is always released.
  let release;
  let writing;
  const held = new Promise((r) => { writing = r; });
  const realWrite = fs.promises.writeFile;
  let dir;
  fakes['fs.writeFile'] = (file, data) => { dir = path.dirname(file); writing(); return new Promise((r) => { release = () => r(); }); };
  fakes['child_process.execFile'] = () => new FakeChild();
  const p = v.runVbsScript.runSendKeys('A');
  p.catch(() => null);
  try {
    await reached(held, p, 'the held write');
    gate.stop('action timed out');
  } finally {
    release?.();
  }
  await assert.rejects(p, /R1_REFUSED/);
  assert.equal(count('child_process.execFile'), 0);
  assert.equal(fs.existsSync(dir), false);
  assert.equal(typeof realWrite, 'function');
});

// T21 at the vendored boundary: the admit passes, then the event loop stalls past maxAgeMs before the vendored
// code calls commit. commit returns false, and the vendored code must not send anyway.
function stallingGate(v) {
  let clock = 0;
  const gate = sendGate({ now: () => clock, checkMs: 100, settleMs: 0, ackMs: 100, maxAgeMs: 20, writeMs: 50, sendMs: 50, killMs: 50 });
  gate.setCheck(async () => []);
  gate.setAck(Object.assign(async (token) => ({ ack: pageKeyOf(token.info) === null ? null : true, reasons: [] }), { before: async () => [] }));
  gate.setIntegrity(() => []);
  const stalled = { ...gate, admit: async (info) => {
    const token = await gate.admit(info);
    clock += 40; // deterministically expire freshness between admission and commit
    return token;
  } };
  v.r1Gate.setGate(stalled);
  return gate;
}

test('T21 vendored NVDA key: commit refused after a stall -> rejects, 0 key writes', async () => {
  const v = loadVendor();
  const { client, sock } = await connected(v);
  const gate = stallingGate(v);
  gate.arm('press Tab');
  await assert.rejects(client.sendKeyCode({ keyCode: v.KeyCodes.Tab }), /R1_REFUSED: commit/);
  assert.deepEqual(sock.keyWrites(), []);
  assert.equal(gate.status().kind, 'pre');
});

test('T21 vendored runSendKeys: commit refused after a stall -> rejects, 0 execFile calls', async () => {
  const v = loadVendor();
  const gate = stallingGate(v);
  gate.arm('type A');
  fakes['fs.writeFile'] = async () => {};
  fakes['child_process.execFile'] = () => new FakeChild();
  await assert.rejects(v.runVbsScript.runSendKeys('A'), /R1_REFUSED: commit/);
  assert.equal(count('child_process.execFile'), 0);
  assert.equal(gate.status().kind, 'pre');
});

test('T1 runSendKeys order: the VBS file is written before the admit check, so the check sits right before the launch', async () => {
  const v = loadVendor();
  const order = [];
  const { gate } = wire(v, { verdict: (ctx) => { order.push(`check:${ctx.phase}`); return []; } });
  gate.arm('type A');
  fakes['fs.writeFile'] = async () => { order.push('write'); };
  fakes['child_process.execFile'] = () => { order.push('execFile'); return new FakeChild(); };
  await v.runVbsScript.runSendKeys('A');
  assert.deepEqual(order, ['write', 'check:pre', 'execFile', 'check:post']);
});

test('runSendKeys: one gated cscript per character, hidden window, exact script, temp removed', async () => {
  const v = loadVendor();
  const { gate, log } = wire(v);
  gate.arm('type A');
  const seen = [];
  let script;
  fakes['fs.writeFile'] = async (file, data) => { script = data; };
  fakes['child_process.execFile'] = (file, args, opts) => { seen.push({ file, args, opts }); return new FakeChild(); };
  await v.runVbsScript.runSendKeys('A');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].file, 'cscript');
  assert.equal(seen[0].args.length, 1);
  assert.match(seen[0].args[0], /script\.vbs$/);
  assert.equal(seen[0].opts.windowsHide, true);
  assert.equal(script, 'set WshShell = CreateObject("WScript.Shell")\nWshShell.SendKeys "A"');
  assert.deepEqual(log, ['pre:1', 'post:1']);
  assert.equal(fs.existsSync(path.dirname(seen[0].args[0])), false);
  // sendKeys goes through the same path.
  await v.sendKeys.sendKeys({ characters: '@' });
  assert.equal(seen.length, 2);
  assert.equal(gate.status().sends, 2);
});

test('runSendKeys: a non-zero exit is possibly misdelivered; a gate stop kills the running child', async () => {
  const v = loadVendor();
  const { gate } = wire(v);
  gate.arm('type A');
  fakes['fs.writeFile'] = async () => {};
  fakes['child_process.execFile'] = () => new FakeChild({ exitWith: 1 });
  await assert.rejects(v.runVbsScript.runSendKeys('A'), /R1_SEND_FAILED: cscript exit 1/);
  assert.equal(gate.status().misdelivered, true);
  const v2 = loadVendor();
  const { gate: g2 } = wire(v2, { sendMs: 1000 });
  g2.arm('type d');
  let child;
  // D-50: the gate stops once cscript has been launched (was: a 20 ms sleep, which a slow mkdtemp or a busy
  // event loop outran, so the stop refused the admit instead).
  let launched;
  const running = new Promise((r) => { launched = r; });
  fakes['child_process.execFile'] = () => { child = new FakeChild({ exitWith: null }); launched(); return child; };
  const p = v2.runVbsScript.runSendKeys('d');
  p.catch(() => null);
  await reached(running, p, 'the cscript launch');
  g2.stop('SIGINT received');
  // D-50: the stop itself kills the child, at once (with only the final count, the 1 s send timeout's own
  // kill also passed).
  assert.equal(child.kills, 1, 'the gate stop killed the child');
  await assert.rejects(p, /R1_SEND_FAILED/);
  assert.equal(child.kills, 1);
  assert.equal(g2.status().live, 0);
});

test('T6 cscript never exits -> killed; still live after the kill wait; settles when the child finally exits', async () => {
  const v = loadVendor();
  const { gate } = wire(v, { writeMs: 50, sendMs: 50, killMs: 50 });
  gate.arm('type A');
  let child;
  fakes['fs.writeFile'] = async () => {};
  fakes['child_process.execFile'] = () => { child = new FakeChild({ exitWith: null, diesOnKill: false }); return child; };
  await assert.rejects(v.runVbsScript.runSendKeys('A'), /R1_SEND_FAILED: cscript did not exit/);
  assert.ok(child.kills >= 1);
  assert.equal(gate.status().live, 1);
  assert.equal((await gate.quiesce(30)).quiet, false);
  child.emit('exit', null, 'SIGKILL');
  await tick();
  assert.equal(gate.status().live, 0);
  assert.equal((await gate.quiesce(30)).quiet, true);
});

test('T23 characters outside [A-Za-z0-9@.] and multi-character or modifier sendKeys throw before any work; runVbsScript is disabled', async () => {
  const v = loadVendor();
  const { gate, log } = wire(v);
  gate.arm('type');
  fakes['child_process.execFile'] = () => new FakeChild();
  for (const ch of ['+', '"', '\n', '{', '^', '%', '~', '(', ' ', 'ab', '', 'A\n', 'é']) {
    await assert.rejects(v.runVbsScript.runSendKeys(ch), /R1_CHAR_REFUSED/, JSON.stringify(ch));
  }
  await assert.rejects(v.runVbsScript.runSendKeys(65), /R1_CHAR_REFUSED/);
  await assert.rejects(v.sendKeys.sendKeys({ characters: 'ab' }), (e) => /R1_SENDKEYS_REFUSED/.test(e.cause?.message ?? e.message));
  await assert.rejects(v.sendKeys.sendKeys({ characters: 'a', modifiers: [v.Modifiers.Control] }), (e) => /R1_SENDKEYS_REFUSED/.test(e.cause?.message ?? e.message));
  await assert.rejects(v.sendKeys.sendKeys({ keyCode: v.KeyCodes.Tab }), (e) => /R1_SENDKEYS_REFUSED/.test(e.cause?.message ?? e.message));
  await assert.rejects(v.runVbsScript.runVbsScript('WScript.Echo 1'), /R1_VBS_DISABLED/);
  assert.equal(count('child_process.execFile'), 0);
  assert.equal(count('fs.mkdtemp'), 0);
  assert.deepEqual(log, []);
  assert.equal(gate.status().sends, 0);
});

test('T18 vendored teardown adds no process listeners', () => {
  const events = ['SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGHUP', 'SIGBREAK', 'beforeExit', 'exit'];
  const before = events.map((e) => process.listenerCount(e));
  const v = loadVendor();
  const h = async () => {};
  v.teardown.addTeardownHandler(h);
  v.teardown.removeTeardownHandler(h);
  v.teardown.addTeardownHandler(h);
  v.nvdaModule();
  assert.deepEqual(events.map((e) => process.listenerCount(e)), before);
});

test('T16 vendor tree on disk: unchanged files byte-identical to upstream, changed files match VENDORED.md, closure equals the set', () => {
  assert.deepEqual(checkVendor({ vendor: VENDOR, upstream: UPSTREAM }), []);
  const files = walk(VENDOR);
  for (const f of [...CHANGED, ...ADDED]) assert.ok(files.includes(f), f);
  const reached = closure(VENDOR, 'lib/windows/NVDA/NVDA.js');
  assert.deepEqual([...reached, 'LICENSE', 'VENDORED.md', 'package.json'].sort(), files);
  for (const f of CHANGED) {
    const text = fs.readFileSync(path.join(VENDOR, f), 'utf8');
    assert.equal(text.split('\n')[0], `// ${headerFor(f)}`, f);
  }
  assert.match(treeHash(VENDOR), /^[0-9a-f]{64}$/);
});

test('T16 drift in a copy of the tree is reported: a changed byte, an extra extensionless file, a CR, a stale VENDORED.md hash', () => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'r1-vendor-drift-'));
  // The workflow makes tracked files read-only before npm test; cpSync keeps that attribute, so clear it in the copy.
  const writable = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) writable(p); else fs.chmodSync(p, 0o644); } };
  const fresh = () => { fs.rmSync(copy, { recursive: true, force: true }); fs.cpSync(VENDOR, copy, { recursive: true }); writable(copy); };
  const drift = (fn) => { fresh(); fn(); return checkVendor({ vendor: copy, upstream: UPSTREAM }); };
  try {
    fresh();
    assert.deepEqual(checkVendor({ vendor: copy, upstream: UPSTREAM }), []);
    const flip = (rel, from, to) => { const p = path.join(copy, rel); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(from, to)); };
    assert.ok(drift(() => flip('lib/delay.js', 'setTimeout', 'setImmediate')).some((r) => /lib\/delay\.js/.test(r)));
    assert.ok(drift(() => fs.writeFileSync(path.join(copy, 'lib', 'windows', 'extra'), 'x')).some((r) => /extra/.test(r)));
    assert.ok(drift(() => flip('lib/windows/NVDA/start.js', '\n', '\r\n')).some((r) => /CR/.test(r)));
    assert.ok(drift(() => flip('lib/windows/sendKeys.js', 'R1_SENDKEYS_REFUSED', 'R1_SENDKEYS_REFUSE')).some((r) => /sendKeys\.js.*VENDORED\.md/.test(r)));
    assert.ok(drift(() => fs.rmSync(path.join(copy, 'lib', 'windows', 'r1Gate.js'))).some((r) => /r1Gate\.js/.test(r)));
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
});

test('T25 call-site inventory over the vendored tree', () => {
  const sites = {};
  for (const f of walk(VENDOR).filter((p) => p.endsWith('.js'))) {
    const text = fs.readFileSync(path.join(VENDOR, f), 'utf8');
    for (const [name, re] of [['write', /\.write\(/g], ['execFile', /execFile/g], ['spawn', /\bspawn(Sync)?\)?\(/g], ['tls', /node_tls_1\.connect/g], ['net', /net_1\.connect/g]]) {
      const n = (text.match(re) ?? []).length;
      if (n) (sites[name] ??= {})[f] = n;
    }
  }
  assert.deepEqual(Object.keys(sites.write), ['lib/windows/NVDA/NVDAClient.js']);
  assert.deepEqual(Object.keys(sites.execFile), ['lib/windows/runVbsScript.js']);
  assert.deepEqual(Object.keys(sites.spawn).sort(), ['lib/windows/NVDA/quit.js', 'lib/windows/NVDA/start.js']);
  assert.deepEqual(Object.keys(sites.tls), ['lib/windows/NVDA/NVDAClient.js']);
  assert.deepEqual(Object.keys(sites.net), ['lib/windows/NVDA/isRunning.js']);
  // Every .write( in NVDAClient sits inside #handshake or #sendChord.
  const client = fs.readFileSync(path.join(VENDOR, 'lib/windows/NVDA/NVDAClient.js'), 'utf8').split('\n');
  let method = null;
  for (const line of client) {
    const m = /^ {4}(?:async |static )?(#?\w+)\(/.exec(line);
    if (m) method = m[1];
    if (/\.write\(/.test(line)) assert.ok(['#handshake', '#sendChord'].includes(method), `${method}: ${line.trim()}`);
  }
  // execFile is captured once at load and called only inside runSendKeys.
  const vbs = fs.readFileSync(path.join(VENDOR, 'lib/windows/runVbsScript.js'), 'utf8');
  assert.match(vbs, /^const execFile = child_process_1\.execFile;$/m);
  const calls = [...vbs.matchAll(/execFile\(/g)].map((m) => vbs.lastIndexOf('function ', m.index));
  assert.ok(calls.length >= 1);
  for (const at of calls) assert.ok(vbs.startsWith('function runSendKeys', at), 'execFile call outside runSendKeys');
});
