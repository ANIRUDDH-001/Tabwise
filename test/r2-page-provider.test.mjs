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

// R2-L1: offline page-journal compatibility adapter (docs/engineering/Tabwise-worker-binding-blocker.md).
// Synthetic cumulative sources only; the five lanes mirror qualification-evidence.mjs:4.
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as journalModule from '../src/r2/page-journal.mjs';
import {pageAck, VK} from '../src/speech/sendguard.mjs';
import {createQualificationWriter, verifyQualificationArtifact} from '../scripts/tabwise/qualification-evidence.mjs';

const {createPageJournal} = journalModule;
const LANES = ['events','intents','focus','page','acks'];
const FLAGS = {shift:false, ctrl:false, alt:false, meta:false, repeat:false};
const nvda = (id, ...vks) => ({id, info:{path:'nvda', keys:vks.map(vk => ({vk}))}});
function journalSource() {
  const raw = {session:'synthetic-journal', complete:true, clock:'page-monotonic-ms', t:100, active:'body', state:{},
    event_count:0, overflow:false, dropped:0, events:[]};
  let reads = 0;
  const f = {raw, edit:null, pending:null, reads:() => reads};
  f.add = (type, detail = {}) => {
    raw.t += 1;
    const event = {seq:raw.events.length + 1, t:raw.t, type, target:detail.target ?? raw.active, active:raw.active, ...detail};
    raw.active = event.active; raw.events.push(event); raw.event_count = raw.events.length;
  };
  f.focus = target => f.add('focusin', {target, active:target});
  f.key = (key, flags = {}) => f.add('keydown', {key, ...FLAGS, ...flags});
  f.source = {read() {
    reads++;
    if (f.pending) return f.pending;
    const value = structuredClone(raw); f.edit?.(value); return value;
  }};
  return f;
}
const keydowns = events => events.filter(e => e.type === 'keydown').map(({seq,key,shift}) => ({seq,key,shift}));
const call = (j, view) => view === 'snapshot' ? j.snapshot() : j.keys(0);
async function refusesForever(j, pattern, f) {
  await assert.rejects(j.snapshot(), pattern);
  if (f) f.edit = null;
  await assert.rejects(j.snapshot(), pattern, 'a later valid read cannot recover');
  await assert.rejects(j.keys(0), pattern, 'the other view stays failed too');
}

test('J-P1 one journal state is accepted by createPageProvider and gives the matching keydown view', async () => {
  const f = journalSource(), journal = createPageJournal({source:f.source});
  const page = createPageProvider({readJournal:() => journal.snapshot()});
  assert.equal((await page.read()).active, 'body');
  f.focus('field'); f.key('Tab'); f.key('Tab', {shift:true}); f.key(' ');
  const read = await page.read();
  assert.equal(read.complete, true); assert.equal(read.active, 'field');
  assert.deepEqual(read.events.map(e => e.type), ['focusin','keydown','keydown','keydown']);
  assert.deepEqual(await journal.keys(0), keydowns(read.events));
  assert.deepEqual(await journal.keys(0), [{seq:2,key:'Tab',shift:false},{seq:3,key:'Tab',shift:true},{seq:4,key:' ',shift:false}]);
  assert.deepEqual(await journal.keys(3), [{seq:4,key:' ',shift:false}]);
});

test('J-P2 the frozen pageAck over keys confirms Tab, Shift+Tab and Space and ignores a Control keydown', async () => {
  const f = journalSource(), journal = createPageJournal({source:f.source});
  await journal.snapshot(); f.focus('field');
  const ack = pageAck({read:cursor => journal.keys(cursor), ackMs:1000});
  for (const [token, press] of [
    [nvda('t1', VK.Tab), () => f.key('Tab')],
    [nvda('t2', VK.Shift, VK.Tab), () => f.key('Tab', {shift:true})],
    [nvda('t3', VK.Space), () => { f.key('Control'); f.key(' '); }],
  ]) {
    assert.deepEqual(await ack.before(token), []);
    press();
    assert.deepEqual(await ack(token), {ack:true, reasons:[]});
  }
  f.key('Control');
  assert.deepEqual(await ack.final(), []);
});

test('J-P3 interleaved snapshot and keys calls read once each and stay consistent and append-only', async () => {
  const f = journalSource(), journal = createPageJournal({source:f.source});
  let previous = (await journal.snapshot()).events, reads = f.reads();
  f.focus('field');
  const mutate = () => { f.add('mutation', {attribute:'aria-live', target:'status'}); f.raw.state.live = f.raw.t; };
  for (const step of [() => f.key('Tab'), mutate, () => f.key('Tab', {shift:true}), () => f.key('Enter')]) {
    step();
    const keys = await journal.keys(0);
    assert.equal(f.reads(), ++reads, 'keys() performs exactly one source read');
    const snap = await journal.snapshot();
    assert.equal(f.reads(), ++reads, 'snapshot() performs exactly one source read');
    assert.deepEqual(snap.events.slice(0, previous.length), previous);
    assert.deepEqual(keydowns(snap.events), keys);
    previous = snap.events;
  }
  assert.equal(previous.length, 5);
});

test('J-P4 the adapter writes page-lane entries only, also through the real qualification writer', async () => {
  const entries = [];
  const writer = {append(name, entry) { if (!LANES.includes(name)) throw Error('unknown qualification journal'); entries.push([name, entry]); }};
  const f = journalSource(), journal = createPageJournal({source:f.source, writer});
  await journal.snapshot(); f.key('Tab'); await journal.keys(0);
  assert.deepEqual(entries, [
    ['page', {phase:'r2-journal', view:'snapshot', cursor:null, seq_max:0, complete:true, errors:[]}],
    ['page', {phase:'r2-journal', view:'keys', cursor:0, seq_max:1, complete:true, errors:[]}],
  ]);
  const base = mkdtempSync(join(tmpdir(), 'r2-l1-')), dir = join(base, 'q');
  try {
    const real = createQualificationWriter(dir, {test:'r2-l1'});
    const g = journalSource(), journal2 = createPageJournal({source:g.source, writer:real});
    await journal2.snapshot(); g.key('Tab'); await journal2.keys(0); await journal2.snapshot();
    real.finish({synthetic:true});
    assert.deepEqual(verifyQualificationArtifact(dir), {ok:true, errors:[]});
    const lines = name => readFileSync(join(dir, `${name}.jsonl`), 'utf8').split('\n').filter(Boolean);
    assert.equal(lines('page').length, 3);
    for (const name of LANES.filter(n => n !== 'page')) assert.equal(lines(name).length, 0, `${name} lane untouched`);
  } finally { rmSync(base, {recursive:true, force:true}); }
});

for (const [name, change, pattern] of [
  ['complete:false', v => { v.complete = false; }, /page journal: journal incomplete/],
  ['missing complete', v => { delete v.complete; }, /page journal: journal incomplete/],
  ['overflow:true', v => { v.overflow = true; }, /page journal: journal overflow/],
  ['missing overflow', v => { delete v.overflow; }, /page journal: journal overflow/],
  ['missing event_count', v => { delete v.event_count; }, /page journal: journal event_count/],
  ['mismatched event_count', v => { v.event_count = 2; }, /page journal: journal event_count/],
  ['nonzero dropped', v => { v.dropped = 1; }, /page journal: journal dropped/],
  ['missing dropped', v => { delete v.dropped; }, /page journal: journal dropped/],
]) for (const view of ['snapshot','keys']) test(`J-N1 ${name} is refused by ${view} and pageAck, and stays refused`, async () => {
  const f = journalSource(); f.key('Tab'); f.edit = change;
  const journal = createPageJournal({source:f.source});
  await assert.rejects(call(journal, view), pattern);
  f.edit = null;
  const reads = f.reads();
  const ack = pageAck({read:cursor => journal.keys(cursor), ackMs:1000});
  const reasons = await ack.before(nvda('t1', VK.Tab));
  assert.equal(reasons.length, 1); assert.match(reasons[0], /page key log unreadable/); assert.match(reasons[0], pattern);
  await refusesForever(journal, pattern);
  assert.equal(f.reads(), reads, 'a sticky failure performs no further source reads');
});

for (const [name, change] of [
  ['a gap', v => { v.events[1].seq = 3; }],
  ['a duplicate', v => { v.events[1].seq = 1; }],
  ['a start other than 1', v => { v.events.forEach(e => { e.seq += 1; }); }],
]) test(`J-N2 sequence ${name} is refused and sticky`, async () => {
  const f = journalSource(); f.key('Tab'); f.key('Enter'); f.edit = change;
  await refusesForever(createPageJournal({source:f.source}), /page journal: journal sequence/, f);
});

for (const [name, change] of [
  ['a t regression', v => { v.events[1].t = v.events[0].t - 1; }],
  ['an event t after the snapshot t', v => { v.t = v.events[1].t - 1; }],
  ['a non-finite t', v => { v.events[0].t = '101'; }],
]) test(`J-N2 event time with ${name} is refused and sticky`, async () => {
  const f = journalSource(); f.key('Tab'); f.key('Enter'); f.edit = change;
  await refusesForever(createPageJournal({source:f.source}), /page journal: journal event time/, f);
});

for (const cursor of [-1, 2, 0.5, '0', null, Number.MAX_SAFE_INTEGER + 1]) test(`J-N2 cursor ${String(cursor)} out of range is refused and sticky`, async () => {
  const f = journalSource(); f.key('Tab');
  const journal = createPageJournal({source:f.source});
  await assert.rejects(journal.keys(cursor), /page journal: cursor out of range/);
  await refusesForever(journal, /page journal: cursor out of range/);
});

for (const [name, change, pattern] of [
  ['an earlier event changed', v => { v.events[0].key = 'Enter'; }, /page journal: journal history rewritten/],
  ['a shrinking count', v => { v.events.pop(); v.event_count -= 1; }, /page journal: journal shrank/],
  ['a session change', v => { v.session = 'other-session'; }, /page journal: journal session or clock changed/],
  ['a clock change', v => { v.clock = 'node-monotonic-ms'; }, /page journal: journal clock/],
]) test(`J-N3 history: ${name} between snapshot() and keys() is refused and sticky`, async () => {
  const f = journalSource(); f.key('Tab'); f.key('Enter');
  const journal = createPageJournal({source:f.source});
  await journal.snapshot();
  f.edit = change;
  await assert.rejects(journal.keys(0), pattern);
  await refusesForever(journal, pattern, f);
});

test('J-N3 history: a source that rewrites its own returned object in place is still detected', async () => {
  const f = journalSource(); f.key('Tab');
  const live = structuredClone(f.raw), journal = createPageJournal({source:{read: () => live}});
  await journal.snapshot();
  live.events[0].key = 'Enter';
  await refusesForever(journal, /page journal: journal history rewritten/);
});

for (const [name, build, pattern] of [
  ['a raw focus type', f => f.add('focus', {target:'field', active:'field'}), /page journal: raw focus event refused/],
  ['focusin target !== active', f => f.add('focusin', {target:'a', active:'b'}), /page journal: focusin target differs from active/],
  ['a missing event active', f => { f.key('Tab'); f.edit = v => { delete v.events[0].active; }; }, /page journal: event active element missing/],
  ['a missing snapshot active', f => { f.key('Tab'); f.edit = v => { delete v.active; }; }, /page journal: malformed journal/],
  // Refused only by the reused createPageProvider, so the adapter must route every read through it.
  ['an active change without a focus event', f => { f.raw.active = 'field'; }, /page provider: page snapshot missing focus event/],
]) test(`J-N4 focus: ${name} is refused, never renamed or inferred`, async () => {
  const f = journalSource(), journal = createPageJournal({source:f.source});
  await journal.snapshot(); build(f);
  await refusesForever(journal, pattern, f);
});

for (const [name, flags, pattern] of [
  ...['shift','ctrl','alt','meta','repeat'].map(flag => [`missing ${flag}`, {[flag]:undefined}, /page journal: keydown modifier flag missing or non-boolean/]),
  ...['ctrl','alt','meta','repeat'].map(flag => [`${flag}:true`, {[flag]:true}, /page journal: keydown modifier or repeat/]),
  ['non-boolean shift', {shift:'false'}, /page journal: keydown modifier flag missing or non-boolean/],
  ['an empty key', {key:''}, /page journal: keydown key empty/],
  ['target !== active', {target:'elsewhere'}, /page journal: keydown target differs from active/],
]) test(`J-N5 modifiers: keydown with ${name} is refused and sticky`, async () => {
  const f = journalSource(), journal = createPageJournal({source:f.source});
  await journal.snapshot(); f.key('Tab', flags);
  for (const [k, v] of Object.entries(flags)) if (v === undefined) delete f.raw.events.at(-1)[k];
  await refusesForever(journal, pattern);
});

test('J-N6 event and byte caps are refused; a journal at the cap is accepted', async () => {
  const f = journalSource(); f.key('Tab'); f.key('Tab'); f.key('Tab');
  assert.equal((await createPageJournal({source:f.source, maxEvents:3}).snapshot()).events.length, 3);
  await refusesForever(createPageJournal({source:f.source, maxEvents:2}), /page journal: journal event cap/);
  const g = journalSource(); g.raw.state.text = 'x'.repeat(500);
  await refusesForever(createPageJournal({source:g.source, maxBytes:400}), /page journal: journal byte cap/);
});

test('J-N7 a stray non-ignored keydown before a send is reported by pageAck.before over keys', async () => {
  const f = journalSource(), journal = createPageJournal({source:f.source});
  await journal.snapshot(); f.focus('field');
  const ack = pageAck({read:cursor => journal.keys(cursor), ackMs:1000});
  f.key('Control'); f.key('Enter');
  assert.deepEqual(await ack.before(nvda('t1', VK.Tab)), ['page key "Enter" before send t1']);
});

for (const view of ['snapshot','keys']) test(`J-N8 a throwing writer fails ${view} with no data and stays failed`, async () => {
  let broken = true;
  const writer = {append() { if (broken) throw Error('disk full'); }};
  const f = journalSource(); f.key('Tab');
  const journal = createPageJournal({source:f.source, writer});
  await assert.rejects(call(journal, view), /page journal: evidence writer failed: disk full/);
  broken = false;
  await refusesForever(journal, /page journal: evidence writer failed/);
});

test('J-N9 page-journal.mjs imports only ./page-provider.mjs', () => {
  const text = readFileSync(new URL('../src/r2/page-journal.mjs', import.meta.url), 'utf8');
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.deepEqual([...code.matchAll(/\b(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g)].map(m => m[1]), ['./page-provider.mjs']);
  assert.equal(/\bimport\s*\(/.test(code), false, 'no dynamic import');
  assert.equal(/\brequire\s*\(|\bprocess\b|\bglobalThis\b/.test(code), false, 'no require, process or globalThis');
  assert.equal(/^\s*import\s+['"]/m.test(code), false, 'no side-effect import');
});

test('J-N10 the adapter exposes only snapshot and keys, and the module only createPageJournal', () => {
  assert.deepEqual(Object.keys(journalModule), ['createPageJournal']);
  const journal = createPageJournal({source:journalSource().source});
  assert.equal(Object.isFrozen(journal), true);
  assert.deepEqual(Object.keys(journal).sort(), ['keys','snapshot']);
  for (const name of ['guard','execute','press','release']) assert.equal(name in journal, false);
});

for (const [first, second] of [['snapshot','keys'],['keys','snapshot']]) test(`J-N11 a pending ${first}() overlapped by ${second}() fails both and stays failed`, async () => {
  const f = journalSource(); let release;
  f.pending = new Promise(resolve => { release = resolve; });
  const journal = createPageJournal({source:f.source});
  const pending = call(journal, first);
  await assert.rejects(call(journal, second), /page journal: overlapping reads/);
  f.pending = null; release(structuredClone(f.raw));
  await assert.rejects(pending, /page journal: overlapping reads/);
  await refusesForever(journal, /page journal: overlapping reads/);
});

for (const fault of ['reject','throw']) for (const view of ['snapshot','keys']) test(`J-N11 a source.read() ${fault} fails ${view} and stays failed`, async () => {
  const source = {read() { if (fault === 'throw') throw Error('collector gone'); return Promise.reject(Error('collector gone')); }};
  const journal = createPageJournal({source});
  await assert.rejects(call(journal, view), /page journal: source read failed: collector gone/);
  await refusesForever(journal, /page journal: source read failed/);
});

// R2-L1 review correction: asynchronous writers. A writer's promise is part of the call, never
// fire-and-forget evidence; its rejection must latch, and no rejection may go unhandled.
async function withoutUnhandled(run) {
  const seen = [], onUnhandled = reason => seen.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try { await run(); await new Promise(resolve => setImmediate(resolve)); }
  finally { process.off('unhandledRejection', onUnhandled); }
  assert.deepEqual(seen, [], 'no unhandled writer rejection');
}

for (const view of ['snapshot','keys']) test(`J-N8 an asynchronously rejecting writer fails ${view} with no data and stays failed`, () => withoutUnhandled(async () => {
  let broken = true;
  const writer = {append: async () => { if (broken) throw Error('async disk full'); }};
  const f = journalSource(); f.key('Tab');
  const journal = createPageJournal({source:f.source, writer});
  const error = await call(journal, view).then(() => assert.fail('view returned data despite a rejected write'), e => e);
  assert.match(error.message, /page journal: evidence writer failed: async disk full/);
  broken = false;
  const reads = f.reads();
  await refusesForever(journal, /page journal: evidence writer failed/);
  assert.equal(f.reads(), reads, 'the latched failure performs no further source reads');
  assert.equal(error.cause?.message, 'async disk full', 'the rejected diagnostic write is handled and kept as the cause');
}));

test('J-P4 an asynchronously resolving writer completes before the view returns', async () => {
  const entries = [];
  const writer = {append: (name, entry) => new Promise(resolve => setImmediate(() => { entries.push([name, entry.view]); resolve(); }))};
  const f = journalSource(), journal = createPageJournal({source:f.source, writer});
  await journal.snapshot(); assert.deepEqual(entries, [['page','snapshot']]);
  f.key('Tab'); assert.deepEqual(await journal.keys(0), [{seq:1,key:'Tab',shift:false}]);
  assert.deepEqual(entries, [['page','snapshot'],['page','keys']]);
});

for (const [first, second] of [['snapshot','keys'],['keys','snapshot']]) test(`J-N11 a pending asynchronous ${first}() write lets no overlapping ${second}() succeed`, () => withoutUnhandled(async () => {
  let finish, writes = 0;
  const writer = {append: () => { writes++; return writes === 1 ? new Promise(resolve => { finish = resolve; }) : undefined; }};
  const f = journalSource(); f.key('Tab');
  const journal = createPageJournal({source:f.source, writer});
  const pending = call(journal, first);
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.reads(), 1);
  await assert.rejects(call(journal, second), /page journal: overlapping reads/);
  assert.equal(f.reads(), 1, 'the refused overlap performs no source read');
  finish();
  await assert.rejects(pending, /page journal: overlapping reads/, 'a write completing later cannot release data');
  await refusesForever(journal, /page journal: overlapping reads/);
}));
