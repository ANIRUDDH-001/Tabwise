import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureOfflineJourney, speechModelPayload} from '../src/r2/binding.mjs';
import {createPageInstrumentation} from '../src/r2/page-provider.mjs';

// All boundaries are in-memory. This fake guard models refusal/arming only;
// it supplies no physical-send or commit receipt and cannot attest execution.
function fixture({intentMs = 0, foregroundMs = 0, emitKey = true} = {}) {
  let time = 0, stopped = false, armed = false, sends = 0;
  const calls = [], phrases = [];
  const state = {localOnly:'DOM-source-label-expected-sentinel'};
  const clock = {now: () => time, wait: async ms => { time += ms; }};
  const journal = createPageInstrumentation({session:'p', now: () => 9000 + time,
    snapshot: () => ({active:'body', state})});
  const speech = {read: async () => ({source:'nvda', session:'s', connected:true, complete:true, phrases:[...phrases]})};
  const guard = {isStopped: () => stopped, arm: () => { armed = !stopped; calls.push('arm'); return armed; },
    disarm: () => { armed = false; }, idle: async () => ({quiet:true}),
    stop: () => { stopped = true; }, status: () => ({sends})};
  const executorBindings = {guard,
    persistActionIntent: async () => { calls.push('intent'); time += intentMs; },
    checkForeground: async () => { calls.push('foreground'); time += foregroundMs; return []; },
    nvda: {press: async (press, options) => {
      assert.equal(armed, true); assert.deepEqual(options, {capture:false});
      calls.push(['press',press,time]); sends++;
      if (emitKey) journal.record('keydown', {key:press === 'Space' ? ' ' : press.replace('Shift+',''),
        shift:press === 'Shift+Tab', target:'body'});
      phrases.push('synthetic speech');
    }},
  };
  const options = {fixture_id:'f-ab12', actions:[{step:'a01',press:'Tab'}], speech,
    page:{read: () => journal.read()}, executorBindings, clock,
    observationMs:20, pollMs:10, timeoutMs:2000};
  return {options, calls, journal, phrases, speech, executorBindings, state};
}

test('offline composition completes supported synthetic actions through the existing guarded executor', async () => {
  const f = fixture();
  f.options.actions = ['Tab','Shift+Tab','Enter','Space'].map((press,i) => ({step:`a0${i+1}`,press}));
  const result = await captureOfflineJourney(f.options);
  assert.equal(result.completed, true); assert.equal(result.outcome, 'COMPLETE');
  assert.equal(result.source, 'synthetic-unattested');
  assert.equal(result.guarded_execution_verified, false);
  assert.equal(result.provenance.kind, 'synthetic'); assert.equal(result.provenance.attestation, 'UNATTESTED');
  assert.ok(result.records.every(r => r.execution.quiescence === 'UNVERIFIED'));
  assert.deepEqual(result.records.map(r => r.ack_seq), [1,2,3,4]);
  assert.deepEqual(f.calls.slice(0,4), ['intent','foreground','arm',['press','Tab',0]]);
  assert.ok(result.raw.every(r => r.source === 'synthetic-unattested'), 'a provider nvda string cannot attest synthetic composition');
});

test('unsupported keys anywhere in the journey are refused before invoking any provider', async () => {
  for (const press of ['Escape','ArrowDown','Control+Tab','type','Insert+T']) {
    const f = fixture(); let reads = 0;
    f.options.actions.push({step:'a02',press});
    f.options.speech = {read: () => { reads++; throw Error('must not read'); }};
    f.options.page = {read: () => { reads++; throw Error('must not read'); }};
    await assert.rejects(captureOfflineJourney(f.options), /unsupported press/);
    assert.equal(reads,0); assert.deepEqual(f.calls,[]);
  }
});

test('invalid identities and missing bindings refuse before intent persistence', async () => {
  for (const change of [
    f => { f.options.actions.push({step:'a01',press:'Enter'}); },
    f => { f.options.fixture_id = ''; },
    f => { f.options.executorBindings.guard = {}; },
    f => { f.options.clock = {}; },
  ]) {
    const f = fixture(); change(f);
    await assert.rejects(captureOfflineJourney(f.options)); assert.deepEqual(f.calls,[]);
  }
});

test('model payload includes only allowlisted speech observations and actions', async () => {
  const f = fixture(); f.options.actions[0].expected = 'hidden expected outcome';
  const capture = await captureOfflineJourney(f.options);
  capture.records[0].labels = 'ground truth sentinel'; capture.source_code = 'source sentinel';
  const payload = speechModelPayload(capture);
  assert.deepEqual(payload, {fixture_id:'f-ab12', observations:[{step:'a01',ref:'speech:1',speech:'synthetic speech'}],
    actions:[{step:'a01',press:'Tab'}]});
  assert.doesNotMatch(JSON.stringify(payload), /DOM-source|ground truth|source sentinel|hidden expected|page-monotonic|provenance/);
  payload.observations[0].speech = 'changed';
  assert.equal(capture.records[0].text,'synthetic speech');
});

test('model payload refuses non-string observations instead of forwarding embedded page objects', async () => {
  const original = await captureOfflineJourney(fixture().options);
  for (const mutate of [
    r => { r.records[0].text = {page:{dom:'private instrumentation'},expected:'label sentinel'}; },
    r => { r.fixture_id = {source:'source sentinel'}; },
    r => { r.records[0].step = {dom:'DOM sentinel'}; },
    r => { r.records[0].press = {expected:'expected sentinel'}; },
  ]) {
    const result = structuredClone(original); mutate(result);
    assert.throws(() => speechModelPayload(result), /speech|record|payload/i);
  }
});

for (const [name, change] of [
  ['missing acknowledgement', f => { f.options = {...f.options, actions:[{step:'a01',press:'Enter'}]};
    f.executorBindings.nvda.press = async () => {}; }],
  ['incomplete page', f => f.journal.markIncomplete('lost event')],
  ['foreground refusal', f => { f.executorBindings.checkForeground = async () => ['wrong window']; }],
  ['intent persistence failure', f => { f.executorBindings.persistActionIntent = async () => { throw Error('write failed'); }; }],
  ['speech disconnect', f => { f.options.speech = {read: async () => ({source:'synthetic',session:'s',connected:false,complete:false,phrases:[]})}; }],
]) test(`composition retains insufficient evidence for ${name}`, async () => {
  const f = fixture(); change(f);
  const result = await captureOfflineJourney(f.options);
  assert.equal(result.completed, false); assert.equal(result.outcome,'INSUFFICIENT_EVIDENCE');
  assert.equal(result.guarded_execution_verified,false);
  assert.ok(result.records.every(r => r.execution.quiescence === 'UNVERIFIED'));
  await assert.rejects(async () => speechModelPayload(result), /incomplete/);
});

test('rewritten page history after one action stops the next action', async () => {
  const f = fixture(), read = f.options.page.read;
  f.options.actions.push({step:'a02',press:'Enter'});
  f.options.page.read = () => {
    const value = read(); if(value.events.length) value.events[0].seq = 2; return value;
  };
  const result = await captureOfflineJourney(f.options);
  assert.equal(result.completed,false);
  assert.equal(f.calls.filter(c => Array.isArray(c)).length,1);
});

test('synthetic source relabelling does not hide a speech-source change', async () => {
  const f = fixture(), original = f.speech.read; let reads = 0;
  f.speech.read = async () => ({...await original(), source:++reads < 3 ? 'first' : 'second'});
  const result = await captureOfflineJourney(f.options);
  assert.equal(result.completed,false); assert.match(result.reasons.join(';'), /source/);
});

test('composition preserves ordered focus loss, recovery, mutations and app events locally', async () => {
  const f = fixture(); let active = 'opener'; const state = {saved:false};
  const journal = createPageInstrumentation({session:'focus-page',now:() => 9000 + f.options.clock.now(),
    snapshot:() => ({active,state})});
  f.options.page = {read:() => journal.read()};
  f.executorBindings.nvda.press = async () => {
    journal.record('keydown',{key:'Tab',shift:false,target:'opener'});
    active = 'body'; journal.record('focusout',{target:'opener'});
    active = 'dialog'; journal.record('focusin',{target:'dialog'});
    active = 'body'; journal.record('focusout',{target:'dialog'});
    active = 'opener'; journal.record('focusin',{target:'opener'});
    state.saved = true; journal.record('mutation',{target:'status',attribute:'aria-live'});
    journal.record('app',{name:'save'});
  };
  const result = await captureOfflineJourney(f.options), page = result.records[0].page;
  assert.equal(result.completed,true);
  assert.equal(page.before.active,'opener'); assert.equal(page.after.active,'opener');
  assert.deepEqual(page.events.map(e=>e.type), ['keydown','focusout','focusin','focusout','focusin','mutation','app']);
  assert.deepEqual(page.after.state,{saved:true});
  assert.ok(page.events.some(e=>e.active==='dialog'));
  assert.equal(speechModelPayload(result).observations[0].speech,'');
});

for (const [foregroundMs, completes] of [[399,true],[400,true],[401,false]]) {
  test(`existing 1000 ms executor-request acknowledgement cap with 600 ms intent + ${foregroundMs} ms foreground`, async () => {
    const f = fixture({intentMs:600,foregroundMs});
    const result = await captureOfflineJourney(f.options), record = result.records[0];
    assert.equal(result.completed,completes);
    assert.deepEqual(f.calls.find(c => Array.isArray(c)), ['press','Tab',600+foregroundMs]);
    assert.equal(record.ack_timing.reference,'executor-request');
    assert.equal(record.ack_timing.deadline_ms,1000);
    assert.equal(record.node_window.from,0);
    if (!completes) {
      assert.equal(record.ack_seq,null);
      assert.match(record.reasons.join(';'), /1000 ms of executor request/);
      assert.equal(record.page.events[0].t,10001, 'key is immediate at synthetic send, but pre-send work already exceeded capture cap');
    }
    assert.equal(result.guarded_execution_verified,false);
    assert.equal(record.execution.quiescence,'UNVERIFIED');
    assert.equal(record.execution.commit_receipt,undefined);
  });
}

test('composition rejects a missing non-body focusout before a second action', async () => {
  const f = fixture(); let active = 'field-a', presses = 0;
  const journal = createPageInstrumentation({session:'focus-gap',now:() => 9000 + f.options.clock.now(),
    snapshot:() => ({active,state:{}})});
  f.options.page = {read:() => journal.read()};
  f.options.actions.push({step:'a02',press:'Enter'});
  f.executorBindings.nvda.press = async press => {
    presses++; journal.record('keydown',{key:press,shift:false,target:active});
    active = 'field-b'; journal.record('focusin',{target:'field-b'});
  };
  const result = await captureOfflineJourney(f.options);
  assert.equal(result.completed,false); assert.equal(presses,1);
  assert.match(result.reasons.join(';'), /focusout|ambiguous focus/i);
  assert.equal(result.guarded_execution_verified,false);
  assert.ok(result.records.every(r=>r.execution.quiescence==='UNVERIFIED'));
});

test('model-facing fixture IDs reject labels, malformed syntax and oversized values', async () => {
  const capture = await captureOfflineJourney(fixture().options);
  for (const id of ['healthy-validation','f-broken','f-abc-expected', 'f-ab12\n', 'f--ab12', 'f-ab12-', 'f-'+'a'.repeat(65)]) {
    const value = structuredClone(capture); value.fixture_id = id;
    assert.throws(() => speechModelPayload(value), /identifier|payload/i, id);
  }
});

test('model-facing action IDs reject labels, malformed syntax, duplicates and oversized values', async () => {
  const capture = await captureOfflineJourney(fixture().options);
  for (const id of ['validation-error','a01-healthy','a01\n','a-01','a'+'1'.repeat(13)]) {
    const value = structuredClone(capture); value.records[0].step = id;
    assert.throws(() => speechModelPayload(value), /identifier|payload/i, id);
  }
  const duplicate = structuredClone(capture);
  duplicate.records.push({...duplicate.records[0],seq:2});
  assert.throws(() => speechModelPayload(duplicate), /identifier|payload/i, 'duplicate action identity');
});

test('bounded opaque IDs round-trip without remapping or implying independent blinding', async () => {
  for (const [fixture_id,step] of [['f-ab12','a01'], ['f-dead-beef','a1'], ['f-'+'a'.repeat(64),'a'+'1'.repeat(12)]]) {
    const f = fixture(); f.options.fixture_id = fixture_id; f.options.actions[0].step = step;
    const capture = await captureOfflineJourney(f.options), payload = speechModelPayload(capture);
    assert.equal(payload.fixture_id,fixture_id);
    assert.equal(payload.observations[0].step,step); assert.equal(payload.actions[0].step,step);
    assert.equal(capture.provenance.attestation,'UNATTESTED');
    assert.equal(capture.guarded_execution_verified,false);
    assert.equal(capture.records[0].execution.quiescence,'UNVERIFIED');
  }
});

test('label-bearing identifiers are refused before any observation or executor provider call', async () => {
  for (const mutate of [f=>{f.options.fixture_id='healthy-validation';},f=>{f.options.actions[0].step='a01-broken';}]) {
    const f = fixture(); let reads = 0; mutate(f);
    f.options.page = {read:()=>{reads++;throw Error('must not read');}};
    f.options.speech = {read:()=>{reads++;throw Error('must not read');}};
    await assert.rejects(captureOfflineJourney(f.options), /identity|identifier/i);
    assert.equal(reads,0); assert.deepEqual(f.calls,[]);
  }
});
