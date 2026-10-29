import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as capture from '../src/r2/capture.mjs';
import { deferred } from './helpers/reliability.mjs';
import { speechEvidenceErrors } from '../src/r2/preparation.mjs';

// Only in-memory transport/page boundaries. No NVDA, browser, sockets or physical keys.
function fixture() {
  let time = 100;
  const pending = [];
  const phrases = ['stale title'];
  const events = [];
  let active = 'body';
  const state = { saved: false };
  const speechState = { source: 'fake-nvda', session: 'speech-1', connected: true, complete: true };
  const pageState = { session: 'page-1', complete: true };
  const event = (type, detail = {}) => events.push({ seq: events.length + 1, t: 9000 + time, type, ...detail });
  const focus = target => { event('focusout', { target: active, active: 'body' }); active = target; event('focusin', { target, active }); };
  const later = (delay, fn) => pending.push({ at: time + delay, fn });
  const clock = {
    now: () => time,
    async wait(ms) {
      const end = time + ms;
      pending.sort((a,b) => a.at - b.at);
      while (pending[0]?.at <= end) { const next = pending.shift(); time = next.at; next.fn(); }
      time = end;
    },
  };
  const speech = { read: async () => ({ ...speechState, phrases: [...phrases] }) };
  const page = { read: async () => ({ ...pageState, clock: 'page-monotonic-ms', t: 9000 + time, active, state: { ...state }, events: structuredClone(events) }) };
  const sent = [];
  const execute = async action => {
    sent.push(action.step);
    const shift = action.press.startsWith('Shift+');
    const key = action.press.replace(/^Shift\+/, '') === 'Space' ? ' ' : action.press.replace(/^Shift\+/, '');
    event('keydown', { key, shift, target: active });
  };
  return { phrases, events, state, speechState, pageState, clock, speech, page, execute, sent, later, focus, event };
}

const actions = [{ step: 'a01', press: 'Enter' }, { step: 'a02', press: 'Tab' }];
const run = (f, extra = {}) => capture.captureJourney({ fixture_id: 'f-ab12', actions, speech: f.speech, page: f.page, execute: f.execute, clock: f.clock, observationMs: 30, pollMs: 10, timeoutMs: 100, ...extra });

test('R2 capture: appends every new phrase once, preserving legitimate repeated text and excluding stale prefixes', async () => {
  const f = fixture();
  const result = await run(f, { execute: async action => { await f.execute(action); f.phrases.push('same', 'same', action.step); } });
  assert.equal(result.completed, true);
  assert.equal(result.outcome, 'COMPLETE');
  assert.deepEqual(result.records.map(r => r.raw_seq), [[2, 3, 4], [5, 6, 7]]);
  assert.deepEqual(result.records.map(r => r.text), ['same\nsame\na01', 'same\nsame\na02']);
  assert.deepEqual(result.raw.map(r => r.text), ['same', 'same', 'a01', 'same', 'same', 'a02']);
  assert.equal(result.preexisting_phrases, 1);
  assert.notEqual(result.source, 'nvda');
  assert.ok(speechEvidenceErrors(result, result.raw, ['a01', 'a02']).length, 'simulated capture must not qualify as real NVDA');
});

test('R2 capture: delayed utterances inside the observation window stay on the triggering action', async () => {
  const f = fixture();
  const result = await run(f, { execute: async action => {
    await f.execute(action);
    if (action.step === 'a01') { f.later(10, () => f.phrases.push('first')); f.later(30, () => f.phrases.push('delayed')); }
  } });
  assert.equal(result.completed, true);
  assert.deepEqual(result.records.map(r => r.text), ['first\ndelayed', '']);
  assert.deepEqual(result.records.map(r => r.capture_status), ['speech', 'observed-silence']);
});

test('R2 capture: silence requires a complete live window with explicit Node clock boundaries', async () => {
  const result = await run(fixture(), { actions: actions.slice(0, 1) });
  assert.equal(result.completed, true);
  assert.equal(result.records[0].capture_status, 'observed-silence');
  assert.deepEqual(result.records[0].silence, { transport_live: true, from: 100, to: 130, unit: 'node-monotonic-ms' });
  assert.deepEqual(result.records[0].raw_seq, []);
});

for (const [name, change, status] of [
  ['missing', f => { f.speech.read = async () => null; }, 'missing'],
  ['failed', f => { f.speech.read = async () => { throw Error('read failed'); }; }, 'failed'],
  ['disconnected', f => { f.speechState.connected = false; }, 'disconnected'],
  ['incomplete', f => { f.speechState.complete = false; }, 'incomplete'],
]) test(`R2 capture: ${name} capture is never observed silence and sends no action`, async () => {
  const f = fixture(); change(f);
  const result = await run(f);
  assert.equal(result.outcome, 'INSUFFICIENT_EVIDENCE');
  assert.equal(result.completed, false);
  assert.equal(result.records[0].capture_status, status);
  assert.equal(result.records[0].silence, undefined);
  assert.deepEqual(f.sent, []);
});

test('R2 capture: an intermediate disconnect cannot be hidden by a later reconnect', async () => {
  const f = fixture();
  const result = await run(f, { execute: async action => { await f.execute(action); f.later(10, () => { f.speechState.connected = false; }); f.later(20, () => { f.speechState.connected = true; }); } });
  assert.equal(result.records[0].capture_status, 'disconnected');
  assert.equal(result.completed, false);
  assert.deepEqual(f.sent, ['a01']);
});

test('R2 capture: log resets, rewritten prefixes and session changes invalidate deltas', async () => {
  for (const mutation of [f => f.phrases.splice(0), f => { f.phrases[0] = 'replacement'; }, f => { f.speechState.session = 'speech-2'; }]) {
    const f = fixture();
    const result = await run(f, { execute: async action => { await f.execute(action); mutation(f); } });
    assert.equal(result.completed, false);
    assert.equal(result.records[0].capture_status, 'incomplete');
    assert.deepEqual(f.sent, ['a01']);
    assert.equal(result.records[0].silence, undefined);
  }
});

test('R2 capture: focus loss and recovery between identical endpoint snapshots remains in the ordered action log', async () => {
  const f = fixture(); f.focus('opener');
  const result = await run(f, { actions: actions.slice(0, 1), execute: async action => {
    await f.execute(action); f.focus('body'); f.focus('opener'); f.state.saved = true; f.event('app', { active: 'opener', state: { saved: true } });
  } });
  const record = result.records[0];
  assert.equal(result.completed, true);
  assert.equal(record.page.before.active, 'opener');
  assert.equal(record.page.after.active, 'opener');
  assert.deepEqual(record.page.events.map(e => e.seq), [3, 4, 5, 6, 7, 8]);
  assert.ok(record.page.events.some(e => e.type === 'focusin' && e.target === 'body'));
  assert.deepEqual(record.page.after.state, { saved: true });
  assert.equal(record.ack_seq, 3);
  assert.equal(record.node_window.clock, 'node-monotonic-ms');
  assert.equal(record.page.after.clock, 'page-monotonic-ms');
  assert.ok(record.page.events[0].t > record.node_window.to, 'clocks are deliberately offset, never compared');
  f.events[3].target = 'mutated'; f.state.saved = false;
  assert.ok(record.page.events.some(e => e.target === 'body'), 'evidence is detached from mutable provider buffers');
});

test('R2 capture: duplicate, gapped or reordered page events are not sorted into valid evidence', async () => {
  for (const change of [f => f.events.push({ seq: 1, t: 9100, type: 'focusin', target: 'body' }), f => { f.events[0].seq = 2; }, f => { f.events[0].t = -1; f.events.push({ seq: 2, t: -2, type: 'focusin', target: 'body' }); }]) {
    const f = fixture();
    const result = await run(f, { execute: async action => { await f.execute(action); change(f); } });
    assert.equal(result.completed, false);
    assert.match(result.reasons.join(), /page/);
    assert.deepEqual(f.sent, ['a01']);
  }
});

test('R2 capture: a missing, wrong or duplicated key acknowledgement prevents completion', async () => {
  for (const execute of [async () => {}, async f => { f.event('keydown', { key: 'Tab', shift: false }); }, async f => { await f.execute(actions[0]); await f.execute(actions[0]); }]) {
    const f = fixture();
    const result = await run(f, { execute: () => execute(f) });
    assert.equal(result.completed, false);
    assert.match(result.reasons.join(), /ack/);
    assert.equal(result.records.length, 1);
  }
});

test('R2 capture: ArrowDown, Escape, Space and Shift+Tab use exact page acknowledgements without changing R1', async () => {
  const result = await run(fixture(), { actions: ['ArrowDown', 'Escape', 'Space', 'Shift+Tab'].map((press,i) => ({ step: `a0${i+1}`, press })) });
  assert.equal(result.completed, true);
  assert.deepEqual(result.records.map(r => r.page.events[0].key), ['ArrowDown', 'Escape', ' ', 'Tab']);
});

test('R2 capture: action failure preserves partial speech and page state and stops subsequent actions', async () => {
  const f = fixture();
  const result = await run(f, { execute: async action => { await f.execute(action); f.phrases.push('partial'); f.focus('body'); throw Error('send failed'); } });
  assert.equal(result.completed, false);
  assert.equal(result.records[0].capture_status, 'failed');
  assert.equal(result.records[0].text, 'partial');
  assert.ok(result.records[0].page.events.some(e => e.target === 'body'));
  assert.match(result.reasons.join(), /send failed/);
  assert.deepEqual(f.sent, ['a01']);
});

test('R2 capture: a hung read is bounded and no input follows its timeout', async () => {
  const f = fixture(); f.speech.read = () => new Promise(() => {});
  const result = await run(f, { timeoutMs: 15 });
  assert.equal(result.completed, false);
  assert.match(result.reasons.join(), /timed out/);
  assert.deepEqual(f.sent, []);
});

test('R2 capture: a hung action requests cancellation and late completion cannot mutate returned evidence', async () => {
  const f = fixture(); const pending = deferred(); let signal;
  const result = await run(f, { timeoutMs: 15, execute: async (action, context) => { signal = context.signal; await pending.promise; await f.execute(action); } });
  const frozen = JSON.stringify(result);
  assert.equal(result.completed, false);
  assert.equal(signal.aborted, true);
  pending.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(JSON.stringify(result), frozen);
  assert.deepEqual(f.sent, ['a01'], 'injection must honor cancellation; adapter does not claim it can retract a send');
});

test('R2 capture: unexpected between-action speech is retained as unattributed, never borrowed by the next action', async () => {
  const f = fixture(); const read = f.speech.read; let injected = false;
  f.speech.read = async () => {
    if (f.sent.length === 1 && f.clock.now() === 130 && !injected) {
      // Final a01 sample reads speech before page; only add speech after the page snapshot.
      const pageRead = f.page.read;
      f.page.read = async () => { const value = await pageRead(); if (!injected) { f.phrases.push('late unassigned'); injected = true; } return value; };
    }
    return read();
  };
  const result = await run(f);
  assert.equal(result.completed, false);
  assert.equal(result.records[1].capture_status, 'ambiguous');
  assert.equal(result.records[1].text, '');
  assert.deepEqual(result.unattributed.map(r => r.text), ['late unassigned']);
  assert.deepEqual(f.sent, ['a01']);
});

test('R2 capture: missing snapshots and page session changes cannot be called a complete journey', async () => {
  for (const mutate of [f => { f.page.read = async () => null; }, f => { f.pageState.complete = false; }, f => { f.pageState.session = 'page-2'; }]) {
    const f = fixture();
    const result = await run(f, { execute: async action => { await f.execute(action); mutate(f); } });
    assert.equal(result.completed, false);
    assert.match(result.reasons.join(), /page/);
    assert.deepEqual(f.sent, ['a01']);
  }
});

test('R2 capture: invalid actions/options are refused before any provider call', async () => {
  for (const extra of [{ actions: [] }, { actions: [actions[0], actions[0]] }, { observationMs: 0 }, { pollMs: 0 }, { actions: [{ step: 'a01', press: 'Control+Tab' }] }]) {
    const f = fixture(); let reads = 0; f.speech.read = async () => { reads++; throw Error('must not read'); };
    await assert.rejects(run(f, extra), /action|observation|poll|press/);
    assert.equal(reads, 0);
  }
});
