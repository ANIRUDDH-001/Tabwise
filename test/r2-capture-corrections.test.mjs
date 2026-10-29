import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureJourney } from '../src/r2/capture.mjs';
import { deferred } from './helpers/reliability.mjs';

function fixture({ ackDelay = 0 } = {}) {
  let time = 0;
  const scheduled = [], phrases = [], events = [], sent = [];
  const later = (ms, fn) => scheduled.push({ at: time + ms, fn });
  const clock = { now: () => time, async wait(ms) {
    const end = time + ms;
    scheduled.sort((a,b) => a.at - b.at);
    while (scheduled[0]?.at <= end) { const item = scheduled.shift(); time = item.at; item.fn(); }
    time = end;
  } };
  const speech = { read: async () => ({ source: 'fake-nvda', session: 's', connected: true, complete: true, phrases: [...phrases] }) };
  const page = { read: async () => ({ session: 'p', complete: true, clock: 'page-monotonic-ms', t: 10000 + time, active: 'submit', state: {}, events: structuredClone(events) }) };
  const execute = async action => {
    sent.push(action.step);
    const ack = () => events.push({ seq: events.length + 1, t: 10000 + time, type: 'keydown', key: action.press, shift: false });
    if (ackDelay === 0) ack(); else if (ackDelay !== null) later(ackDelay, ack);
  };
  const options = { fixture_id: 'f-ab', actions: [{ step: 'a01', press: 'Enter' }], speech, page, execute, clock, observationMs: 2000, pollMs: 100, timeoutMs: 100 };
  return { clock, speech, page, execute, sent, phrases, later, options };
}

test('R2 correction 1: speech arriving during the pre-action page read stays unattributed and prevents the send', async t => {
  const f = fixture(); const read = f.page.read; let first = true;
  f.page.read = async context => { const value = await read(context); if (first) { first = false; f.phrases.push('unrelated pre-action phrase'); } return value; };
  const result = await captureJourney(f.options);
  t.diagnostic(JSON.stringify({ reproduction: 'pre-action page-read speech', outcome: result.outcome, associated_text: result.records[0].text, sent: f.sent }));
  assert.equal(result.completed, false);
  assert.equal(result.records[0].capture_status, 'ambiguous');
  assert.deepEqual(result.unattributed.map(p => p.text), ['unrelated pre-action phrase']);
  assert.equal(result.records[0].text, '');
  assert.deepEqual(f.sent, []);
});

test('R2 correction 2: a 1500ms keydown cannot satisfy the 1000ms acknowledgement bound inside a 2000ms observation', async t => {
  const f = fixture({ ackDelay: 1500 });
  const result = await captureJourney(f.options);
  t.diagnostic(JSON.stringify({ reproduction: 'late keydown', outcome: result.outcome, ack_seq: result.records[0].ack_seq, elapsed_node_ms: f.clock.now() }));
  assert.equal(result.completed, false);
  assert.equal(result.records[0].ack_seq, null);
  assert.match(result.reasons.join(), /ack.*1000/);
  assert.equal(f.clock.now(), 1000);
});

test('R2 correction: a timely observed key permits delayed speech without becoming a verified guarded execution', async () => {
  const f = fixture({ ackDelay: 500 });
  const execute = f.options.execute;
  f.options.execute = async action => { await execute(action); f.later(1500, () => f.phrases.push('delayed after timely key')); };
  const result = await captureJourney(f.options);
  assert.equal(result.completed, true);
  assert.equal(result.records[0].text, 'delayed after timely key');
  assert.equal(result.records[0].ack_timing.observed_at, 500);
  assert.equal(result.records[0].ack_timing.clock, 'node-monotonic-ms');
  assert.equal(result.guarded_execution_verified, false);
  assert.equal(result.records[0].association, 'observation-window-only');
});

test('R2 correction: slow executor completion cannot reset the acknowledgement deadline', async () => {
  const f = fixture();
  f.options.execute = async action => { await f.clock.wait(1500); await f.execute(action); };
  const result = await captureJourney(f.options);
  assert.equal(result.completed, false);
  assert.equal(result.records[0].ack_seq, null);
  assert.match(result.reasons.join(), /ack.*1000/);
});

test('R2 correction: sparse polling cannot use a page clock to backdate a late-observed acknowledgement', async () => {
  const f = fixture({ ackDelay: 1500 }); f.options.pollMs = 2000;
  const result = await captureJourney(f.options);
  assert.equal(result.completed, false);
  assert.equal(f.clock.now(), 1000);
  assert.equal(result.records[0].ack_seq, null);
});

test('R2 correction: pending executor cancellation is explicitly requested and unconfirmed even if it sends later', async () => {
  const f = fixture(); const pending = deferred(); let signal;
  f.options.timeoutMs = 15;
  f.options.execute = async (action, context) => { signal = context.signal; await pending.promise; await f.execute(action); };
  const result = await captureJourney(f.options);
  const saved = JSON.stringify(result);
  assert.equal(result.completed, false);
  assert.equal(signal.aborted, true);
  assert.equal(result.records[0].execution.settled, false);
  assert.equal(result.records[0].execution.cancellation_requested, true);
  assert.equal(result.records[0].execution.quiescence, 'UNVERIFIED');
  assert.equal(result.guarded_execution_verified, false);
  pending.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.sent, ['a01']);
  assert.equal(JSON.stringify(result), saved);
});

test('R2 correction: executor settlement by itself does not attest physical quiescence', async () => {
  const result = await captureJourney(fixture().options);
  assert.equal(result.completed, true);
  assert.equal(result.records[0].execution.settled, true);
  assert.equal(result.records[0].execution.cancellation_requested, false);
  assert.equal(result.records[0].execution.quiescence, 'UNVERIFIED');
  assert.equal(result.guarded_execution_verified, false);
});
