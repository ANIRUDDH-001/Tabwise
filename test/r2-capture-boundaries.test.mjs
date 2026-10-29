import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureJourney } from '../src/r2/capture.mjs';

function setup() {
  let t = 1;
  const events = [];
  const sent = [];
  const speech = { read: async () => ({ source: 'fake-nvda', session: 's', connected: true, complete: true, phrases: [] }) };
  const page = { read: async () => ({ session: 'p', complete: true, clock: 'page-monotonic-ms', t: 1000 + t, active: 'opener', state: {}, events: structuredClone(events) }) };
  const emit = (type, detail = {}) => events.push({ seq: events.length + 1, t: 1000 + t, type, ...detail });
  const execute = async action => { sent.push(action.step); emit('keydown', { key: 'Enter', shift: false }); };
  const options = { fixture_id: 'f-aa', actions: [{ step: 'a01', press: 'Enter' }, { step: 'a02', press: 'Enter' }],
    speech, page, execute, observationMs: 10, pollMs: 5, timeoutMs: 20, clock: { now: () => t, wait: async ms => { t += ms; } } };
  return { events, sent, speech, page, emit, options, time: () => t };
}

test('R2 boundary: transient page events outside a closed action stay unattributed and are preserved', async () => {
  const f = setup(); const read = f.page.read; let injected = false;
  f.page.read = async () => {
    const sample = await read();
    if (f.time() === 11 && !injected) { injected = true; f.emit('focusin', { target: 'body', active: 'body' }); f.emit('focusin', { target: 'opener', active: 'opener' }); }
    return sample;
  };
  const result = await captureJourney(f.options);
  assert.equal(result.completed, false);
  assert.equal(result.records[1].capture_status, 'ambiguous');
  assert.deepEqual(result.unattributed_page.flatMap(s => s.events.map(e => e.target)), ['body', 'opener']);
  assert.deepEqual(f.sent, ['a01']);
});

test('R2 boundary: rejected ordering is retained for diagnosis rather than discarded or repaired', async () => {
  const f = setup();
  f.options.execute = async action => { await setupExecute(action); };
  const setupExecute = async action => { f.sent.push(action.step); f.events.push({ seq: 2, t: 1001, type: 'keydown', key: 'Enter', shift: false }); };
  const result = await captureJourney(f.options);
  assert.equal(result.completed, false);
  assert.equal(result.records[0].page.rejected[0].events[0].seq, 2);
  assert.equal(result.records[0].page.events.length, 0);
});

test('R2 boundary: final-window arrivals are retained as unassigned evidence, not a completed journey', async () => {
  const f = setup(); f.options.actions = f.options.actions.slice(0, 1);
  const read = f.page.read; let injected = false;
  f.page.read = async () => {
    const sample = await read();
    if (f.time() === 11 && !injected) { injected = true; f.emit('app', { active: 'body', state: { transient: true } }); }
    return sample;
  };
  const result = await captureJourney(f.options);
  assert.equal(result.completed, false);
  assert.equal(result.unattributed_page[0].events[0].type, 'app');
  assert.match(result.reasons.join(), /final boundary/);
});

test('R2 boundary: a provider clock that stops or regresses cannot manufacture silence', async () => {
  for (const change of [() => {}, () => { throw Error('clock failure'); }]) {
    const f = setup(); f.options.clock.wait = async () => change();
    const result = await captureJourney(f.options);
    assert.equal(result.completed, false);
    assert.equal(result.records[0].silence, undefined);
    assert.deepEqual(f.sent, ['a01']);
  }
});
