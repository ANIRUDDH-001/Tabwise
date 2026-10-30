// M2C: every failed receipt-mode capture leaves the gate stopped and keeps the receipt evidence.
// Synthetic, in-memory boundaries only: actual frozen sendGate/pageAck, fake transport, fake clock.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sendGate, pageAck, VK} from '../src/speech/sendguard.mjs';
import {captureOfflineJourney, speechModelPayload} from '../src/r2/binding.mjs';
import {createPageInstrumentation} from '../src/r2/page-provider.mjs';

const info = press => ({path:'nvda',keys:(press==='Shift+Tab' ? [VK.Shift,VK.Tab] :
  [({Tab:VK.Tab,Enter:VK.Enter,Space:VK.Space})[press]]).map(vk=>({vk,scan:0,ext:false}))});
const pageKey = press => ({key:press==='Space' ? ' ' : press.replace('Shift+',''),shift:press==='Shift+Tab'});
const turn = () => new Promise(resolve => setImmediate(resolve));
const acksAnything = () => Object.assign(async()=>({ack:true,reasons:[]}),{before:async()=>[]});

function rig({actions=[{step:'a01',press:'Tab'},{step:'a02',press:'Enter'}], transport, r1, receipts=true} = {}) {
  let time=0;const scheduled=[], phrases=[], presses=[];
  const advance = ms => {const end=time+ms;scheduled.sort((a,b)=>a.at-b.at);
    while(scheduled[0]?.at<=end){const item=scheduled.shift();time=item.at;item.fn();}time=end;};
  const clock = {now:()=>time,wait:async ms=>{advance(ms);await turn();}};
  const page = createPageInstrumentation({session:'page',now:()=>9000+time,snapshot:()=>({active:'body',state:{}})});
  const key = press => page.record('keydown',{...pageKey(press),target:'body'});
  const gate = sendGate({settleMs:0,now:()=>time});gate.setIntegrity(()=>[]);gate.setCheck(async()=>[]);
  const frozen = pageAck({read:async cursor=>page.read().events.filter(e=>e.type==='keydown'&&e.seq>cursor),ackMs:1000});
  const ackReader = Object.freeze(r1 ? r1() : Object.assign(token=>frozen(token),{before:token=>frozen.before(token)}));
  const env = {gate,page,key,phrases};
  const executorBindings = {guard:gate,persistActionIntent:async()=>{},checkForeground:async()=>[],
    nvda:{press:async press=>{
      presses.push(press);
      if(transport)return transport(press,env);
      const token=await gate.admit(info(press));if(!gate.commit(token))throw Error('commit refused');
      key(press);await gate.release(token,{ended:true});
    }}};
  const speech = {read:async()=>({source:'synthetic',session:'speech',connected:true,complete:true,phrases:[...phrases]})};
  const options = {fixture_id:'f-ab12',actions,executorBindings,speech,page:{read:()=>page.read()},clock,
    observationMs:50,pollMs:10,timeoutMs:4000};
  if(receipts)options.receiptBindings={getGate:()=>gate,ackReader,onIntent:()=>{}};
  else gate.setAck(ackReader);
  return {...env,options,presses};
}

test('M2C: an R2-only acknowledgement failure after a complete receipt stops the gate without claiming misdelivery',async()=>{
  const f=rig({r1:acksAnything,transport:async(press,{gate})=>{
    const token=await gate.admit(info(press));assert.equal(gate.commit(token),true);await gate.release(token,{ended:true});
  }});
  const result=await captureOfflineJourney(f.options);
  assert.equal(result.completed,false);assert.match(result.reasons.join(';'),/not observed within 1000 ms of gate release/);
  assert.equal(result.records[0].gate_receipt.complete,true,'R1 receipt itself was complete');
  assert.equal(f.gate.isStopped(),true);
  const status=f.gate.status();assert.equal(status.kind,'protocol');assert.equal(status.misdelivered,false);
  assert.match(status.reason,/R2 capture incomplete/);
  assert.deepEqual(f.presses,['Tab']);
});

test('M2C: a duplicate key after the receipt is finalized still stops the gate',async()=>{
  let later=null;
  const f=rig({actions:[{step:'a01',press:'Tab'}],transport:async(press,{gate,key})=>{
    const token=await gate.admit(info(press));assert.equal(gate.commit(token),true);key(press);
    await gate.release(token,{ended:true});later=()=>key(press);
  }});
  // The repeat lands on the page several reads after the transport returned: the executor has settled and the
  // ledger has finished the receipt by then (asserted below), inside the 50ms post-settlement observation.
  const read=f.options.page.read;let after=0;
  f.options.page={read:async()=>{if(later&&++after===4){later();later=null;}return read();}};
  const result=await captureOfflineJourney(f.options);
  assert.equal(result.completed,false);assert.match(result.reasons.join(';'),/saw 2/);
  assert.equal(result.records[0].gate_receipt.complete,true);assert.equal(result.gate_receipts.complete,true);
  assert.equal(f.gate.isStopped(),true);assert.match(f.gate.status().reason,/R2 capture incomplete/);
});

test('M2C: a complete receipt capture leaves the gate as the caller supplied it',async()=>{
  const f=rig();
  const result=await captureOfflineJourney(f.options);
  assert.equal(result.completed,true,result.reasons.join(';'));assert.equal(f.gate.isStopped(),false);
});

test('M2C: an already stopped gate keeps its original stop reason and kind',async()=>{
  const f=rig({r1:()=>Object.assign(async()=>({ack:false,reasons:['synthetic R1 mismatch']}),{before:async()=>[]})});
  const result=await captureOfflineJourney(f.options);
  assert.equal(result.completed,false);assert.equal(f.gate.isStopped(),true);
  assert.doesNotMatch(f.gate.status().reason,/R2 capture incomplete/);
});

test('M2C: without receipts the M1 path does not gain a new gate stop',async()=>{
  const f=rig({receipts:false,r1:acksAnything,actions:[{step:'a01',press:'Tab'}],transport:async(press,{gate})=>{
    const token=await gate.admit(info(press));assert.equal(gate.commit(token),true);await gate.release(token,{ended:true});
  }});
  const result=await captureOfflineJourney(f.options);
  assert.equal(result.completed,false);assert.equal(result.gate_receipts,undefined);
  assert.equal(f.gate.isStopped(),false,'M1 contract unchanged; see M2C handoff limitation');
});

const failures = {
  'foreground refused':f=>{f.options.executorBindings.checkForeground=async()=>['not foreground'];},
  'intent persistence throws':f=>{f.options.executorBindings.persistActionIntent=async()=>{throw Error('synthetic disk full');};},
  'key without gate send':f=>{f.options.executorBindings.nvda.press=async press=>{f.presses.push(press);f.key(press);};},
  'R1 before-call stray':f=>{f.options.receiptBindings.ackReader=Object.freeze(Object.assign(async()=>({ack:true,reasons:[]}),{before:async()=>['stray']}));},
  'wrong page key':f=>{f.options.executorBindings.nvda.press=async press=>{f.presses.push(press);
    const token=await f.gate.admit(info(press));f.gate.commit(token);f.page.record('keydown',{key:'Enter',shift:false,target:'body'});await f.gate.release(token,{ended:true});};},
  // M2D: speech that appears before the release entry is refused as ambiguous, with the same gate invariants.
  'speech before the gate-release boundary':f=>{f.options.executorBindings.nvda.press=async press=>{f.presses.push(press);
    const token=await f.gate.admit(info(press));f.gate.commit(token);f.key(press);f.phrases.push('early');await f.gate.release(token,{ended:true});};},
  'page journal loses events':f=>{const read=f.options.page.read;let k=0;
    f.options.page={read:async()=>{const value=await read();if(f.presses.length&&++k===2)f.page.markIncomplete('synthetic loss');return value;}};},
};
for(const [name,mutate] of Object.entries(failures))test(`M2C evidence invariants on failure: ${name}`,async()=>{
  const f=rig();mutate(f);
  const result=await captureOfflineJourney(f.options);
  const record=result.records.at(-1);
  assert.equal(result.completed,false);assert.equal(result.outcome,'INSUFFICIENT_EVIDENCE');
  assert.equal(result.records.length,1,'no later action runs');assert.ok(f.presses.length<=1);
  assert.equal(f.gate.isStopped(),true);
  assert.equal(record.gate_receipt?.step,'a01');assert.notEqual(record.gate_receipt.finished_at,null);
  assert.equal(record.gate_receipt.complete,false);assert.equal(result.gate_receipts.complete,false);
  assert.ok(['failed','incomplete','ambiguous','disconnected','missing'].includes(record.capture_status));
  assert.ok(record.reasons.length>0);assert.equal(record.ack_timing.reference,'gate-release');
  assert.deepEqual([result.provenance.kind,result.provenance.attestation],['synthetic','UNATTESTED']);
  assert.equal(result.gate_receipts.quiescence,'UNVERIFIED');assert.equal(record.execution.quiescence,'UNVERIFIED');
  assert.deepEqual(JSON.parse(JSON.stringify(result)),result,'serializable evidence');
});

// Post-finalization gate stop: an owned gate stopped after its receipt is finalized must never yield a
// completed, model-eligible capture. Same synthetic boundaries as above; kept in this admitted file so the
// offline runner's classified inventory (47 selected / 9 excluded) is unchanged.
const STOP = 'synthetic external stop';

// hooks: {at:{ms:fn}} absolute fake-clock events; speechRead/pageRead(n, env) run INSIDE the nth read,
// before it returns. env.prev is the previous provider event ('speech', 'page' or 'wait' for a clock wait);
// env.releases records the fake time at which the test's own R1 ack reader was entered for each action.
function stopRig({actions=[{step:'a01',press:'Tab'}], receipts=true, observationMs=200, at={}, speechRead, pageRead} = {}) {
  let time=0, speechReads=0, pageReads=0, last=null;const releases=[];
  const scheduled=Object.entries(at).map(([ms,fn])=>({at:Number(ms),fn})), phrases=[], presses=[];
  const advance = ms => {const end=time+ms;scheduled.sort((a,b)=>a.at-b.at);
    while(scheduled[0]?.at<=end){const item=scheduled.shift();time=item.at;item.fn(env);}time=end;};
  const clock = {now:()=>time,wait:async ms=>{last='wait';advance(ms);await turn();}};
  const page = createPageInstrumentation({session:'page',now:()=>9000+time,snapshot:()=>({active:'body',state:{}})});
  const key = press => page.record('keydown',{...pageKey(press),target:'body'});
  const gate = sendGate({settleMs:0,now:()=>time});gate.setIntegrity(()=>[]);gate.setCheck(async()=>[]);
  const frozen = pageAck({read:async cursor=>page.read().events.filter(e=>e.type==='keydown'&&e.seq>cursor),ackMs:1000});
  const ackReader = Object.freeze(Object.assign(token=>{releases.push(time);return frozen(token);},{before:token=>frozen.before(token)}));
  const env = {gate,page,key,phrases,presses,releases,observationMs,prev:null,now:()=>time,stop:()=>gate.stop(STOP,'stop')};
  const executorBindings = {guard:gate,persistActionIntent:async()=>{},checkForeground:async()=>[],
    nvda:{press:async press=>{
      presses.push(press);
      const token=await gate.admit(info(press));if(!gate.commit(token))throw Error('commit refused');
      key(press);await gate.release(token,{ended:true});
    }}};
  const speech = {read:async()=>{speechReads++;env.prev=last;speechRead?.(speechReads,env);last='speech';
    return {source:'synthetic',session:'speech',connected:true,complete:true,phrases:[...phrases]};}};
  const options = {fixture_id:'f-ab12',actions,executorBindings,speech,
    page:{read:async()=>{pageReads++;env.prev=last;pageRead?.(pageReads,env);last='page';return page.read();}},clock,
    observationMs,pollMs:10,timeoutMs:4000};
  if(receipts)options.receiptBindings={getGate:()=>gate,ackReader,onIntent:()=>{}};
  else gate.setAck(ackReader);
  return {...env,options};
}
const reasons = result => result.reasons.join('; ');

// Invariants for every post-finalization stop: fail closed, keep the original stop, never model-eligible.
function assertInvalidated(f, result, {record=result.records.at(-1)}={}) {
  assert.equal(result.completed,false,'stopped gate cannot complete');
  assert.equal(result.outcome,'INSUFFICIENT_EVIDENCE');
  assert.ok(['failed','incomplete'].includes(record.capture_status),record.capture_status);
  assert.equal(record.silence,undefined,'no successful silence claim');
  const status=f.gate.status();
  assert.deepEqual([status.stopped,status.kind,status.reason,status.misdelivered],[true,'stop',STOP,false],'original stop kept');
  assert.doesNotMatch(status.reason,/R2 capture incomplete/);
  assert.throws(()=>speechModelPayload(result),/incomplete|invalidated/);
  assert.deepEqual([result.provenance.kind,result.provenance.attestation,result.source],['synthetic','UNATTESTED','synthetic-unattested']);
  assert.equal(result.guarded_execution_verified,false);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),result,'serializable evidence');
}

test('post-final stop: external stop after receipt finalization, before the observation window ends',async()=>{
  const f=stopRig({at:{100:env=>env.stop()}});
  const result=await captureOfflineJourney(f.options);
  const record=result.records[0];
  assert.ok(record.gate_receipt.finished_at<100,'receipt finalized before the stop');
  assert.equal(record.gate_receipt.complete,true,'receipt diagnostics stay as recorded');
  assertInvalidated(f,result);
  assert.equal(record.capture_status,'failed');
  assert.match(reasons(result),/gate stopped after receipt finalization/);
  assert.match(reasons(result),new RegExp(STOP));
  assert.deepEqual([result.gate_stop?.kind,result.gate_stop?.reason],['stop',STOP]);
  assert.deepEqual(f.presses,['Tab']);
});

test('post-final stop: speech after the stop is never attributed or admitted to the model payload',async()=>{
  // Speech introduced after cancellation, present in the first read that follows the stop.
  const f=stopRig({at:{100:env=>{env.stop();env.phrases.push('after cancel');}}});
  const result=await captureOfflineJourney(f.options);
  const record=result.records[0];
  assertInvalidated(f,result);
  assert.deepEqual(record.raw_seq,[]);assert.equal(record.text,'');
  assert.ok(result.raw.some(p=>p.text==='after cancel'),'raw diagnostic kept');
  assert.ok(result.unattributed.some(p=>p.text==='after cancel'),'kept as unattributed diagnostics');
});

test('post-final stop: stop and new speech inside the same post-receipt speech read',async()=>{
  const f=stopRig({speechRead:(n,env)=>{if(env.now()>=100&&!env.gate.isStopped()){env.stop();env.phrases.push('during read');}}});
  const result=await captureOfflineJourney(f.options);
  assertInvalidated(f,result);
  assert.deepEqual(result.records[0].raw_seq,[]);
  assert.ok(result.unattributed.some(p=>p.text==='during read'));
});

// Phase locator from observable provider and executor lifecycle only: no production function names, stack
// traces, read counts or real elapsed time. env.releases holds the fake-clock time at which the test's own R1
// ack reader was entered for each action (the gate-release reader entry). afterWindow(env, k): a speech read
// directly after a page read, with no clock wait between, once action k's window (release + observationMs)
// has ended. That is the first read after action k's observation loop broke: for the last action, the
// journey's final boundary speech read; otherwise the next action's first pre-action speech read.
const afterWindow = (env, k) => env.prev === 'page' && env.releases.length === k &&
  env.now() >= env.releases[k-1] + env.observationMs;
const phase = (env, where) => ({where, t:env.now(), prev:env.prev, releases:[...env.releases], presses:[...env.presses]});

// Asserts the stop fired once, after action k's release, receipt finalization and observation window.
function assertPhase(fired, record, {where, presses=['Tab']}) {
  assert.ok(fired,'the cancellation fired');
  assert.equal(fired.where,where);
  assert.deepEqual(fired.presses,presses,'stop after the intended send, before any later one');
  assert.equal(fired.releases.length,presses.length);
  assert.ok(record.gate_receipt?.finished_at<=fired.t,'receipt finalized before the stop');
  assert.ok(record.observation_window.to<=fired.t,'observation window ended before the stop');
}

test('post-final stop: stop during the final speech boundary read',async()=>{
  let fired=null;
  const f=stopRig({speechRead:(n,env)=>{if(!fired&&afterWindow(env,1)){fired=phase(env,'final speech boundary read');env.stop();}}});
  const result=await captureOfflineJourney(f.options);
  assertPhase(fired,result.records[0],{where:'final speech boundary read'});
  assertInvalidated(f,result);
  assert.match(reasons(result),/final boundary: owned gate stopped after receipt finalization/);
  assert.equal(result.gate_stop.where,'speech read');
  assert.deepEqual(result.records[0].invalidated,{by:'gate-stop',where:'final boundary',prior_capture_status:'observed-silence',
    prior_silence:result.records[0].invalidated.prior_silence});
  assert.equal(result.records[0].invalidated.prior_silence.transport_live,true,'prior claim kept as diagnostics only');
});

test('post-final stop: stop during the final page boundary read',async()=>{
  // The page read that directly follows the final boundary speech read.
  let fired=null, armed=false;
  const f=stopRig({speechRead:(n,env)=>{if(!fired&&!armed&&afterWindow(env,1))armed=true;},
    pageRead:(n,env)=>{if(armed&&!fired&&env.prev==='speech'){fired=phase(env,'final page boundary read');env.stop();}}});
  const result=await captureOfflineJourney(f.options);
  assertPhase(fired,result.records[0],{where:'final page boundary read'});
  assertInvalidated(f,result);
  assert.match(reasons(result),/final boundary: owned gate stopped after receipt finalization/);
  assert.equal(result.gate_stop.where,'page read');
  assert.equal(result.unattributed_page.at(-1).invalidated_by,'gate-stop');
});

// Control, not a new defect: a stop between actions was already refused before D-79 (the next action's receipt
// begin sees a stopped gate). The stop fires inside a02's first pre-action speech read, after a01's window.
test('post-final stop: multiple actions with a stop between actions (control: fails closed before and after D-79)',async()=>{
  const actions=[{step:'a01',press:'Tab'},{step:'a02',press:'Enter'}];
  let fired=null;
  const f=stopRig({actions,speechRead:(n,env)=>{if(!fired&&afterWindow(env,1)){fired=phase(env,'between actions');env.stop();}}});
  const result=await captureOfflineJourney(f.options);
  assertPhase(fired,result.records[0],{where:'between actions'});
  assert.equal(result.completed,false);assert.equal(result.outcome,'INSUFFICIENT_EVIDENCE');
  assert.deepEqual(f.presses,['Tab'],'no send after the stop');
  assert.equal(result.records.length,2);
  assert.equal(result.records[0].capture_status,'observed-silence','a01 was complete while the gate was live');
  assert.equal(result.records[1].capture_status,'failed');assert.equal(result.records[1].execution.started,false);
  assert.match(reasons(result),/a02: [^;]*gate stopped/);
  const status=f.gate.status();assert.deepEqual([status.stopped,status.kind,status.reason,status.misdelivered],[true,'stop',STOP,false]);
  assert.throws(()=>speechModelPayload(result),/incomplete|invalidated/);
});

test('post-final stop: a successful multi-action capture with no stop still completes',async()=>{
  const f=stopRig({actions:[{step:'a01',press:'Tab'},{step:'a02',press:'Enter'}],at:{150:env=>env.phrases.push('focus moved')}});
  const result=await captureOfflineJourney(f.options);
  assert.equal(result.completed,true,reasons(result));assert.equal(result.outcome,'COMPLETE');
  assert.equal(result.gate_stop,undefined);assert.equal(f.gate.isStopped(),false);
  assert.deepEqual(result.records.map(r=>r.capture_status),['speech','observed-silence']);
  assert.deepEqual(result.records[1].silence,{transport_live:true,from:result.records[1].observation_window.from,
    to:result.records[1].observation_window.to,unit:'node-monotonic-ms'});
  assert.equal(speechModelPayload(result).observations[0].speech,'focus moved');
});

test('post-final stop: an invalidated capture is refused by the model payload even if completed is forged',async()=>{
  const f=stopRig({at:{100:env=>env.stop()}});
  const result=await captureOfflineJourney(f.options);
  const forged=structuredClone(result);forged.completed=true;forged.outcome='COMPLETE';
  assert.throws(()=>speechModelPayload(forged),/invalidated/);
  const recordOnly=structuredClone(forged);delete recordOnly.gate_stop;
  assert.throws(()=>speechModelPayload(recordOnly),/invalidated/);
});

test('post-final stop: the M1 path is unchanged (no gate revalidation, no new fields, no gate stop)',async()=>{
  const f=stopRig({receipts:false,observationMs:50});
  const result=await captureOfflineJourney(f.options);
  assert.equal(result.completed,true,reasons(result));
  assert.equal(result.gate_stop,undefined);assert.equal(result.gate_receipts,undefined);
  assert.equal(result.records[0].ack_timing.reference,'executor-request');
  assert.equal(result.records[0].capture_status,'observed-silence');assert.equal(f.gate.isStopped(),false);
});
