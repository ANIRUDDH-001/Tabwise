import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPageInstrumentation, createPageProvider} from '../src/r2/page-provider.mjs';

function fixture(options = {}) {
  let time = 9000, active = 'body';
  const state = {saved: false};
  const journal = createPageInstrumentation({session: 'synthetic-page', now: () => time,
    snapshot: () => ({active, state}), ...options});
  return {journal, state, tick: n => { time += n; }, focus: value => { active = value; }};
}
const sample = () => ({session: 'p', clock: 'page-monotonic-ms', t: 20, active: 'body', state: {},
  complete: true, overflow: false, dropped: 0, event_count: 0, events: []});
const key = (seq = 1, t = 20) => ({seq, t, type: 'keydown', key: 'Tab', shift: false, target: 'body', active: 'body'});

test('page provider preserves ordered instrumentation and detached local snapshots', async () => {
  const f = fixture(), page = createPageProvider({readJournal: () => f.journal.read()});
  await page.read();
  f.journal.record('keydown', {key: 'Tab', shift: false, target: 'body'});
  f.tick(1); f.focus('body'); f.journal.record('focusout', {target: 'body'});
  f.tick(1); f.focus('field'); f.journal.record('focusin', {target: 'field'});
  f.tick(1); f.state.saved = true; f.journal.record('mutation', {attribute: 'aria-live', target: 'status'});
  f.journal.record('app', {name: 'saved', detail: {value: 1}});
  const read = await page.read();
  assert.deepEqual(read.events.map(e => [e.seq, e.t, e.type]), [
    [1,9000,'keydown'], [2,9001,'focusout'], [3,9002,'focusin'], [4,9003,'mutation'], [5,9003,'app']]);
  assert.equal(read.active, 'field'); assert.equal(read.session, 'synthetic-page');
  assert.equal(read.clock, 'page-monotonic-ms'); assert.equal(read.complete, true);
  assert.deepEqual(read.state, {saved: true});
  read.events[0].key = 'changed'; read.state.saved = false;
  assert.equal((await page.read()).events[0].key, 'Tab');
  assert.equal((await page.read()).state.saved, true);
});

for (const [name, change] of [
  ['sequence gap', s => { s.events = [key(2)]; s.event_count = 1; }],
  ['duplicate sequence', s => { s.events = [key(), key()]; s.event_count = 2; }],
  ['missing counted event', s => { s.event_count = 1; }],
  ['negative time', s => { s.t = -1; }],
  ['future event', s => { s.events = [key(1,21)]; s.event_count = 1; }],
  ['regressing event times', s => { s.events = [key(1,19), key(2,18)]; s.event_count = 2; }],
  ['unknown event', s => { s.events = [{...key(), type:'unknown'}]; s.event_count = 1; }],
  ['malformed key', s => { s.events = [{...key(), shift:'false'}]; s.event_count = 1; }],
  ['unexpected modifier', s => { s.events = [{...key(), ctrl:true}]; s.event_count = 1; }],
  ['incomplete journal', s => { s.complete = false; }],
  ['lost events', s => { s.dropped = 1; }],
  ['overflow marker', s => { s.overflow = true; }],
  ['missing session', s => { s.session = ''; }],
  ['wrong clock domain', s => { s.clock = 'node-monotonic-ms'; }],
  ['malformed state', s => { s.state = []; }],
]) test(`page provider fails closed and stays failed after ${name}`, async () => {
  let value = sample(); change(value);
  const page = createPageProvider({readJournal: () => value});
  await assert.rejects(page.read());
  value = sample();
  await assert.rejects(page.read(), /page/i, 'a later good snapshot cannot erase lost evidence');
});

for (const [name, change] of [
  ['rewritten prefix', s => { s.events[0].key = 'Enter'; }],
  ['session replacement', s => { s.session = 'new'; }],
  ['clock regression', s => { s.t = 19; }],
  ['truncated journal', s => { s.events = []; s.event_count = 0; }],
  ['backdated append', s => { s.events.push(key(2,19)); s.event_count = 2; }],
  ['missing focus event', s => { s.active = 'field'; }],
  ['missing state event', s => { s.state = {saved:true}; }],
]) test(`page provider detects ${name} across reads`, async () => {
  let value = {...sample(), events:[key()], event_count:1};
  const page = createPageProvider({readJournal: () => value});
  await page.read(); value = structuredClone(value); change(value);
  await assert.rejects(page.read());
});

test('instrumentation caps events and bytes without silently truncating evidence', async () => {
  for (const options of [{maxEvents:1}, {maxBytes:400}]) {
    const f = fixture(options);
    f.journal.record('app', {name:'first'});
    f.journal.record('app', {name:'second', detail:'x'.repeat(500)});
    const value = f.journal.read();
    assert.equal(value.complete, false); assert.equal(value.overflow, true);
    await assert.rejects(createPageProvider({readJournal: () => value}).read());
  }
});

test('instrumentation marks regression, malformed input, explicit loss and close as incomplete', () => {
  for (const breakJournal of [
    f => { f.journal.read(); f.tick(-1); },
    f => f.journal.record('keydown', {key:'Tab', shift:'false', target:'body'}),
    f => f.journal.record('app', {seq:99}),
    f => f.journal.markIncomplete('collector lost events'),
    f => f.journal.close(),
  ]) {
    const f = fixture(); breakJournal(f);
    assert.equal(f.journal.read().complete, false);
  }
});

test('reader failure is sticky and reader-side caps reject oversized or non-JSON snapshots', async () => {
  const failed = createPageProvider({readJournal: () => { throw Error('collector unavailable'); }});
  await assert.rejects(failed.read(), /collector unavailable/);
  const value = sample(); value.state.secret = 'x'.repeat(500);
  await assert.rejects(createPageProvider({readJournal: () => value, maxBytes:300}).read(), /overflow|cap/i);
  value.state = {invalid:NaN};
  await assert.rejects(createPageProvider({readJournal: () => value}).read(), /JSON|finite/i);
});

test('overlapping page reads cannot race a failed or stale snapshot into acceptance', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const page = createPageProvider({readJournal: () => pending});
  const first = page.read();
  const secondRejected = assert.rejects(page.read(), /overlap|concurrent/i);
  release(sample());
  await secondRejected;
  await assert.rejects(first, /overlap|concurrent/i);
  await assert.rejects(page.read(), /overlap|concurrent/i);
});

test('focusin alone cannot move established non-body focus to another element', async () => {
  const f = fixture(); f.focus('field-a');
  const page = createPageProvider({readJournal: () => f.journal.read()});
  await page.read();
  f.focus('field-b'); f.journal.record('focusin', {target:'field-b'});
  await assert.rejects(page.read(), /focusout|ambiguous focus/i);
  await assert.rejects(page.read(), /focusout|ambiguous focus/i, 'the gap remains sticky');
});

test('a missing focusout within one batch cannot be hidden by endpoint recovery', async () => {
  const f = fixture(); f.focus('field-a');
  f.journal.record('keydown', {key:'Tab',shift:false,target:'field-a'});
  f.focus('field-b'); f.journal.record('focusin', {target:'field-b'});
  f.focus('field-a'); f.journal.record('focusin', {target:'field-a'});
  const page = createPageProvider({readJournal: () => f.journal.read()});
  await assert.rejects(page.read(), /focusout|ambiguous focus/i);
});

test('legitimate initial focus from observed body needs no synthetic body focusout', async () => {
  const f = fixture(), page = createPageProvider({readJournal: () => f.journal.read()});
  await page.read();
  f.focus('field-a'); f.journal.record('focusin', {target:'field-a'});
  assert.equal((await page.read()).complete, true);
  f.focus('field-b'); f.journal.record('focusin', {target:'field-b'});
  await assert.rejects(page.read(), /focusout|ambiguous focus/i, 'initial-body allowance does not persist on field-a');
});

test('a complete focusout/focusin pair is accepted even when split across reads', async () => {
  for (const duringBlur of ['body','field-a','field-b']) {
    const f = fixture(); f.focus('field-a');
    const page = createPageProvider({readJournal: () => f.journal.read()});
    await page.read();
    f.focus(duringBlur); f.journal.record('focusout', {target:'field-a'});
    await page.read();
    f.focus('field-b'); f.journal.record('focusin', {target:'field-b'});
    const read = await page.read();
    assert.equal(read.complete,true); assert.equal(read.active,'field-b');
    assert.deepEqual(read.events.map(e=>e.type), ['focusout','focusin']);
  }
});

test('first-read focusin without a prior active-element observation is ambiguous', async () => {
  const f = fixture(); f.focus('field-a'); f.journal.record('focusin', {target:'field-a'});
  await assert.rejects(createPageProvider({readJournal: () => f.journal.read()}).read(), /ambiguous focus|focus baseline/i);
});

test('exact review reproduction: focusout(A) observed at B cannot authorize focusin(C)', async () => {
  const f = fixture(), page = createPageProvider({readJournal: () => f.journal.read()});
  await page.read();
  f.focus('A'); f.journal.record('focusin', {target:'A'});
  assert.equal((await page.read()).complete,true);
  f.focus('B'); f.journal.record('focusout', {target:'A'});
  assert.equal((await page.read()).complete,true);
  f.focus('C'); f.journal.record('focusin', {target:'C'});
  let original;
  await assert.rejects(page.read(), error => { original = error; return /focus.*destination|unrelated focusin/i.test(error.message); });
  // Even an apparently coherent next event cannot repair already missing evidence.
  f.focus('B'); f.journal.record('focusin', {target:'B'});
  await assert.rejects(page.read(), error => error === original);
});

for (const duringBlur of ['A','body','B']) {
  for (const split of [false,true]) {
    test(`focusout.active=${duringBlur}, split reads=${split}: coherent B is accepted and release is consumed`, async () => {
      const f = fixture(), page = createPageProvider({readJournal: () => f.journal.read()});
      await page.read();
      f.focus('A'); f.journal.record('focusin',{target:'A'}); await page.read();
      f.focus(duringBlur); f.journal.record('focusout',{target:'A'});
      if (split) await page.read();
      f.focus('B'); f.journal.record('focusin',{target:'B'});
      const result = await page.read();
      assert.equal(result.complete,true); assert.equal(result.active,'B');
      assert.deepEqual(result.events.map(e=>[e.type,e.target]), [['focusin','A'],['focusout','A'],['focusin','B']]);
      f.focus('C'); f.journal.record('focusin',{target:'C'});
      await assert.rejects(page.read(), /missing focusout/i);
      await assert.rejects(page.read(), /missing focusout/i);
    });
  }
}

for (const destination of ['A','C','body']) {
  test(`a pending explicit destination B cannot be redirected to ${destination} within one batch`, async () => {
    const f = fixture(), page = createPageProvider({readJournal: () => f.journal.read()});
    await page.read();
    f.focus('A'); f.journal.record('focusin',{target:'A'}); await page.read();
    f.focus('B'); f.journal.record('focusout',{target:'A'});
    f.focus(destination); f.journal.record('focusin',{target:destination});
    await assert.rejects(page.read(), /focus.*destination|unrelated focusin/i);
    await assert.rejects(page.read(), /focus.*destination|unrelated focusin/i);
  });
}
