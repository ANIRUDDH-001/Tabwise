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

// ---- R2-L2 S1: runner-owned page recorder (design §3.2-§3.4) ----
// A minimal DOM shim written here (no installs). The recorder runs from its own source text in a fresh vm
// context, exactly as addInitScript serializes it, so any reference outside its body would fail here.
import vm from 'node:vm';
import {installR2PageRecorder} from '../src/r2/page-recorder.mjs';
import {createR2PageSource, serializePageViews, SHIFT_PENDING_MS} from '../src/r2/page-source.mjs';

const RECORDER_SELECTORS = {
  'dialog[open], [role=dialog]:not([hidden]), [role=alertdialog]:not([hidden])': n => (n.localName === 'dialog' && n.has('open')) ||
    (['dialog','alertdialog'].includes(n.attrs.get('role')) && !n.has('hidden')),
  '[aria-invalid="true"]': n => n.attrs.get('aria-invalid') === 'true',
  '[role=alert],[role=status],[role=log],[aria-live]': n => ['alert','status','log'].includes(n.attrs.get('role')) || n.has('aria-live'),
};
function domShim({title = 'Drafts 0a1b2c3d', href = 'http://127.0.0.1:4100/index.html'} = {}) {
  let clock = 1000, active = null, observerQueue = [], observerCallback = null;
  const listeners = [];
  class Node { constructor(nodeName) { this.nodeName = nodeName; this.text = ''; } get textContent() { return this.text; } }
  class Element extends Node {
    constructor(localName, id = '') { super(localName.toUpperCase()); this.localName = localName; this.id = id; this.attrs = new Map(); }
    getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
    has(name) { return this.attrs.has(name); }
  }
  class Document {
    get activeElement() { return active ?? this.body; }
    get title() { return this.titleText; }
    querySelectorAll(selector) {
      const match = RECORDER_SELECTORS[selector];
      if (!match) throw Error(`shim: unexpected selector ${selector}`);
      return this.nodes.filter(match);
    }
  }
  class MutationObserver {
    constructor(callback) { observerCallback = callback; }
    observe(target, options) { this.observed = {target, options}; }
    takeRecords() { const out = observerQueue; observerQueue = []; return out; }
  }
  const document = new Document();
  document.documentElement = new Element('html'); document.body = new Element('body');
  document.nodes = []; document.titleText = title;
  const queue = record => observerQueue.push({attributeName: null, addedNodes: [], removedNodes: [], ...record});
  const context = vm.createContext({
    document, Document, Element, Node, MutationObserver, TextEncoder, structuredClone,
    location: {href}, performance: {now: () => clock},
    addEventListener: (type, fn, options) => listeners.push({type, fn, options}),
  });
  const dispatch = (type, fields) => { for (const l of listeners) if (l.type === type) l.fn({type, isTrusted: true, ...fields}); };
  return {
    context, document, listeners,
    tick: (n = 1) => { clock += n; }, setClock: value => { clock = value; },
    run: code => vm.runInContext(code, context),
    install: config => vm.runInContext(`(${installR2PageRecorder.toString()})(${JSON.stringify(config)})`, context),
    read: () => vm.runInContext('__tabwiseR2Journal()', context),
    add(localName, id = '', attrs = {}, text = '') {
      const node = new Element(localName, id);
      for (const [k, v] of Object.entries(attrs)) node.attrs.set(k, v);
      node.text = text; document.nodes.push(node);
      queue({type: 'childList', target: document.body, addedNodes: [node]});
      return node;
    },
    remove(node) {
      document.nodes = document.nodes.filter(n => n !== node);
      if (active === node) active = null;
      queue({type: 'childList', target: document.body, removedNodes: [node]});
    },
    attr(node, name, value) {
      if (value === null) node.attrs.delete(name); else node.attrs.set(name, value);
      queue({type: 'attributes', target: node, attributeName: name});
    },
    text(node, value) { node.text = value; queue({type: 'childList', target: node, addedNodes: [{}], removedNodes: [{}]}); },
    deliver() { const records = observerQueue; observerQueue = []; observerCallback(records); },
    focus(node) {
      clock += 1;
      const old = active;
      if (old) { active = null; dispatch('focusout', {target: old, relatedTarget: node}); }
      active = node; dispatch('focusin', {target: node, relatedTarget: old});
    },
    key(key, flags = {}) {
      clock += 1;
      dispatch('keydown', {target: active ?? document.body, key, code: key, location: 0, shiftKey: false, ctrlKey: false,
        altKey: false, metaKey: false, repeat: false, ...flags});
    },
  };
}
const recorderSource = dom => ({read: () => dom.read()});

test('S1-P1 a focus, Tab, Enter and mutation-backed journey is accepted unchanged by createPageJournal', async () => {
  const dom = domShim(); dom.install({session: 'page-s1'});
  const email = dom.add('input', 'email'), submit = dom.add('button', 'submit'), status = dom.add('div', 'status', {role: 'status'});
  const journal = createPageJournal({source: recorderSource(dom)});
  const first = await journal.snapshot();
  assert.equal(first.active, 'body'); assert.equal(first.complete, true);
  dom.focus(email); dom.key('Tab'); dom.focus(submit); dom.key('Enter');
  dom.attr(email, 'aria-invalid', 'true'); dom.text(status, 'Enter your email address'); dom.deliver();
  const read = await journal.snapshot();
  assert.deepEqual(read.events.map(e => e.type), ['mutation','mutation','mutation','focusin','keydown','focusout','focusin','keydown','mutation','mutation']);
  assert.equal(read.events.some(e => e.type === 'focus'), false, 'focus is never emitted');
  assert.equal(read.active, 'submit#3'); assert.equal(read.session, 'page-s1');
  assert.deepEqual(read.state, {dialogs: [], invalid: ['email#2'], live: [{target: 'status#1', role: 'status', aria_live: null, text: 'Enter your email address'}]});
  const keys = await journal.keys(0);
  assert.deepEqual(keys.map(({key, shift}) => [key, shift]), [['Tab', false], ['Enter', false]]);
  const tab = read.events.find(e => e.type === 'keydown');
  assert.deepEqual(Object.keys(tab).sort(), ['active','alt','code','ctrl','element','isTrusted','key','location','meta','repeat','seq','shift','t','target','type']);
  assert.deepEqual([tab.target, tab.element, tab.isTrusted], ['email#2', 'email', true]);
  const out = read.events.find(e => e.type === 'focusout');
  assert.deepEqual([out.target, out.related, out.active], ['email#2', 'submit#3', 'body']);
  assert.deepEqual(dom.listeners.map(l => [l.type, l.options.capture, l.options.passive]),
    [['keydown', true, true], ['focusin', true, true], ['focusout', true, true]]);
});

test('S1-P2 a same-id clone gets a new identity; the bare id is kept as element', () => {
  const dom = domShim(); dom.install({session: 'page-s1'});
  const close = dom.add('button', 'close');
  dom.focus(close);
  const before = dom.read();
  dom.remove(close); const clone = dom.add('button', 'close'); dom.focus(clone);
  const after = dom.read();
  const ins = after.events.filter(e => e.type === 'focusin');
  assert.equal(ins.length, 2);
  assert.notEqual(ins[0].target, ins[1].target);
  assert.deepEqual(ins.map(e => e.element), ['close', 'close']);
  assert.equal(before.active, ins[0].target); assert.equal(after.active, ins[1].target);
});

test('S1-P3 takeRecords flushes pending mutations before state, so the provider accepts the state change', async () => {
  const dom = domShim(); dom.install({session: 'page-s1'});
  const dialog = dom.add('div', 'dlg', {role: 'dialog', hidden: ''});
  const journal = createPageJournal({source: recorderSource(dom)});
  assert.deepEqual((await journal.snapshot()).state.dialogs, []);
  dom.tick(); dom.attr(dialog, 'hidden', null); // no deliver(): only the read's takeRecords() can surface it
  const read = await journal.snapshot();
  assert.deepEqual(read.state.dialogs, ['dlg#1']);
  const last = read.events.at(-1);
  assert.deepEqual([last.type, last.mutation, last.attribute, last.target], ['mutation', 'attributes', 'hidden', 'dlg#1']);
  assert.ok(last.t <= read.t);
});

test('S1-P4 page_reported is a separate, bounded copy of the fixture recorder and never enters events', () => {
  const dom = domShim(); dom.install({session: 'page-s1'});
  dom.run(`globalThis.__r2Events = [{type: 'focus', id: 'email'}, {type: 'app', name: 'saved'}];`);
  const read = dom.read();
  assert.deepEqual(read.page_reported, [{type: 'focus', id: 'email'}, {type: 'app', name: 'saved'}]);
  assert.equal(read.page_reported_overflow, false); assert.equal(read.events.length, 0);
  dom.run(`globalThis.__r2Events = ['x'.repeat(70000)];`);
  const big = dom.read();
  assert.deepEqual([big.page_reported, big.page_reported_overflow], [null, true]);
  dom.run(`globalThis.__r2Events = {toJSON() { throw Error('page getter'); }};`);
  const broken = dom.read();
  assert.deepEqual([broken.page_reported, broken.page_reported_overflow], [null, true]);
});

for (const [name, setup] of [
  ['the event cap', dom => { dom.install({session: 'page-s1', maxEvents: 2}); dom.key('Tab'); dom.key('Tab'); dom.key('Tab'); }],
  ['the byte cap', dom => { dom.install({session: 'page-s1', maxBytes: 400}); dom.key('Tab'); dom.key('Tab'); }],
  ['a clock regression', dom => { dom.install({session: 'page-s1'}); dom.key('Tab'); dom.setClock(5); dom.key('Tab'); dom.setClock(5000); }],
]) test(`S1-N1 ${name} drops and counts the event and the adapter refuses the read`, async () => {
  const dom = domShim(); setup(dom);
  const raw = dom.read();
  assert.equal(raw.complete, false); assert.equal(raw.dropped, 1); assert.equal(raw.event_count, raw.events.length);
  assert.equal(raw.reasons.length, 1);
  await refusesForever(createPageJournal({source: recorderSource(dom)}), /page journal: journal incomplete/);
});

test('S1-N1 after an overflow every later event is dropped and counted; nothing is compacted', () => {
  const dom = domShim(); dom.install({session: 'page-s1', maxEvents: 1});
  dom.key('Tab'); dom.key('Tab'); dom.key('Enter'); dom.key('Enter');
  const raw = dom.read();
  assert.deepEqual([raw.events.length, raw.dropped, raw.overflow, raw.reasons], [1, 3, true, ['page capture overflow']]);
});

for (const [name, build] of [
  ['17 live regions', dom => { for (let i = 0; i < 17; i++) dom.add('div', `s${i}`, {role: 'alert'}); }],
  ['17 open dialogs', dom => { for (let i = 0; i < 17; i++) dom.add('dialog', `d${i}`, {open: ''}); }],
  ['17 invalid fields', dom => { for (let i = 0; i < 17; i++) dom.add('input', `f${i}`, {'aria-invalid': 'true'}); }],
  ['a 513-unit live text', dom => { dom.add('div', 'live', {'aria-live': 'polite'}, 'x'.repeat(513)); }],
]) test(`S1-N2 ${name} sets state_overflow with a null state and is refused, never truncated`, async () => {
  const dom = domShim(); dom.install({session: 'page-s1'}); build(dom);
  const raw = dom.read();
  assert.deepEqual([raw.state, raw.state_overflow], [null, true]);
  await refusesForever(createPageJournal({source: recorderSource(dom)}), /page journal: malformed journal/);
});

test('S1-N2 exactly 16 entries and 512-unit live text are within the state bounds', () => {
  const dom = domShim(); dom.install({session: 'page-s1'});
  for (let i = 0; i < 15; i++) dom.add('div', `s${i}`, {role: 'status'});
  dom.add('div', 'last', {'aria-live': 'assertive'}, 'y'.repeat(512));
  const raw = dom.read();
  assert.equal(raw.state_overflow, false); assert.equal(raw.state.live.length, 16);
});

test('S1-N3 page code cannot overwrite, delete or redefine the recorder globals, or patch captured primitives', () => {
  const dom = domShim(); dom.install({session: 'page-s1'});
  const field = dom.add('input', 'field'); dom.focus(field); dom.key('Tab');
  const before = dom.read();
  dom.run(`__tabwiseR2Journal = () => ({forged: true}); __tabwiseR2App = null;`);
  assert.equal(dom.run(`delete globalThis.__tabwiseR2Journal`), false);
  assert.throws(() => dom.run(`'use strict'; __tabwiseR2Journal = () => ({})`), /read.only|Cannot assign/);
  assert.throws(() => dom.run(`Object.defineProperty(globalThis, '__tabwiseR2Journal', {value: () => ({})})`), /redefine|Cannot/);
  assert.equal(dom.run(`Object.getOwnPropertyDescriptor(globalThis, '__tabwiseR2Journal').configurable`), false);
  assert.equal(dom.run(`Object.getOwnPropertyDescriptor(globalThis, '__tabwiseR2App').writable`), false);
  dom.run(`performance.now = () => 0; JSON.stringify = () => '{}'; structuredClone = v => ({forged: true});
    Object.defineProperty(Document.prototype, 'activeElement', {get() { return null; }});
    Object.defineProperty(Document.prototype, 'title', {get() { return 'forged'; }});
    MutationObserver.prototype.takeRecords = () => [];`);
  const after = dom.read();
  assert.equal(after.forged, undefined);
  assert.equal(after.active, before.active); assert.equal(after.title, before.title);
  assert.equal(after.t, before.t); assert.deepEqual(after.events, before.events);
  assert.throws(() => dom.install({session: 'again'}), /already installed/);
});

test('S1-N4 an app event is labelled page-authored and never becomes a key, focus or state change', async () => {
  const dom = domShim(); dom.install({session: 'page-s1'});
  const journal = createPageJournal({source: recorderSource(dom)});
  const first = await journal.snapshot();
  dom.run(`__tabwiseR2App('saved', {type: 'keydown', key: 'Tab', seq: 1, active: 'field'})`);
  const read = await journal.snapshot();
  assert.deepEqual(read.events.map(e => [e.type, e.name, e.source, e.active]), [['app', 'saved', 'page-authored', 'body']]);
  assert.deepEqual(read.events[0].detail, {type: 'keydown', key: 'Tab', seq: 1, active: 'field'});
  assert.deepEqual(read.state, first.state); assert.equal(read.active, first.active);
  assert.deepEqual(await journal.keys(0), []);
  assert.throws(() => dom.run(`__tabwiseR2App('big', {x: 'z'.repeat(1100)})`), /within 1 KB/);
  assert.throws(() => dom.run(`__tabwiseR2App('', {})`), /invalid name/);
  assert.throws(() => dom.run(`__tabwiseR2App('cyclic', (() => { const o = {}; o.o = o; return o; })())`), /within 1 KB/);
  assert.equal(dom.read().events.length, 1, 'refused app calls record nothing');
});

test('S1-N5 the recorder is one self-contained init-script function with the documented read shape', () => {
  const dom = domShim(); dom.install({session: 'page-s1'});
  const raw = dom.read();
  assert.deepEqual(Object.keys(raw).sort(), ['active','clock','complete','dropped','event_count','events','network_restrictions',
    'overflow','page_reported','page_reported_overflow','reasons','session','state','state_overflow','t','title','url']);
  assert.deepEqual([raw.clock, raw.title, raw.url, raw.network_restrictions], ['page-monotonic-ms', 'Drafts 0a1b2c3d', 'http://127.0.0.1:4100/index.html', false]);
  dom.run(`Object.defineProperty(globalThis, '__tabwiseNetworkRestricted', {value: true})`);
  assert.equal(dom.read().network_restrictions, true);
  assert.throws(() => domShim().install({session: ''}), /invalid session/);
  assert.throws(() => domShim().install({session: 'x', maxEvents: 0}), /invalid caps/);
  const code = readFileSync(new URL('../src/r2/page-recorder.mjs', import.meta.url), 'utf8');
  assert.deepEqual(code.match(/^export\s+\S+\s+\S+/gm), ['export function installR2PageRecorder(config)']);
  assert.equal(/^\s*import\b/m.test(code), false, 'the recorder module imports nothing');
  assert.equal(/'focus'|"focus"/.test(code), false, 'no raw focus listener');
});

import {createHash} from 'node:crypto';

// ---- R2-L2 S2: Node page source, key accounting and page-reads deltas (design §3.5, §4.3, §8.2) ----
const SERVED = {title: 'Drafts 0a1b2c3d', url: 'http://127.0.0.1:4100/index.html'};
const SHIFT_TAB = [VK.Shift, VK.Tab];
function pageSource({journey = [{action: 'a1', press: 'Shift+Tab'}], served = SERVED, writer} = {}) {
  const raw = {session: 'page-s2', complete: true, clock: 'page-monotonic-ms', t: 100, active: 'body', title: served.title,
    url: served.url, state: {dialogs: [], invalid: [], live: []}, state_overflow: false, event_count: 0, overflow: false,
    dropped: 0, events: [], page_reported: null, page_reported_overflow: false, reasons: [], network_restrictions: true};
  const lanes = {}, files = {}, returned = [];
  const h = {raw, lanes, files, returned, intents: [], now: 0, edit: null, evaluations: 0, delay: null};
  h.writer = writer ?? {
    append: (lane, record) => { (lanes[lane] ??= []).push(structuredClone(record)); },
    put: (name, text) => { if (name in files) throw Error(`${name} exists`); files[name] = text; },
  };
  h.add = (type, detail = {}) => {
    raw.t += 1;
    const event = {seq: raw.events.length + 1, t: raw.t, type, target: raw.active, active: raw.active, element: null, ...detail};
    if (['keydown','focusin','focusout'].includes(type) && !('isTrusted' in detail)) event.isTrusted = true;
    raw.active = event.active; raw.events.push(event); raw.event_count = raw.events.length;
  };
  h.key = (key, flags = {}) => h.add('keydown', {key, code: key, location: 0, ...FLAGS, ...flags});
  h.intent = (action, ...vks) => h.intents.push({action, keys: vks});
  h.source = createR2PageSource({
    evaluate: async fn => {
      assert.equal(typeof fn, 'function');
      h.evaluations++;
      if (h.delay) await h.delay();
      const value = structuredClone(raw); h.edit?.(value);
      returned.push({value, copy: structuredClone(value)});
      return value;
    },
    session: 'page-s2', served, journey, intents: () => h.intents, writer: h.writer, now: () => h.now,
  });
  h.journal = createPageJournal({source: h.source, writer: h.writer});
  h.views = serializePageViews(h.journal);
  h.reads = () => lanes['page-reads'] ?? [];
  return h;
}
async function refusedEverywhere(h, pattern) {
  await assert.rejects(h.journal.snapshot(), pattern);
  await assert.rejects(h.journal.keys(0), pattern);
  const ack = pageAck({read: cursor => h.views.keys(cursor), ackMs: 1000});
  const before = await ack.before({id: 1});
  assert.equal(before.length, 1); assert.match(before[0], /^page key log unreadable: /);
  for (const {value, copy} of h.returned) assert.deepEqual(value, copy, 'the raw evaluate result is never changed');
  const evaluated = h.evaluations;
  await assert.rejects(h.source.read(), pattern);
  assert.equal(h.evaluations, evaluated, 'a latched source performs no further evaluate');
}

test('S2-P1 a Shift in read k and its shifted Tab in read k+1 are accepted, with prefix observed', async () => {
  const h = pageSource();
  await h.journal.keys(0);
  h.intent('a1', ...SHIFT_TAB); h.key('Shift', {shift: true});
  h.now = 10; assert.deepEqual((await h.journal.keys(0)).map(k => k.key), ['Shift']);
  assert.deepEqual(h.source.pending(), {seq: 1, action: 'a1', observed_at: 10});
  h.key('Tab', {shift: true}); h.now = 20;
  assert.deepEqual(await h.journal.keys(0), [{seq: 1, key: 'Shift', shift: true}, {seq: 2, key: 'Tab', shift: true}]);
  assert.equal(h.source.pending(), null);
  assert.deepEqual(h.source.prefixes(), [{action: 'a1', seq: 2, prefix: 'observed'}]);
  assert.deepEqual(h.reads().at(-1).shift_prefix, [{action: 'a1', seq: 2, prefix: 'observed'}]);
  h.source.markFinal(); await h.journal.snapshot();
});

test('S2-P2 a Shift and its shifted Tab in one read pass through to frozen pageAck', async () => {
  const h = pageSource(), ack = pageAck({read: cursor => h.views.keys(cursor), ackMs: 1000});
  const token = nvda(1, ...SHIFT_TAB);
  h.intent('a1', ...SHIFT_TAB);
  assert.deepEqual(await ack.before(token), []);
  h.key('Shift', {shift: true}); h.key('Tab', {shift: true});
  assert.deepEqual(await ack(token), {ack: true, reasons: []});
  assert.deepEqual(h.source.prefixes(), [{action: 'a1', seq: 2, prefix: 'observed'}]);
  assert.deepEqual(await ack.final(), []);
});

test('S2-P3 a shifted Tab with no standalone Shift is accepted and recorded as not-observed', async () => {
  const h = pageSource();
  h.intent('a1', ...SHIFT_TAB); h.key('Tab', {shift: true});
  await h.journal.keys(0);
  assert.deepEqual(h.source.prefixes(), [{action: 'a1', seq: 1, prefix: 'not-observed'}]);
});

test('S2-P4 Tab, Enter and Space pass through untouched, with no prefix records', async () => {
  const journey = [{action: 'a1', press: 'Tab'}, {action: 'a2', press: 'Enter'}, {action: 'a3', press: 'Space'}];
  const h = pageSource({journey});
  h.intent('a1', VK.Tab); h.key('Tab'); await h.journal.keys(0);
  h.intent('a2', VK.Enter); h.key('Enter'); await h.journal.keys(1);
  h.intent('a3', VK.Space); h.key(' ');
  assert.deepEqual(await h.journal.keys(2), [{seq: 3, key: ' ', shift: false}]);
  assert.deepEqual(h.source.prefixes(), []); assert.equal(h.source.pending(), null);
});

const SHIFT = {shift: true};
for (const [name, journey, build, pattern] of [
  ['Control (ctrl:true) is refused with its seq', undefined, h => { h.intent('a1', ...SHIFT_TAB); h.key('Control', {ctrl: true}); }, /page source: Control keydown at seq 1 refused/],
  ['Insert is refused', undefined, h => { h.intent('a1', ...SHIFT_TAB); h.key('Insert'); }, /page source: Insert keydown at seq 1 refused/],
  ['a Shift with no intent', undefined, h => { h.key('Shift', SHIFT); }, /page source: Shift keydown at seq 1 refused/],
  ['a Shift during a Tab action', [{action: 'a1', press: 'Tab'}], h => { h.intent('a1', VK.Tab); h.key('Shift', SHIFT); }, /page source: Shift keydown at seq 1 refused/],
  ['a Shift whose intent keys are not [160,9]', undefined, h => { h.intent('a1', VK.Tab); h.key('Shift', SHIFT); }, /page source: Shift keydown at seq 1 refused/],
  ['a Shift followed by Enter', undefined, h => { h.intent('a1', ...SHIFT_TAB); h.key('Shift', SHIFT); h.key('Enter'); }, /page source: keydown "Enter" at seq 2 follows pending Shift at seq 1/],
  ['a Shift followed by an unshifted Tab', undefined, h => { h.intent('a1', ...SHIFT_TAB); h.key('Shift', SHIFT); h.key('Tab'); }, /page source: keydown "Tab" at seq 2 follows pending Shift at seq 1/],
  ['two Shifts', undefined, h => { h.intent('a1', ...SHIFT_TAB); h.key('Shift', SHIFT); h.key('Shift', SHIFT); }, /page source: Shift keydown at seq 2 refused/],
  ['a Shift with shift:false', undefined, h => { h.intent('a1', ...SHIFT_TAB); h.key('Shift'); }, /page source: Shift keydown at seq 1 refused/],
  ['a Shift after the main key', undefined, h => { h.intent('a1', ...SHIFT_TAB); h.key('Tab', SHIFT); h.key('Shift', SHIFT); }, /page source: Shift keydown at seq 2 refused/],
  ['a shifted Tab in a Tab action', [{action: 'a1', press: 'Tab'}], h => { h.intent('a1', VK.Tab); h.key('Tab', SHIFT); }, /page source: shifted Tab at seq 1 outside a Shift\+Tab action/],
  ['a shifted Tab before any intent', undefined, h => { h.key('Tab', SHIFT); }, /page source: shifted Tab at seq 1 outside a Shift\+Tab action/],
  ['an intent out of journey order', [{action: 'a1', press: 'Tab'}, {action: 'a2', press: 'Tab'}], h => { h.intent('a2', VK.Tab); }, /page source: intent does not follow the journey/],
]) test(`S2-N ${name}; both adapter views latch and pageAck.before is unreadable`, async () => {
  const h = pageSource({journey});
  await h.journal.snapshot();
  build(h);
  await refusedEverywhere(h, pattern);
  const refused = h.reads().at(-1);
  assert.equal(refused.decision, 'refused');
  assert.equal(refused.new_events.length, h.raw.events.length, 'every keydown, including the refused one, is in page-reads');
  assert.deepEqual(Object.keys(h.files), ['page-rejected.json']);
});

test('S2-N a pending Shift past 2000 ms is refused on the next read (fake clock)', async () => {
  const h = pageSource();
  h.intent('a1', ...SHIFT_TAB); h.key('Shift', SHIFT);
  h.now = 5; await h.journal.keys(0);
  h.now = 5 + SHIFT_PENDING_MS; await h.journal.snapshot();
  h.now = 6 + SHIFT_PENDING_MS;
  await refusedEverywhere(h, /page source: Shift at seq 1 unresolved/);
  assert.equal(SHIFT_PENDING_MS, 2000);
});

test('S2-N a pending Shift at the final read is refused and never discarded', async () => {
  const h = pageSource();
  h.intent('a1', ...SHIFT_TAB); h.key('Shift', SHIFT);
  await h.journal.keys(0);
  h.source.markFinal();
  await refusedEverywhere(h, /page source: Shift at seq 1 unresolved at final read/);
});

for (const [name, edit, pattern] of [
  ['a wrong session', v => { v.session = 'other'; }, /page source: wrong session/],
  ['a changed title', v => { v.title = 'Drafts'; }, /page source: title differs from served identity/],
  ['a changed url', v => { v.url = 'http://127.0.0.1:4100/other.html'; }, /page source: url differs from served identity/],
  ['missing network restrictions', v => { v.network_restrictions = false; }, /page source: network restrictions not reported/],
  ['state_overflow', v => { v.state_overflow = true; v.state = null; }, /page source: state overflow/],
  ['an undeclared state_overflow', v => { delete v.state_overflow; }, /page source: state overflow/],
  ['page_reported overflow', v => { v.page_reported_overflow = true; }, /page source: page-reported data overflow/],
  ['an untrusted keydown', v => { v.events.push({...v.events[0], seq: 2, t: v.t, key: 'Tab', isTrusted: false}); v.event_count = 2; }, /page source: untrusted keydown at seq 2/],
  ['an untrusted focusin', v => { v.events.push({seq: 2, t: v.t, type: 'focusin', target: 'body', active: 'body', isTrusted: false}); v.event_count = 2; }, /page source: untrusted focusin at seq 2/],
  ['a missing isTrusted on focusout', v => { v.events.push({seq: 2, t: v.t, type: 'focusout', target: 'body', active: 'body'}); v.event_count = 2; }, /page source: untrusted focusout at seq 2/],
  ['a malformed raw read', v => { delete v.events; }, /page source: malformed raw read/],
]) test(`S2-N identity and trust: ${name} is refused, stored once and latched`, async () => {
  const h = pageSource({journey: [{action: 'a1', press: 'Tab'}]});
  h.intent('a1', VK.Tab); h.key('Tab');
  await h.journal.keys(0);
  h.edit = edit;
  await refusedEverywhere(h, pattern);
  const record = h.reads().at(-1);
  assert.equal(record.decision, 'refused'); assert.match(`page source: ${record.reason}`, pattern);
  const stored = h.files['page-rejected.json'];
  assert.equal(record.rejected_sha256, createHash('sha256').update(stored).digest('hex'));
  assert.deepEqual(JSON.parse(stored), h.returned.at(-1).copy);
});

test('S2-N a non-prefix read produces exactly one page-rejected.json and no further evaluate', async () => {
  const h = pageSource({journey: [{action: 'a1', press: 'Tab'}]});
  h.intent('a1', VK.Tab); h.key('Tab');
  await h.journal.snapshot();
  h.raw.events[0].code = 'KeyTab-rewritten';
  await refusedEverywhere(h, /page source: raw read is not a prefix-extension of the previous raw read/);
  assert.deepEqual(Object.keys(h.files), ['page-rejected.json']);
  assert.equal(h.reads().filter(r => r.decision === 'refused').length, 1);
  const record = h.reads().at(-1);
  assert.equal(record.events_from, undefined, 'a non-prefix read carries no delta');
  assert.deepEqual(JSON.parse(h.files['page-rejected.json']).events[0].code, 'KeyTab-rewritten');
});

test('S2-P5 unchanged reads are coalesced and flushed before the next changed read and at flush()', async () => {
  const h = pageSource({journey: [{action: 'a1', press: 'Tab'}]});
  h.now = 1; await h.journal.snapshot();
  for (let i = 0; i < 3; i++) { h.now += 1; h.raw.t += 1; await h.views.snapshot(); }
  assert.equal(h.reads().length, 1, 'unchanged reads are buffered');
  h.intent('a1', VK.Tab); h.key('Tab'); h.now += 1; await h.journal.keys(0);
  await h.journal.snapshot(); await h.journal.snapshot(); await h.source.flush();
  assert.deepEqual(h.reads().map(r => [r.kind, r.read ?? r.read_first, r.reads ?? null]),
    [['read', 1, null], ['unchanged', 2, 3], ['read', 5, null], ['unchanged', 6, 2]]);
  const [first, quiet, changed] = h.reads();
  assert.deepEqual([quiet.page_t_first, quiet.page_t_last, quiet.first_requested_at, quiet.last_returned_at], [101, 103, 2, 4]);
  assert.deepEqual([changed.events_from, changed.events_to, changed.new_events.length, changed.state, changed.state_same], [0, 1, 1, null, true]);
  assert.ok(first.state && first.state_same === false);
  const prefix = createHash('sha256').update(canonicalJson(h.raw.events)).digest('hex');
  assert.equal(changed.prefix_sha256, prefix);
  assert.equal(first.prefix_sha256, createHash('sha256').update('[]').digest('hex'));
});

const canonicalJson = value => JSON.stringify(value, (k, v) => v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);
// Test-side reconstruction from the page-reads lane (the S3 verifier will own the production version).
function rebuild(records) {
  const out = [];
  let events = [], state, header, reported = null;
  for (const r of records) {
    if (r.kind !== 'read' || r.events_from === undefined) continue;
    assert.equal(r.events_from, events.length, 'events_from continuity');
    events = [...events, ...r.new_events];
    assert.equal(r.events_to, events.length);
    assert.equal(r.prefix_sha256, createHash('sha256').update(canonicalJson(events)).digest('hex'));
    if (!r.state_same) state = r.state;
    assert.equal(r.state_sha256, createHash('sha256').update(canonicalJson(state)).digest('hex'));
    if (r.header) header = r.header;
    reported = r.page_reported_from === null ? r.page_reported_new : [...(reported ?? []).slice(0, r.page_reported_from), ...r.page_reported_new];
    out.push({...header, session: r.session, t: r.page_t, active: r.active, state, events, page_reported: reported});
  }
  return out;
}

test('S2-P6 an adapter-refused snapshot is rebuilt exactly from the page-reads deltas', async () => {
  const h = pageSource({journey: [{action: 'a1', press: 'Tab'}]});
  h.raw.page_reported = [{type: 'focus'}];
  await h.journal.snapshot();
  h.intent('a1', VK.Tab); h.key('Tab'); h.raw.page_reported.push({type: 'key'});
  await h.journal.keys(0);
  h.raw.state = {dialogs: ['dlg#4'], invalid: [], live: []}; // a state change with no mutation: the provider refuses it
  h.raw.t += 1;
  await assert.rejects(h.journal.snapshot(), /page provider: page snapshot missing mutation or app event/);
  assert.equal(h.reads().at(-1).decision, 'passed', 'the page source passed it; the adapter refused it');
  assert.equal(h.files['page-rejected.json'], undefined);
  const rebuilt = rebuild(h.reads());
  assert.equal(rebuilt.length, 3);
  for (const [i, {copy}] of h.returned.entries()) assert.deepEqual(rebuilt[i], canonicalCopy(copy));
  assert.deepEqual(h.lanes.page.at(-1).complete, false);
});
const canonicalCopy = value => JSON.parse(canonicalJson(value));

test('S2-N writer, evaluate, intents and clock faults latch the source with no data released', async () => {
  for (const [name, setup, pattern] of [
    ['a throwing page-reads writer', h => { h.writer.append = lane => { if (lane === 'page-reads') throw Error('disk full'); }; }, /page source: disk full/],
    ['a rejecting evaluate', h => { h.delay = async () => { throw Error('target closed'); }; }, /page source: evaluate failed: target closed/],
    ['a throwing intents accessor', h => { h.intents = null; }, /page source: intent history invalid/],
    ['a regressing Node clock', h => { h.now = -1; }, /page source: invalid or regressing Node clock/],
  ]) {
    const writer = {append: (lane, r) => {}, put: () => {}};
    const h = pageSource({journey: [{action: 'a1', press: 'Tab'}], writer});
    await h.journal.snapshot();
    h.add('mutation', {mutation: 'attributes'}); // a changed read, so the page-reads lane is written, not coalesced
    setup(h);
    await assert.rejects(h.journal.snapshot(), pattern, name);
    await assert.rejects(h.journal.keys(0), pattern, name);
    await assert.rejects(h.source.read(), pattern, name);
  }
});

test('S2-N overlapping direct source reads are refused and latched', async () => {
  const h = pageSource({journey: [{action: 'a1', press: 'Tab'}]});
  let release; h.delay = () => new Promise(r => { release = r; });
  const first = h.source.read();
  await assert.rejects(h.source.read(), /page source: overlapping reads/);
  release();
  await assert.rejects(first, /page source: overlapping reads/, 'a read finishing after the latch releases nothing');
});

test('S2-N constructor bindings, served identity and journey are validated', () => {
  const ok = {evaluate: () => {}, session: 's', served: SERVED, journey: [{action: 'a1', press: 'Tab'}], intents: () => [],
    writer: {append() {}, put() {}}, now: () => 0};
  assert.ok(createR2PageSource(ok));
  for (const [change, pattern] of [
    [{evaluate: null}, /missing bindings/], [{writer: {append() {}}}, /missing bindings/], [{intents: undefined}, /missing bindings/],
    [{session: ''}, /invalid served identity/], [{served: {title: '', url: 'u'}}, /invalid served identity/],
    [{journey: []}, /invalid journey/], [{journey: [{action: 'to-email', press: 'Tab'}]}, /invalid journey/],
    [{journey: [{action: 'a1', press: 'Control'}]}, /invalid journey/],
    [{journey: [{action: 'a1', press: 'Tab'}, {action: 'a1', press: 'Tab'}]}, /invalid journey/],
  ]) assert.throws(() => createR2PageSource({...ok, ...change}), pattern);
});

test('S2-P7 serializePageViews never overlaps snapshot() and keys(); the unserialized adapter still refuses overlap', async () => {
  const h = pageSource({journey: [{action: 'a1', press: 'Tab'}]});
  h.delay = () => new Promise(r => setTimeout(r, 1));
  h.intent('a1', VK.Tab); h.key('Tab');
  const calls = [];
  for (let i = 0; i < 20; i++) calls.push(i % 2 ? h.views.keys(0) : h.views.snapshot());
  const results = await Promise.all(calls);
  assert.deepEqual(results[1], [{seq: 1, key: 'Tab', shift: false}]);
  assert.equal(results[0].events.length, 1);
  const raw = pageSource({journey: [{action: 'a1', press: 'Tab'}]});
  raw.delay = () => new Promise(r => setTimeout(r, 1));
  const a = raw.journal.snapshot(), b = raw.journal.keys(0);
  await assert.rejects(b, /page journal: overlapping reads/);
  await assert.rejects(a, /page journal: overlapping reads/);
});

test('S2-P8 a failed queued view does not block the queue; later calls get the latched failure', async () => {
  const h = pageSource({journey: [{action: 'a1', press: 'Tab'}]});
  h.delay = () => new Promise(r => setTimeout(r, 1));
  h.key('Insert');
  const settled = await Promise.allSettled([h.views.snapshot(), h.views.keys(0), h.views.snapshot()]);
  assert.deepEqual(settled.map(s => s.status), ['rejected', 'rejected', 'rejected']);
  for (const s of settled) assert.match(s.reason.message, /Insert keydown at seq 1 refused/);
  assert.throws(() => serializePageViews({snapshot() {}}), /invalid page journal/);
});

test('S2-P9 recorder reads flow through the page source and adapter end to end', async () => {
  const dom = domShim(); dom.install({session: 'page-s2'});
  dom.run(`Object.defineProperty(globalThis, '__tabwiseNetworkRestricted', {value: true})`);
  const lanes = {}, intents = [];
  const writer = {append: (lane, r) => { (lanes[lane] ??= []).push(r); }, put() { throw Error('no rejection expected'); }};
  let now = 0;
  const source = createR2PageSource({evaluate: async () => structuredClone(dom.read()), session: 'page-s2', served: SERVED,
    journey: [{action: 'a1', press: 'Shift+Tab'}], intents: () => intents, writer, now: () => ++now});
  const views = serializePageViews(createPageJournal({source, writer}));
  const ack = pageAck({read: cursor => views.keys(cursor), ackMs: 1000}), token = nvda(1, ...SHIFT_TAB);
  await views.snapshot();
  const field = dom.add('input', 'field'); dom.focus(field);
  await views.snapshot();
  intents.push({action: 'a1', keys: SHIFT_TAB});
  assert.deepEqual(await ack.before(token), []);
  dom.key('Shift', {shiftKey: true}); dom.key('Tab', {shiftKey: true});
  assert.deepEqual(await ack(token), {ack: true, reasons: []});
  source.markFinal(); await views.snapshot(); await source.flush();
  assert.deepEqual(source.prefixes(), [{action: 'a1', seq: 4, prefix: 'observed'}]);
  assert.ok(lanes['page-reads'].every(r => r.kind === 'unchanged' || r.decision === 'passed'));
  assert.ok(lanes.page.every(e => e.complete === true));
});

test('S2-N page-source.mjs imports only node:crypto and the frozen press list; it exports the documented API', () => {
  const code = readFileSync(new URL('../src/r2/page-source.mjs', import.meta.url), 'utf8');
  assert.deepEqual(code.match(/^import .* from '([^']+)';$/gm).map(l => l.match(/'([^']+)'/)[1]), ['node:crypto', '../../scripts/tabwise/input-policy.mjs']);
  assert.equal(/\bimport\s*\(|\brequire\s*\(|child_process|node:fs|node:net|playwright/.test(code), false);
  assert.deepEqual(code.match(/^export\s+(?:const|function)\s+(\w+)/gm).map(l => l.split(/\s+/).at(-1)),
    ['SHIFT_PENDING_MS', 'createR2PageSource', 'serializePageViews']);
  const source = createR2PageSource({evaluate() {}, session: 's', served: SERVED, journey: [{action: 'a1', press: 'Tab'}],
    intents: () => [], writer: {append() {}, put() {}}, now: () => 0});
  assert.ok(Object.isFrozen(source));
  assert.deepEqual(Object.keys(source).sort(), ['flush', 'markFinal', 'pending', 'prefixes', 'read']);
});

test('S1-N1 after a clock regression a later event with a valid clock is still dropped and counted', () => {
  const dom = domShim(); dom.install({session: 'page-s1'});
  dom.key('Tab'); dom.setClock(500); dom.key('Tab'); dom.setClock(5000); dom.key('Enter');
  const raw = dom.read();
  assert.deepEqual([raw.events.map(e => e.key), raw.dropped, raw.overflow, raw.reasons], [['Tab'], 2, false, ['page clock regression']]);
});

test('S1-N3 a synthetic (untrusted) keydown is recorded with isTrusted:false and refused by the page source', async () => {
  const dom = domShim(); dom.install({session: 'page-s2'});
  dom.run(`Object.defineProperty(globalThis, '__tabwiseNetworkRestricted', {value: true})`);
  dom.key('Tab', {isTrusted: false});
  assert.equal(dom.read().events[0].isTrusted, false);
  const source = createR2PageSource({evaluate: async () => dom.read(), session: 'page-s2', served: SERVED,
    journey: [{action: 'a1', press: 'Tab'}], intents: () => [], writer: {append() {}, put() {}}, now: () => 0});
  await assert.rejects(source.read(), /page source: untrusted keydown at seq 1/);
});

test('S1-N3 a synthetic focusin and focusout keep isTrusted:false in the recorded events', () => {
  const dom = domShim(); dom.install({session: 'page-s1'});
  const node = dom.add('input', 'f');
  for (const type of ['focusin', 'focusout']) for (const l of dom.listeners) if (l.type === type) l.fn({type, isTrusted: false, target: node, relatedTarget: null});
  assert.deepEqual(dom.read().events.filter(e => e.type !== 'mutation').map(e => [e.type, e.isTrusted]), [['focusin', false], ['focusout', false]]);
});
