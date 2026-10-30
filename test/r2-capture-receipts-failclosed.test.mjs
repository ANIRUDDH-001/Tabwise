// M2C: every failed receipt-mode capture leaves the gate stopped and keeps the receipt evidence.
// Synthetic, in-memory boundaries only: actual frozen sendGate/pageAck, fake transport, fake clock.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sendGate, pageAck, VK} from '../src/speech/sendguard.mjs';
import {captureOfflineJourney} from '../src/r2/binding.mjs';
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
