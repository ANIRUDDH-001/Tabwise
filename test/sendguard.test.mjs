// D-39 send gate tests (src/speech/sendguard.mjs). Pure: no Guidepup, no process, no window.
// send() below drives the gate the way the two vendored key paths do (vendor/guidepup-0.36.4-r1:
// NVDAClient #sendChord, runVbsScript runSendKeys): admit (bounded check), commit in the same turn,
// dispatch, release (ack, settle, post-check). test/vendor.test.mjs runs the vendored code itself.
// Replaces the D-37 wrapper tests; the brief (docs/reviews/R1-D39-review-brief.md) maps old to new.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendGate, judgeKeys, pageKeyOf, pageAck, VK } from '../src/speech/sendguard.mjs';

const TAB = { path: 'nvda', keys: [{ vk: VK.Tab, scan: 15, ext: false }] };
const STOP = { path: 'nvda', keys: [{ vk: VK.Control, scan: 29, ext: false }] };
const NVDA_T = { path: 'nvda', keys: [{ vk: VK.Insert, scan: 82, ext: true }, { vk: 84, scan: 20, ext: false }] };
const SHIFT_TAB = { path: 'nvda', keys: [{ vk: VK.Shift, scan: 42, ext: false }, { vk: VK.Tab, scan: 15, ext: false }] };
const CHAR = (char) => ({ path: 'sendkeys', char });
// D-43: positive fixtures provide the mandatory capability and correct acknowledgement class.
const OK_ACK = Object.assign(async (token) => ({ ack: pageKeyOf(token.info) === null ? null : true, reasons: [] }), { before: async () => [] });

// A gate with a scripted foreground check and ack; the clock only moves when a test moves it.
function rig({ verdict = () => [], ack = OK_ACK, integrity = () => [], ...opts } = {}) {
  let t = 0;
  const gate = sendGate({ checkMs: 100, settleMs: 0, ackMs: 100, maxAgeMs: 100, now: () => t, ...opts });
  const log = [];
  gate.setCheck(async (ctx) => { log.push(`${ctx.phase}:${ctx.send}`); return verdict(ctx); });
  if (ack) gate.setAck(Object.assign(async (token) => { log.push(`ack:${token.id}`); return ack(token); }, { before: async () => [] }));
  gate.setIntegrity(integrity);
  return { gate, log, advance: (ms) => { t += ms; } };
}
// What the vendored paths do. phys() is the hand-off to the socket or cscript.
async function send(gate, info, phys = () => {}, { beforeCommit } = {}) {
  const token = await gate.admit(info);
  beforeCommit?.();
  if (!gate.commit(token)) throw new Error('R1_REFUSED: commit');
  let error = null;
  try { await phys(); } catch (e) { error = e.message; }
  await gate.release(token, { error, ended: true });
}
const tick = () => new Promise((r) => setImmediate(r));

test('gate: a send outside an action is refused before any check and stops the gate', async () => {
  const { gate, log } = rig();
  const phys = [];
  await assert.rejects(send(gate, TAB, () => phys.push('Tab')), /R1_REFUSED/);
  assert.deepEqual(phys, []);
  assert.deepEqual(log, []);
  assert.equal(gate.status().kind, 'protocol');
  assert.equal(gate.status().stopped, true);
});

test('gate: armed -> pre-check, one dispatch, ack, post-check, in that order', async () => {
  const { gate, log } = rig();
  const order = [];
  gate.arm('Tab');
  await send(gate, TAB, () => { order.push('phys'); log.push('phys'); });
  assert.deepEqual(log, ['pre:1', 'phys', 'ack:1', 'post:1']);
  const s = gate.status();
  assert.equal(s.sends, 1);
  assert.equal(s.stopped, false);
  assert.equal(s.live, 0);
});

test('T3 gate: stopped while the pre-check is pending, the check then says OK -> zero sends, epoch refusal', async () => {
  let release;
  const { gate } = rig({ verdict: () => new Promise((r) => { release = () => r([]); }) });
  gate.arm('Tab');
  const phys = [];
  const p = send(gate, TAB, () => phys.push('Tab'));
  await tick();
  gate.stop('SIGINT received');
  release();
  await assert.rejects(p, /R1_REFUSED/);
  assert.deepEqual(phys, []);
  assert.equal(gate.status().refused, 1);
  assert.match(gate.status().refusals.at(-1), /stopped|epoch/);
});

test('T4 gate: a pre-check that says OK only after its timeout -> zero sends, stopped as pre', async () => {
  const { gate } = rig({ verdict: () => new Promise((r) => setTimeout(() => r([]), 300)) });
  gate.arm('Tab');
  const phys = [];
  await assert.rejects(send(gate, TAB, () => phys.push('Tab')), /R1_REFUSED/);
  await new Promise((r) => setTimeout(r, 350));
  assert.deepEqual(phys, []);
  assert.equal(gate.status().kind, 'pre');
  assert.match(gate.status().reason, /timed out/);
});

test('gate: a check that throws, returns no verdict, or a mismatch -> zero sends', async () => {
  for (const verdict of [() => { throw new Error('probe died'); }, () => undefined, () => ['foreground pid 9 is not Chromium 1']]) {
    const { gate } = rig({ verdict });
    gate.arm('Tab');
    const phys = [];
    await assert.rejects(send(gate, TAB, () => phys.push('Tab')), /R1_REFUSED/);
    assert.deepEqual(phys, []);
    assert.equal(gate.status().kind, 'pre');
    assert.equal(gate.status().misdelivered, false);
  }
});

test('gate: no check, no ack reader, or a failing integrity check -> refused before any key', async () => {
  const noCheck = sendGate({ checkMs: 100, settleMs: 0 });
  noCheck.setAck(OK_ACK);
  noCheck.setIntegrity(() => []);
  noCheck.arm('Tab');
  await assert.rejects(send(noCheck, TAB), /R1_REFUSED/);
  const { gate: noAck } = rig({ ack: null });
  noAck.arm('Tab');
  await assert.rejects(send(noAck, TAB), /R1_REFUSED/);
  assert.match(noAck.status().reason, /acknowledgement/);
  const { gate: bad } = rig({ integrity: () => ['NVDAClient.prototype is not frozen'] });
  bad.arm('Tab');
  await assert.rejects(send(bad, TAB), /R1_REFUSED/);
  assert.equal(bad.status().kind, 'integrity');
  for (const g of [noCheck, noAck, bad]) assert.equal(g.status().sends, 0);
});

test('T9 gate: two concurrent chords -> the second admit is refused, the gate stops, the first commit is refused', async () => {
  const { gate } = rig({ verdict: () => new Promise((r) => setTimeout(() => r([]), 10)) });
  gate.arm('click');
  const phys = [];
  const results = await Promise.allSettled([send(gate, TAB, () => phys.push(1)), send(gate, TAB, () => phys.push(2))]);
  assert.deepEqual(results.map((r) => r.status), ['rejected', 'rejected']);
  assert.deepEqual(phys, []);
  assert.equal(gate.status().kind, 'protocol');
  assert.match(gate.status().reason, /in flight/);
});

test('T21 gate: an event-loop stall longer than maxAgeMs between admit and commit -> commit refused, zero sends', async () => {
  const { gate, advance } = rig();
  gate.arm('Tab');
  const phys = [];
  await assert.rejects(send(gate, TAB, () => phys.push('Tab'), { beforeCommit: () => advance(101) }), /R1_REFUSED: commit/);
  assert.deepEqual(phys, []);
  assert.match(gate.status().reason, /older than 100 ms/);
  // At exactly maxAgeMs the check is still fresh.
  const { gate: g2, advance: adv2 } = rig();
  g2.arm('Tab');
  await send(g2, TAB, () => phys.push('Tab'), { beforeCommit: () => adv2(100) });
  assert.deepEqual(phys, ['Tab']);
});

test('gate: the action ended between check and commit (same label re-armed) -> commit refused', async () => {
  const { gate } = rig();
  gate.arm('Tab');
  const phys = [];
  await assert.rejects(send(gate, TAB, () => phys.push('Tab'), { beforeCommit: () => { gate.disarm(); gate.arm('Tab'); } }), /R1_REFUSED/);
  assert.deepEqual(phys, []);
});

test('T7 gate: post-check mismatch -> one send, possibly misdelivered, sticky: the next send is refused', async () => {
  const { gate } = rig({ verdict: (ctx) => (ctx.phase === 'post' ? ['foreground title lacks the nonce'] : []) });
  gate.arm('Tab');
  const phys = [];
  await send(gate, TAB, () => phys.push('Tab'));
  assert.equal(gate.status().kind, 'post');
  assert.equal(gate.status().misdelivered, true);
  await assert.rejects(send(gate, TAB, () => phys.push('again')), /R1_REFUSED/);
  assert.deepEqual(phys, ['Tab']);
});

test('T19 gate: ack false -> possibly misdelivered (kind ack), the post-check still runs', async () => {
  const { gate, log } = rig({ ack: async () => ({ ack: false, reasons: ['expected Tab once, saw 0'] }) });
  gate.arm('Tab');
  await send(gate, TAB);
  assert.equal(gate.status().kind, 'ack');
  assert.equal(gate.status().misdelivered, true);
  assert.equal(gate.status().acks.missing, 1);
  assert.deepEqual(log.slice(-1), ['post:1'], 'post-check after the failed ack, for the record');
});

test('T19 gate: an ack reader that hangs is bounded and counts as missing', async () => {
  const { gate } = rig({ ack: () => new Promise(() => {}) });
  gate.arm('Tab');
  await send(gate, TAB);
  assert.equal(gate.status().kind, 'ack');
  assert.equal(gate.status().misdelivered, true);
});

test('gate: a dispatch that throws is possibly misdelivered (kind send)', async () => {
  const { gate } = rig();
  gate.arm('Tab');
  await send(gate, TAB, () => { throw new Error('EPIPE'); });
  assert.equal(gate.status().kind, 'send');
  assert.equal(gate.status().misdelivered, true);
});

test('T20 gate: the post-check runs only after release, never before the dispatch has ended', async () => {
  const { gate, log } = rig();
  gate.arm('Tab');
  const token = await gate.admit(TAB);
  assert.equal(gate.commit(token), true);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(log, ['pre:1'], 'nothing after the pre-check while the write callback is pending');
  await gate.release(token, { error: null, ended: true });
  assert.deepEqual(log, ['pre:1', 'ack:1', 'post:1']);
});

test('gate: stop calls the cancel of a live dispatch; it stays live until settled; quiesce reports it (D-40)', async () => {
  const { gate } = rig();
  gate.arm('type A');
  const token = await gate.admit(CHAR('A'));
  assert.equal(gate.commit(token), true);
  let cancelled = 0;
  gate.launched(token, () => { cancelled += 1; });
  gate.stop('SIGTERM received');
  assert.equal(cancelled, 1, 'cancel is best effort: it cannot recall an OS operation already launched');
  await gate.release(token, { error: 'cscript did not exit', ended: false });
  assert.equal(gate.status().live, 1);
  const q = await gate.quiesce(30);
  assert.equal(q.quiet, false);
  gate.settled(token);
  assert.equal(gate.status().live, 0);
  assert.equal((await gate.quiesce(30)).quiet, true);
  assert.equal(gate.status().misdelivered, true);
});

test('gate: idle waits for a send in flight and reports a timeout', async () => {
  const { gate } = rig();
  gate.arm('Tab');
  const token = await gate.admit(TAB);
  gate.commit(token);
  assert.equal((await gate.idle(20)).quiet, false);
  await gate.release(token, { error: null, ended: true });
  assert.equal((await gate.idle(20)).quiet, true);
});

test('gate: onIntent is told about each send before its check (M-03 intent line)', async () => {
  const { gate, log } = rig();
  gate.onIntent((t) => log.push(`intent:${t.id}:${t.action.label}`));
  gate.arm('Tab');
  await send(gate, TAB);
  assert.deepEqual(log.slice(0, 2), ['intent:1:Tab', 'pre:1']);
});

test('pageKeyOf: page-reaching chords and characters, NVDA-consumed ones are null, unknown keys cannot be confirmed', () => {
  assert.deepEqual(pageKeyOf(TAB), { key: 'Tab', shift: false });
  assert.deepEqual(pageKeyOf(SHIFT_TAB), { key: 'Tab', shift: true });
  assert.deepEqual(pageKeyOf({ path: 'nvda', keys: [{ vk: VK.Space, scan: 57, ext: false }] }), { key: ' ', shift: false });
  assert.deepEqual(pageKeyOf({ path: 'nvda', keys: [{ vk: VK.Enter, scan: 28, ext: false }] }), { key: 'Enter', shift: false });
  assert.equal(pageKeyOf(STOP), null, 'stop-speech Control is NVDA-consumed');
  assert.equal(pageKeyOf(NVDA_T), null, 'NVDA+T is NVDA-consumed');
  assert.deepEqual(pageKeyOf(CHAR('A')), { key: 'A' });
  assert.deepEqual(pageKeyOf(CHAR('@')), { key: '@' });
  assert.deepEqual(pageKeyOf({ path: 'nvda', keys: [{ vk: 112, scan: 59, ext: false }] }), { key: null, vk: 112 });
});

const ev = (seq, key, shift = false) => ({ seq, key, shift });
test('T19 judgeKeys: the expected key exactly once passes; missing, twice, an extra key or the wrong shift fails', () => {
  assert.deepEqual(judgeKeys([ev(1, 'Tab')], { key: 'Tab', shift: false }), []);
  assert.equal(judgeKeys([], { key: 'Tab', shift: false }).length, 1);
  assert.equal(judgeKeys([ev(1, 'Tab'), ev(2, 'Tab')], { key: 'Tab', shift: false }).length, 1);
  assert.equal(judgeKeys([ev(1, 'Tab'), ev(2, 'x')], { key: 'Tab', shift: false }).length, 1);
  assert.equal(judgeKeys([ev(1, 'Tab', true)], { key: 'Tab', shift: false }).length, 1, 'Shift+Tab is not Tab');
  assert.deepEqual(judgeKeys([ev(1, 'Shift', true), ev(2, 'Tab', true)], { key: 'Tab', shift: true }), []);
  assert.deepEqual(judgeKeys([ev(1, 'Shift', true), ev(2, 'A', true)], { key: 'A' }), [], 'SendKeys sends Shift with A');
  assert.equal(judgeKeys([ev(1, 'Tab')], { key: null, vk: 112 }).length, 1, 'an unknown key is never confirmed');
});

test('T26 judgeKeys (D-40): NVDA control keystrokes in the page log never invalidate an action ack, nor stand in for it', () => {
  const tab = { key: 'Tab', shift: false };
  // stop-speech Control before, the NVDA key (Insert) and a late Control after the action's own key.
  assert.deepEqual(judgeKeys([ev(1, 'Control'), ev(2, 'Insert'), ev(3, 'Tab'), ev(4, 'Control')], tab), []);
  assert.equal(judgeKeys([ev(1, 'Control'), ev(2, 'Control')], tab).length, 1, 'Control alone is not the Tab');
  assert.equal(judgeKeys([ev(1, 'Control'), ev(2, 'Tab'), ev(3, 't')], tab).length, 1, 'a non-modifier extra key still fails');
  assert.deepEqual(judgeKeys([ev(1, 'Control'), ev(2, 'Insert')], null), [], 'NVDA-consumed send: modifiers only is fine');
  assert.equal(judgeKeys([ev(1, 'Insert'), ev(2, 't')], null).length, 1, 'NVDA+T leaking a t to the page fails');
});

test('T19/T26 pageAck: waits for the key, advances its cursor, tolerates a late Control from an earlier send; late or unreadable -> false', async () => {
  const log = [];
  let reads = 0;
  // D-50: a key lands on a given page read (was: on a 5-10 ms timer, which a stalled event loop moved past
  // the 60 ms window). The waiting cases cannot reach their window; the late case below keeps a short one.
  const due = [];
  const landOnRead = (n, e) => due.push({ at: reads + n, e });
  const read = async (from) => {
    reads += 1;
    while (due.length && due[0].at <= reads) log.push(due.shift().e);
    return log.filter((e) => e.seq > from);
  };
  const ack = pageAck({ read, ackMs: 5_000, pollMs: 2 }); // below the 10 s test timeout: a missing key fails here
  const tok = (info) => ({ id: 1, info });
  // The key lands a little after release asks: the first read sees nothing.
  landOnRead(2, ev(1, 'Tab'));
  assert.deepEqual(await ack(tok(TAB)), { ack: true, reasons: [] });
  assert.equal(reads, 2, 'the ack waited for the key');
  // stop-speech Control: not page-reaching, nothing to wait for.
  const before = reads;
  assert.deepEqual(await ack(tok(STOP)), { ack: null, reasons: [] });
  assert.equal(reads, before, 'no page read for an NVDA-consumed send');
  // Its Control keydown arrives late, inside the next action's window: tolerated.
  log.push(ev(2, 'Control'));
  landOnRead(2, ev(3, 'A', true));
  assert.deepEqual(await ack(tok(CHAR('A'))), { ack: true, reasons: [] });
  // The Tab key event from the first window is not seen again.
  landOnRead(2, ev(4, 'Tab'));
  assert.equal((await ack(tok(TAB))).ack, true);
  // Late: nothing arrives within ackMs (a key after that is never read by this ack).
  const short = pageAck({ read: async () => [], ackMs: 60, pollMs: 2 });
  const late = await short(tok(TAB));
  assert.equal(late.ack, false);
  assert.match(late.reasons[0], /saw 0/);
  const broken = pageAck({ read: async () => { throw new Error('Target closed'); }, ackMs: 30, pollMs: 2 });
  const b = await broken(tok(TAB));
  assert.equal(b.ack, false);
  assert.match(b.reasons.join(' '), /Target closed/);
});

// D-42: changed. It was [Tab, Control, q] with the Tab ack true; with no Control window the q now fails that
// ack (D39-B01 P04 below), so q lands after the acknowledged Tab here.
test('pageAck.final: a non-modifier key after the last acknowledged one is reported', async () => {
  const log = [ev(1, 'Tab'), ev(2, 'Control')];
  const ack = pageAck({ read: async (from) => log.filter((e) => e.seq > from), ackMs: 30, pollMs: 2 });
  assert.equal((await ack({ id: 1, info: TAB })).ack, true);
  log.push(ev(3, 'q'));
  const rest = await ack.final();
  assert.equal(rest.length, 1);
  assert.match(rest[0], /q/);
});

// ---------- D-42 (D-39 exception): D39-B01, the page log is checked right before each send ----------
// Codex P04: the page log holds Tab, Control, A before the Tab ack is read; the later A send delivers nothing.
test('D39-B01 P04 pageAck: a key after a Control in the same window fails that ack; it is not kept for the next send', async () => {
  const log = [ev(1, 'Tab'), ev(2, 'Control'), ev(3, 'A', true)];
  const ack = pageAck({ read: async (from) => log.filter((e) => e.seq > from), ackMs: 30, pollMs: 2 });
  const tab = await ack({ id: 1, info: TAB });
  assert.equal(tab.ack, false);
  assert.match(tab.reasons.join(' '), /saw 2/);
});

test('D39-B01 P04 gate: the same trace through sendGate -> misdelivered at the Tab ack; the A send is refused, never confirmed', async () => {
  const log = [];
  const gate = sendGate({ checkMs: 100, settleMs: 0, ackMs: 30, maxAgeMs: 1000 });
  gate.setCheck(async () => []);
  gate.setIntegrity(() => []);
  gate.setAck(pageAck({ read: async (from) => log.filter((e) => e.seq > from), ackMs: 30, pollMs: 2 }));
  const sent = [];
  gate.arm('Tab');
  await send(gate, TAB, () => { sent.push('Tab'); log.push(ev(1, 'Tab'), ev(2, 'Control'), ev(3, 'A', true)); });
  gate.disarm();
  gate.arm('type A');
  await assert.rejects(send(gate, CHAR('A'), () => { sent.push('A'); }), /R1_REFUSED/);
  const s = gate.status();
  assert.deepEqual(sent, ['Tab']);
  assert.equal(s.misdelivered, true);
  assert.equal(s.kind, 'ack');
  assert.deepEqual(s.acks, { confirmed: 0, missing: 1, unconfirmable: 0 });
});

test('D39-B01 pre-send check: a non-modifier key already on the page -> refused before dispatch, misdelivered; Control, Shift, Insert are not strays', async () => {
  const log = [ev(1, 'Control'), ev(2, 'Shift', true), ev(3, 'Insert')];
  let reads = 0;
  const gate = sendGate({ checkMs: 100, settleMs: 0, ackMs: 30, maxAgeMs: 1000 });
  gate.setCheck(async () => []);
  gate.setIntegrity(() => []);
  gate.setAck(pageAck({ read: async (from) => { reads += 1; return log.filter((e) => e.seq > from); }, ackMs: 30, pollMs: 2 }));
  const sent = [];
  gate.arm('Tab');
  await send(gate, TAB, () => { sent.push('Tab'); log.push(ev(4, 'Tab')); });
  assert.equal(gate.status().acks.confirmed, 1, 'modifiers before the send are not strays');
  gate.disarm();
  // A stray A lands between sends. The next send (an NVDA-consumed stop-speech chord) is refused before dispatch.
  log.push(ev(5, 'A', true));
  gate.arm('type A');
  const before = reads;
  await assert.rejects(send(gate, STOP, () => { sent.push('stop'); }), /R1_REFUSED: .*page key "A" before send 2/);
  assert.ok(reads > before, 'the page log is read inside admit');
  assert.deepEqual(sent, ['Tab']);
  assert.equal(gate.status().misdelivered, true);
  assert.equal(gate.status().kind, 'ack');
});

test('D39-B01 residual (disclosed, D-42): an identical stray landing after the pre-send check while our key is lost cannot be told apart', async () => {
  const log = [];
  const gate = sendGate({ checkMs: 100, settleMs: 0, ackMs: 30, maxAgeMs: 1000 });
  gate.setCheck(async () => []);
  gate.setIntegrity(() => []);
  gate.setAck(pageAck({ read: async (from) => log.filter((e) => e.seq > from), ackMs: 30, pollMs: 2 }));
  gate.arm('type A');
  // Our A is lost; a stray A arrives inside the ack window. Same key, same window: counted as confirmed.
  await send(gate, CHAR('A'), () => { log.push(ev(1, 'Shift', true), ev(2, 'A', true)); });
  assert.equal(gate.status().acks.confirmed, 1);
  assert.equal(gate.status().misdelivered, false);
});
