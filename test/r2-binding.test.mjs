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

// ---- R2-L2 S5a: capability-free guarded composition (CLOUD-R2-L2-04) ----
// Real frozen sendGate and pageAck, real createGuardedPressExecutor, real S2 page source, R2-L1 journal, M2A ledger,
// captureJourney and S3 writer/verifier; fake transport, page journal, observer, foreground and fake Node clock.
// Lifecycle sync (PR #11 lesson): the fake clock never advances while a send is in flight, because the gate settles
// on real timers that a coarse OS timer stretches; receipt finalization therefore lands at a lifecycle-fixed time.
import {mkdtempSync as mkdtempS5, rmSync as rmS5, readFileSync as readS5, writeFileSync as writeS5, appendFileSync as appendS5} from 'node:fs';
import {tmpdir as tmpdirS5} from 'node:os';
import {join as joinS5} from 'node:path';
import {composeR2Page} from '../scripts/tabwise/r2-compose.mjs';
import {createR2EvidenceWriter, verifyR2PageEvidence, ATTESTATION_UNAVAILABLE as S5_UNATTESTED} from '../scripts/tabwise/r2-evidence.mjs';
import {createGuardedPressExecutor} from '../scripts/tabwise/executor.mjs';
import {sendGate as sendGateS5, VK as VKS5} from '../src/speech/sendguard.mjs';
import {assessR2SpeechPayload, openVerifiedR2SpeechEvidence} from '../src/r2/speech-payload.mjs';

const S5_MANIFEST = JSON.parse(readS5(new URL('../fixtures/r2/manifest.json', import.meta.url), 'utf8'));
const S5_PAIR = S5_MANIFEST.pairs.find(p => p.id === 'validation');
const S5_FIXTURE = readS5(new URL(`../fixtures/r2/${S5_PAIR.healthy.file}`, import.meta.url));
const S5_TASK = S5_PAIR.task.map(({step, press}) => ({step, press}));
const S5_NONCE = '5e6f7a8b', S5_SESSION = 'page-s5', S5_STOP = 'synthetic external stop';
const S5_FLAGS = {shift: false, ctrl: false, alt: false, meta: false, repeat: false};
const s5Spec = actions => ({actions, ackMs: 1000, timeoutMs: 2000, observationMs: 200, pollMs: 20});
const s5Info = press => ({path: 'nvda', keys: (press === 'Shift+Tab' ? [VKS5.Shift, VKS5.Tab] : [({Tab: VKS5.Tab, Enter: VKS5.Enter, Space: VKS5.Space})[press]]).map(vk => ({vk, scan: 0, ext: false}))});
const s5Turn = () => new Promise(resolve => setImmediate(resolve));
const s5Roots = [];
test.after(() => { for (const d of s5Roots) rmS5(d, {recursive: true, force: true}); });
const S5_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// options: task, transport(press, env), speak(press, n) -> text|null, shiftPrefix, foreground(ctx, env), edit(raw, env),
// integrity(), axe(), handles(h, env) to mutate handles, data(d) to mutate data.
function s5Rig(o = {}) {
  const task = o.task ?? S5_TASK, spec = s5Spec(task.length);
  let time = 0, sending = 0, observerLive = true;
  const scheduled = [], phrases = [], presses = [], calls = [];
  const advance = ms => { const end = time + ms; scheduled.sort((a, b) => a.at - b.at); while (scheduled[0]?.at <= end) { const item = scheduled.shift(); time = item.at; item.fn(); } time = end; };
  const later = (ms, fn) => scheduled.push({at: time + ms, fn});
  const settled = async () => { const t0 = performance.now(); while (sending) { if (performance.now() - t0 > 5000) throw Error('rig: send did not settle'); await new Promise(r => setTimeout(r, 1)); } await s5Turn(); };
  const clock = {now: () => time, wait: async ms => { await settled(); advance(ms); await s5Turn(); }};
  const root = mkdtempS5(joinS5(tmpdirS5(), 'tabwise-r2-s5a-')); s5Roots.push(root);
  const dir = joinS5(root, 'validation');
  const approved = {fixture_sha256: S5_PAIR.healthy.sha256, task};
  const writer = createR2EvidenceWriter({enabled: true, dir, page: {fixture_id: 'validation', session: S5_SESSION, port: 4100}, fixture: S5_FIXTURE, approved, nonce: S5_NONCE, spec});
  const raw = {session: S5_SESSION, complete: true, clock: 'page-monotonic-ms', t: 100, active: 'body', title: writer.identity.title, url: writer.identity.url,
    state: {dialogs: [], invalid: [], live: []}, state_overflow: false, event_count: 0, overflow: false, dropped: 0, events: [], page_reported: null,
    page_reported_overflow: false, reasons: [], network_restrictions: true};
  const add = (type, detail = {}) => {
    raw.t += 1;
    const e = {seq: raw.events.length + 1, t: raw.t, type, target: raw.active, active: raw.active, element: null, ...detail};
    if (['keydown', 'focusin', 'focusout'].includes(type) && !('isTrusted' in detail)) e.isTrusted = true;
    raw.events.push(e); raw.event_count = raw.events.length;
  };
  const key = (k, flags = {}) => add('keydown', {key: k, code: k, location: 0, ...S5_FLAGS, ...flags});
  const pressKeys = press => {
    if (press === 'Shift+Tab') { if (o.shiftPrefix !== false) key('Shift', {shift: true}); key('Tab', {shift: true}); }
    else key(press === 'Space' ? ' ' : press);
  };
  const gate = sendGateS5({settleMs: 0, now: () => time});
  gate.setIntegrity(() => o.integrity?.() ?? []);
  const env = {gate, raw, add, key, pressKeys, phrases, presses, calls, later, advance, now: () => time, writer, dir,
    stop: () => gate.stop(S5_STOP, 'stop'), setObserverLive: v => { observerLive = v; }, get sending() { return sending; }, set sending(v) { sending = v; }};
  const speak = o.speak ?? ((press, n) => press === 'Enter' ? null : `phrase ${n}`);
  const transport = o.transport ?? (async (press, e) => {
    const token = await gate.admit(s5Info(press));
    if (!gate.commit(token)) throw Error('fake transport: commit refused');
    e.pressKeys(press);
    await gate.release(token, {ended: true});
  });
  const nvda = {
    press: async (press, options) => {
      calls.push('nvda.press'); presses.push(press);
      assert.deepEqual(options, {capture: false});
      if (o.hangPress) return new Promise(() => {});
      sending++;
      try { await transport(press, env); } finally { sending--; }
      const said = speak(press, presses.length);
      if (said !== null) later(50, () => phrases.push(said));
    },
    start: async () => { calls.push('nvda.start'); return {pid: 4242, relay_pid: 4242, reset_confirmed: true}; },
    stop: async () => { calls.push('nvda.stop'); },
  };
  const observer = {
    open: async receipt => { calls.push('observer.open'); assert.equal(receipt.pid, 4242); },
    read: () => ({source: 'synthetic', session: 'observer-s5', connected: observerLive, complete: observerLive, phrases: [...phrases]}),
    close: async () => { calls.push('observer.close'); },
  };
  const foreground = {check: async context => { calls.push('foreground.check'); return o.foreground?.(context, env) ?? []; }, close: async () => { calls.push('foreground.close'); }};
  const page = {
    evaluate: async () => { calls.push('page.evaluate'); const v = structuredClone(raw); o.edit?.(v, env); return v; },
    screenshot: async () => { calls.push('page.screenshot'); return S5_PNG; },
    axe: async () => { calls.push('page.axe'); return o.axe?.() ?? {violations: []}; },
    close: async () => { calls.push('page.close'); },
  };
  const handles = {guard: gate, getGate: () => gate, createExecutor: createGuardedPressExecutor, nvda, observer, foreground, page, writer, clock};
  const data = {fixture_id: 'validation', session: S5_SESSION, approved, nonce: S5_NONCE, spec, handleTimeoutMs: 2000, focusWaitMs: 200};
  o.handles?.(handles, env); o.data?.(data, env);
  return {...env, handles, data, approved, run: () => composeR2Page(handles, data)};
}
const S5_ORDER = ['disarm', 'quiesce', 'final page read', 'page reads flush', 'gate check', 'axe post', 'screenshot post', 'speech lane',
  'observer close', 'foreground close', 'page close', 'NVDA stop', 'receipts lane', 'capture.json', 'seal'];
const s5Effects = calls => calls.filter(c => c !== 'foreground.check');
function s5WalkJson(value, path = '$') {
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return;
  assert.equal(typeof value, 'object', path);
  assert.ok([Object.prototype, Array.prototype].includes(Object.getPrototypeOf(value)), `${path} plain`);
  for (const [k, v] of Object.entries(value)) { assert.notEqual(k, 'provenance', path); assert.notEqual(k, 'class', path); s5WalkJson(v, `${path}.${k}`); }
}
function s5AssertNoPromotion(result) {
  s5WalkJson(result);
  assert.doesNotMatch(JSON.stringify(result), /owned-vendored-runtime|genuine-unqualified|"qualified"/);
  assert.equal(result.guarded_execution_verified, false);
  assert.equal(result.teardown.physical_quiescence_verified, false);
}
// A refused or failed page: never complete, evidence sealed incomplete (or unsealed), and the original stop kept.
async function s5AssertFailed(f, result, pattern) {
  assert.equal(result.completed, false); assert.equal(result.outcome, 'INSUFFICIENT_EVIDENCE');
  assert.match([...result.reasons, ...result.teardown.errors].join('\n'), pattern);
  s5AssertNoPromotion(result);
  if (result.evidence.sealed) {
    assert.equal(result.evidence.verdict, 'incomplete');
    const v = await verifyR2PageEvidence(f.dir, {fixture: S5_FIXTURE, approved: f.approved});
    assert.equal(v.class, 'incomplete');
  }
  assert.equal(f.gate.isStopped(), true, 'gate never handed back live after a failure');
}

// ---- positive ----
test('S5a-P1 Tab, Tab, Enter: complete capture, receipts, silence window, exact teardown order, synthetic sealed evidence', async () => {
  const f = s5Rig();
  const result = await f.run();
  assert.equal(result.completed, true, JSON.stringify([result.reasons, result.teardown.errors, result.evidence.errors]));
  assert.equal(result.outcome, 'COMPLETE');
  assert.deepEqual(result.actions.map(a => [a.action, a.press, a.capture_status]), [['a1', 'Tab', 'speech'], ['a2', 'Tab', 'speech'], ['a3', 'Enter', 'observed-silence']]);
  assert.deepEqual(result.actions.map(a => a.ack_seq), [1, 2, 3]);
  assert.deepEqual(result.teardown.order, S5_ORDER);
  assert.equal(result.teardown.quiescence, 'QUIET_AT_TEARDOWN'); assert.deepEqual(result.pending_operations, []);
  assert.deepEqual(result.gate, {stopped: false, kind: null, reason: null, sends: 3, misdelivered: false, refused: 0});
  assert.deepEqual(result.final.ack_errors, []); assert.equal(result.final.pending_shift, null);
  assert.deepEqual([result.evidence.sealed, result.evidence.verified, result.evidence.verdict], [true, true, 'synthetic']);
  s5AssertNoPromotion(result);
  assert.deepEqual(f.presses, ['Tab', 'Tab', 'Enter']);
  // Handle lifecycle order (effects only): start, observer, three sends, then the §7.3 teardown order.
  const effects = s5Effects(f.calls).filter(c => !['page.evaluate'].includes(c));
  assert.deepEqual(effects, ['nvda.start', 'page.axe', 'page.screenshot', 'observer.open', 'nvda.press', 'nvda.press', 'nvda.press',
    'page.axe', 'page.screenshot', 'observer.close', 'foreground.close', 'page.close', 'nvda.stop']);
  // Independent verification from disk, receipts and the silence window.
  const v = await verifyR2PageEvidence(f.dir, {fixture: S5_FIXTURE, approved: f.approved});
  assert.deepEqual([v.ok, v.class], [true, 'synthetic'], v.errors.join('; '));
  const receipts = JSON.parse(readS5(joinS5(f.dir, 'receipts.jsonl'), 'utf8'));
  assert.equal(receipts.complete, true); assert.equal(receipts.receipts.length, 3); assert.equal(receipts.provenance.attestation, 'UNATTESTED');
  const capture = JSON.parse(readS5(joinS5(f.dir, 'capture.json'), 'utf8'));
  const silent = capture.records[2];
  assert.deepEqual(silent.silence, {transport_live: true, from: silent.observation_window.from, to: silent.observation_window.to, unit: 'node-monotonic-ms'});
  assert.ok(capture.records.every(r => r.ack_timing.reference === 'gate-release' && r.ack_timing.observed_at - r.ack_timing.release_at <= 1000));
  const intents = readS5(joinS5(f.dir, 'intents.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(intents, [{action: 'a1', keys: [9]}, {action: 'a2', keys: [9]}, {action: 'a3', keys: [13]}]);
});

test('S5a-P2 sealed S5a evidence feeds the C-3 pure core (task ids, no nonce) while the production entry still refuses it', async () => {
  const f = s5Rig({speak: (press, n) => n === 1 ? `Newsletter sign-up ${S5_NONCE}, email` : press === 'Enter' ? null : 'Submit, button'});
  const result = await f.run();
  assert.equal(result.completed, true, result.reasons.join('; '));
  const manifest = JSON.parse(readS5(joinS5(f.dir, 'manifest.json'), 'utf8'));
  const speech = readS5(joinS5(f.dir, 'speech.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const capture = JSON.parse(readS5(joinS5(f.dir, 'capture.json'), 'utf8'));
  const c3 = assessR2SpeechPayload({capture, stepMap: manifest.step_map, speech, transform: manifest.transform, fixture_id: 'f-5a'});
  assert.equal(c3.model_eligible, true, c3.reasons.join('; '));
  assert.deepEqual(c3.payload.actions, S5_TASK);
  assert.deepEqual(c3.payload.observations.map(o => [o.step, o.speech]), [['to-email', 'Newsletter sign-up [run-nonce], email'], ['to-submit', 'Submit, button'], ['submit', '']]);
  assert.equal(c3.redaction.edits.length, 1);
  await assert.rejects(openVerifiedR2SpeechEvidence(f.dir, {fixture: S5_FIXTURE, approved: f.approved}), err => err.message.includes(S5_UNATTESTED));
});

test('S5a-P3 Space and Shift+Tab with and without an observed Shift prefix; single action; Tab then Enter', async () => {
  const task = [{step: 'to-a', press: 'Tab'}, {step: 'back', press: 'Shift+Tab'}, {step: 'toggle', press: 'Space'}, {step: 'back-again', press: 'Shift+Tab'}];
  let n = 0;
  const f = s5Rig({task, transport: async (press, e) => {
    const token = await e.gate.admit(s5Info(press)); if (!e.gate.commit(token)) throw Error('commit');
    if (press === 'Shift+Tab' && ++n === 2) e.key('Tab', {shift: true}); else e.pressKeys(press);
    await e.gate.release(token, {ended: true});
  }});
  const result = await f.run();
  assert.equal(result.completed, true, JSON.stringify([result.reasons, result.teardown.errors, result.evidence.errors]));
  assert.deepEqual(result.final.shift_prefix.map(p => [p.action, p.prefix]), [['a2', 'observed'], ['a4', 'not-observed']]);
  assert.deepEqual((await verifyR2PageEvidence(f.dir, {fixture: S5_FIXTURE, approved: f.approved})).class, 'synthetic');
  for (const t of [[{step: 'only', press: 'Tab'}], [{step: 'to-submit', press: 'Tab'}, {step: 'submit', press: 'Enter'}]]) {
    const g = s5Rig({task: t});
    const r = await g.run();
    assert.equal(r.completed, true, r.reasons.join('; '));
    assert.deepEqual(r.step_map.actions.map(a => a.task), t.map(x => x.step));
  }
});

test('S5a-P4 the result is detached JSON: mutating it changes nothing and it carries no handle or function', async () => {
  const f = s5Rig({task: [{step: 'only', press: 'Tab'}]});
  const result = await f.run();
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  for (const v of Object.values(result)) assert.notEqual(typeof v, 'function');
  assert.equal(Object.values(f.handles).some(h => JSON.stringify(result).includes('function')), false);
});

// ---- negative: refused before input (throws, no handle effect, nothing composed) ----
const S5_PRE = [
  ['missing observer handle', {handles: h => { delete h.observer; }}],
  ['malformed nvda handle', {handles: h => { h.nvda = {...h.nvda, press: 'x'}; }}],
  ['extra provenance handle (fake promotion attempt)', {handles: h => { h.provenance = 'owned-vendored-runtime'; }}],
  ['extra provenance datum (fake promotion attempt)', {data: d => { d.provenance = 'genuine-unqualified'; }}],
  ['malformed task (duplicate step)', {data: d => { d.approved = {...d.approved, task: [...S5_TASK.slice(0, 2), {step: 'to-email', press: 'Enter'}]}; }}],
  ['unsupported key before send', {data: d => { d.approved = {...d.approved, task: [...S5_TASK.slice(0, 2), {step: 'escape', press: 'Escape'}]}; }}],
  ['wrong fixture hash', {data: d => { d.approved = {...d.approved, fixture_sha256: 'f'.repeat(64)}; }}],
  ['wrong title nonce', {data: d => { d.nonce = '00000000'; }}],
  ['wrong session', {data: d => { d.session = 'other-page'; }}],
  ['caps preflight failure', {data: d => { d.spec = {...d.spec, pollMs: 1}; }}],
  ['spec differs from the writer caps', {data: d => { d.spec = {...d.spec, observationMs: 300}; }}],
  ['stale or foreign gate', {handles: h => { h.getGate = () => sendGateS5(); }}],
  ['gate already stopped', {handles: (h, e) => e.stop()}],
  ['writer not frozen', {handles: h => { h.writer = {...h.writer}; }}],
  ['handle timeout out of range', {data: d => { d.handleTimeoutMs = 0; }}],
];
for (const [name, options] of S5_PRE) test(`S5a-N pre-input refusal: ${name}`, async () => {
  const f = s5Rig(options);
  await assert.rejects(f.run(), /R2 compose refused before input/);
  assert.deepEqual(s5Effects(f.calls), [], 'no handle effect');
  assert.deepEqual(f.presses, []);
  assert.equal(readS5(joinS5(f.dir, 'events.jsonl'), 'utf8').trim().split('\n').length, 1, 'only the writer evidence-begin record');
});

test('S5a-N zero or two <title> elements are refused when the served copy is built, before any handle exists', () => {
  for (const bytes of [Buffer.from('<html><body>no title</body></html>'), Buffer.from('<title>a</title><title>b</title>')]) {
    const root = mkdtempS5(joinS5(tmpdirS5(), 'tabwise-r2-s5a-title-')); s5Roots.push(root);
    assert.throws(() => createR2EvidenceWriter({enabled: true, dir: joinS5(root, 'p'), page: {fixture_id: 'validation', session: S5_SESSION, port: 4100},
      fixture: bytes, approved: {fixture_sha256: S5_PAIR.healthy.sha256, task: S5_TASK}, nonce: S5_NONCE, spec: s5Spec(3)}), /exactly one <title>/);
  }
});

// ---- negative: runtime refusals (fail closed, teardown runs, prohibited later effects absent) ----
const pressCount = f => f.calls.filter(c => c === 'nvda.press').length;
test('S5a-N pre-input page identity: wrong title, URL or session in the page journal sends nothing', async () => {
  for (const [name, edit] of [['title', v => { v.title = 'Newsletter sign-up 00000000'; }], ['url', v => { v.url = 'http://127.0.0.1:4101/index.html'; }],
    ['session', v => { v.session = 'other'; }], ['network', v => { v.network_restrictions = false; }]]) {
    const f = s5Rig({edit});
    const result = await f.run();
    await s5AssertFailed(f, result, /pre-input page identity/);
    assert.equal(pressCount(f), 0, name); assert.equal(f.calls.includes('observer.open'), false, `${name}: no observer before identity`);
    assert.ok(f.calls.indexOf('nvda.stop') > f.calls.indexOf('foreground.close'), `${name}: NVDA stopped last`);
  }
});

test('S5a-N pre-input foreground mismatch (wrong PID or window) sends nothing', async () => {
  const f = s5Rig({foreground: () => ['foreground pid 1 is not the owned browser 4242']});
  const result = await f.run();
  await s5AssertFailed(f, result, /pre-input foreground/);
  assert.equal(pressCount(f), 0);
});

test('S5a-N foreground mismatch at the post-send check marks the send misdelivered and stops before the next action', async () => {
  const f = s5Rig({foreground: ctx => ctx?.phase === 'post' ? ['foreground changed after send'] : []});
  const result = await f.run();
  await s5AssertFailed(f, result, /gate stopped \(post\): .*possibly misdelivered: foreground changed after send/);
  assert.equal(pressCount(f), 1); assert.equal(result.gate.misdelivered, true); assert.equal(result.gate.kind, 'post');
});

test('S5a-N Control or Insert keydown during an action is refused with its seq and stops the journey', async () => {
  for (const extra of ['Control', 'Insert']) {
    const f = s5Rig({transport: async (press, e) => {
      const token = await e.gate.admit(s5Info(press)); e.gate.commit(token); e.key(extra, extra === 'Control' ? {ctrl: true} : {}); e.pressKeys(press);
      await e.gate.release(token, {ended: true});
    }});
    const result = await f.run();
    await s5AssertFailed(f, result, extra === 'Control' ? /modifier|Control/ : /Insert keydown at seq 1 refused/);
    assert.equal(pressCount(f), 1, extra);
  }
});

test('S5a-N wrong or duplicated keydown fails the action; no later action is sent', async () => {
  for (const [name, emit] of [['wrong key', e => e.key('Enter')], ['duplicate key', e => { e.key('Tab'); e.key('Tab'); }]]) {
    const f = s5Rig({transport: async (press, e) => {
      const token = await e.gate.admit(s5Info(press)); e.gate.commit(token); emit(e); await e.gate.release(token, {ended: true});
    }});
    const result = await f.run();
    await s5AssertFailed(f, result, /expected|saw/);
    assert.equal(pressCount(f), 1, name); assert.equal(result.gate.misdelivered, true, name);
  }
});

test('S5a-N a Shift prefix with no shifted Tab stays pending and is refused (ack and final read); nothing later is sent', async () => {
  const f = s5Rig({task: [{step: 'back', press: 'Shift+Tab'}, {step: 'next', press: 'Tab'}], transport: async (press, e) => {
    const token = await e.gate.admit(s5Info(press)); e.gate.commit(token); e.key('Shift', {shift: true}); await e.gate.release(token, {ended: true});
  }});
  const result = await f.run();
  await s5AssertFailed(f, result, /Shift|expected/);
  assert.equal(pressCount(f), 1);
  assert.ok(result.final.ack_errors.length > 0, 'final read refused');
});

test('S5a-N rewritten page journal (prefix rewrite) after the first action stops the journey', async () => {
  const f = s5Rig({edit: (v, e) => { if (e.presses.length >= 2 || (e.presses.length === 1 && e.raw.events.length && e.phrases.length)) v.events[0] = {...v.events[0], key: 'Enter'}; }});
  const result = await f.run();
  await s5AssertFailed(f, result, /prefix|rewritten|history/);
  assert.ok(pressCount(f) <= 2);
  assert.equal(f.presses.length < 3, true);
});

test('S5a-N observer disconnect mid-journey fails the capture; no later action is sent', async () => {
  const f = s5Rig({speak: (press, n) => { if (n === 1) return 'phrase 1'; return null; }, transport: async (press, e) => {
    const token = await e.gate.admit(s5Info(press)); e.gate.commit(token); e.pressKeys(press); await e.gate.release(token, {ended: true});
    if (e.presses.length === 2) e.setObserverLive(false);
  }});
  const result = await f.run();
  await s5AssertFailed(f, result, /disconnected/);
  assert.equal(pressCount(f), 2);
});

test('S5a-N stop at admission, at commit and after commit: original stop kept, no later action, no cancellation claim', async () => {
  const cases = {
    admission: async (press, e) => { e.stop(); await e.gate.admit(s5Info(press)); },
    commit: async (press, e) => { const token = await e.gate.admit(s5Info(press)); e.stop(); if (!e.gate.commit(token)) throw Error('commit refused'); },
    'after commit': async (press, e) => {
      const token = await e.gate.admit(s5Info(press)); e.gate.commit(token); e.pressKeys(press); e.stop(); await e.gate.release(token, {ended: true});
    },
  };
  for (const [name, transport] of Object.entries(cases)) {
    const f = s5Rig({transport});
    const result = await f.run();
    await s5AssertFailed(f, result, /./);
    assert.equal(pressCount(f), 1, name);
    assert.deepEqual([result.gate.kind, result.gate.reason], ['stop', S5_STOP], `${name}: original stop identity`);
    assert.equal(result.gate.sends, name === 'after commit' ? 1 : 0, `${name}: a committed send is counted, never cancelled`);
    assert.equal(result.actions[0].execution.cancellation_requested === true || result.actions[0].capture_status !== 'speech', true, name);
  }
});

test('S5a-N frozen integrity refusal at admission sends nothing to the page', async () => {
  const f = s5Rig({integrity: () => ['qualification scope changed']});
  const result = await f.run();
  await s5AssertFailed(f, result, /./);
  assert.equal(result.gate.kind, 'integrity'); assert.equal(f.raw.events.length, 0); assert.equal(result.gate.sends, 0);
});

test('S5a-N a transport or executor that bypasses the gate never yields a receipt (no alternate send path)', async () => {
  const bypass = s5Rig({transport: async (press, e) => { e.pressKeys(press); }});
  await s5AssertFailed(bypass, await bypass.run(), /receipt|before send|page key/);
  const factory = s5Rig({handles: (h, e) => { h.createExecutor = () => Object.freeze({execute: async action => { e.pressKeys(action.press); }}); }});
  const result = await factory.run();
  await s5AssertFailed(factory, result, /receipt/);
  assert.equal(result.gate.sends, 0);
});

test('S5a-N hung page read and hung executor are bounded; the unsettled executor is reported pending', async () => {
  let reads = 0;
  const hung = s5Rig({data: d => { d.handleTimeoutMs = 100; }, handles: h => { const evaluate = h.page.evaluate; h.page.evaluate = async fn => (++reads === 6 ? new Promise(() => {}) : evaluate(fn)); }});
  await s5AssertFailed(hung, await hung.run(), /timed out/);
  assert.ok(pressCount(hung) <= 1);
  const stuck = s5Rig({hangPress: true});
  const result = await stuck.run();
  await s5AssertFailed(stuck, result, /timed out|pending/);
  assert.ok(result.pending_operations.some(p => p.startsWith('executor#')), JSON.stringify(result.pending_operations));
  assert.equal(pressCount(stuck), 1);
});

test('S5a-N pending operation at teardown and a teardown exception: every later safety step still runs in order', async () => {
  const pendingClose = s5Rig({data: d => { d.handleTimeoutMs = 100; }, handles: h => { h.page.close = () => new Promise(() => {}); }});
  const r1 = await pendingClose.run();
  await s5AssertFailed(pendingClose, r1, /page close: .*timed out/);
  assert.ok(r1.pending_operations.some(p => p.startsWith('page close#')));
  assert.equal(pendingClose.calls.at(-1), 'nvda.stop', 'NVDA still stopped after a hung page close');
  const throwing = s5Rig({handles: (h, e) => { h.observer.close = async () => { e.calls.push('observer.close'); throw Error('relay socket error'); }; }});
  const r2 = await throwing.run();
  await s5AssertFailed(throwing, r2, /observer close: relay socket error/);
  assert.deepEqual(r2.teardown.order.filter(x => x !== 'refusal record'), S5_ORDER);
  assert.deepEqual(r2.teardown.order.slice(-2), ['refusal record', 'seal'], 'refusals are recorded before the seal');
  assert.deepEqual(s5Effects(throwing.calls).slice(-4), ['observer.close', 'foreground.close', 'page.close', 'nvda.stop']);
});

test('S5a-N evidence writer cap violation before input: no send, evidence left unsealed (never complete)', async () => {
  const f = s5Rig({axe: () => ({violations: ['x'.repeat(600000)]})});
  const result = await f.run();
  assert.equal(result.completed, false); assert.equal(pressCount(f), 0);
  assert.equal(result.evidence.sealed, false);
  assert.match(result.reasons.join('\n'), /r2 evidence: record exceeds 524287 bytes/);
  assert.equal((await verifyR2PageEvidence(f.dir, {fixture: S5_FIXTURE, approved: f.approved})).class, 'incomplete');
});

test('S5a-N tampered evidence: a lane changed before seal is refused; a sealed lane changed later fails verification', async () => {
  const f = s5Rig({handles: (h, e) => { h.page.close = async () => { e.calls.push('page.close'); appendS5(joinS5(e.dir, 'focus.jsonl'), '{"forged":true}\n'); }; }});
  const result = await f.run();
  assert.equal(result.completed, false); assert.equal(result.evidence.sealed, false);
  assert.match(result.teardown.errors.join('\n'), /changed on disk before seal/);
  const g = s5Rig();
  assert.equal((await g.run()).completed, true);
  writeS5(joinS5(g.dir, 'speech.jsonl'), '{"kind":"observer-journal","phrases":["forged"]}\n');
  const v = await verifyR2PageEvidence(g.dir, {fixture: S5_FIXTURE, approved: g.approved});
  assert.deepEqual([v.ok, v.class], [false, 'incomplete']);
});

test('S5a-N a fake observer claiming source nvda is still synthetic evidence; nothing promotes it', async () => {
  const f = s5Rig({handles: h => { const read = h.observer.read; h.observer.read = () => ({...read(), source: 'nvda'}); }});
  const result = await f.run();
  assert.equal(result.completed, true, result.reasons.join('; '));
  assert.equal(result.evidence.verdict, 'synthetic');
  s5AssertNoPromotion(result);
  const manifest = JSON.parse(readS5(joinS5(f.dir, 'manifest.json'), 'utf8'));
  assert.deepEqual([manifest.class, manifest.provenance, manifest.authenticity.status], ['synthetic', null, 'absent']);
});

test('S5a-N an external stop after capture completes (during teardown) invalidates the sealed capture; original stop kept', async () => {
  const f = s5Rig({handles: (h, e) => {
    const g = e.gate;
    // Same gate, one teardown hook: the stop lands after captureJourney returned COMPLETE and before the final gate check.
    const wrapped = Object.freeze({...Object.fromEntries(Object.entries(g).filter(([, v]) => typeof v === 'function')), bounds: g.bounds,
      quiesce: ms => { e.stop(); return g.quiesce(ms); }});
    h.guard = wrapped; h.getGate = () => wrapped;
  }});
  const result = await f.run();
  await s5AssertFailed(f, result, /gate not live after the final read/);
  assert.deepEqual([result.gate.kind, result.gate.reason], ['stop', S5_STOP]);
  assert.equal(result.capture.completed, false); assert.equal(result.capture.gate_stop.where, 'compose final read');
  const capture = JSON.parse(readS5(joinS5(f.dir, 'capture.json'), 'utf8'));
  assert.equal(capture.completed, false); assert.equal(capture.records.at(-1).invalidated.by, 'gate-stop');
  assert.equal(pressCount(f), 3);
});

test('S5a-N a committed send still in flight at teardown: LIVE_AT_TEARDOWN, page left open, NVDA still stopped, never complete', async () => {
  const f = s5Rig({transport: async (press, e) => {
    const token = await e.gate.admit(s5Info(press)); e.gate.commit(token); e.pressKeys(press);
    e.sending--; // the fake clock may advance; the send itself never releases (inflight stays committed)
    try { await new Promise(() => {}); } finally { e.sending++; }
  }});
  const result = await f.run();
  await s5AssertFailed(f, result, /LIVE_AT_TEARDOWN|live sends|timed out/);
  assert.equal(result.teardown.quiescence, 'LIVE_AT_TEARDOWN');
  assert.equal(result.teardown.order.includes('page close'), false); assert.equal(f.calls.includes('page.close'), false, 'browser not closed under a live send');
  assert.equal(f.calls.at(-1), 'nvda.stop');
  assert.equal(result.gate.sends, 1, 'the committed send is counted; nothing claims it was cancelled');
  assert.equal(pressCount(f), 1);
});

test('S5a-N a clock that does not advance cannot spin the pre-input foreground wait; a data getter is read once', async () => {
  const f = s5Rig({foreground: () => ['not yet foreground'], handles: h => { h.clock = {now: h.clock.now, wait: async () => {}}; }});
  const result = await f.run();
  await s5AssertFailed(f, result, /clock did not advance/);
  assert.equal(pressCount(f), 0);
  let reads = 0;
  const g = s5Rig({task: [{step: 'only', press: 'Tab'}], data: d => { const spec = d.spec; Object.defineProperty(d, 'spec', {enumerable: true, get: () => (++reads > 1 ? {...spec, pollMs: 1} : spec)}); }});
  const r = await g.run();
  assert.equal(r.completed, true, r.reasons.join('; '));
  assert.equal(reads, 1, 'the caller object is read once and detached');
});

// Review correction B: the final JSON-only check runs after completion is decided. A malformed value reaching the
// result through an injected handle must fail closed: no result escapes and the gate is stopped.
test('S5a-N a malformed final result from an injected handle: no COMPLETE result escapes and the gate is stopped', async () => {
  const forms = [['function in seal errors', () => () => {}, /function at \$\.evidence\.errors\.0/],
    ['class key in seal errors', () => ({class: 'genuine-unqualified'}), /class is assigned only/],
    ['undefined in seal errors', () => undefined, /accessor or undefined at \$\.evidence\.errors\.0/]];
  for (const [name, bad, pattern] of forms) {
    const f = s5Rig({handles: h => {
      const w = h.writer;
      h.writer = Object.freeze({...w, seal: async options => { const s = await w.seal(options); return {...s, verification: {...s.verification, errors: [bad()]}}; }});
    }});
    let returned;
    await assert.rejects(async () => { returned = await f.run(); }, error => {
      assert.match(error.message, /^R2 compose result refused: /, name);
      assert.match(error.message, pattern, name);
      return true;
    }, name);
    assert.equal(returned, undefined, `${name}: no result escapes`);
    assert.equal(f.gate.isStopped(), true, `${name}: gate stopped`);
    assert.equal(f.gate.status().kind, 'protocol', name);
    assert.match(f.gate.status().reason, /R2 compose result refused/, name);
  }
});
