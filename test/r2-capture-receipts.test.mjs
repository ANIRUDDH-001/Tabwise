// M2B: R2 capture with the M2A gate-release receipt ledger. Every boundary is in-memory and synthetic:
// the actual frozen sendGate and pageAck run against a fake transport and a synthetic page journal.
// Nothing here launches a browser, NVDA, a socket or physical input, and nothing attests a physical send.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sendGate, pageAck, VK} from '../src/speech/sendguard.mjs';
import {captureOfflineJourney, speechModelPayload} from '../src/r2/binding.mjs';
import {captureJourney} from '../src/r2/capture.mjs';
import {createPageInstrumentation} from '../src/r2/page-provider.mjs';
import {createSendReceiptLedger} from '../src/r2/send-receipt.mjs';

const info = press => ({path:'nvda',keys:(press==='Shift+Tab' ? [VK.Shift,VK.Tab] :
  [({Tab:VK.Tab,Enter:VK.Enter,Space:VK.Space})[press]]).map(vk=>({vk,scan:0,ext:false}))});
const pageKey = press => ({key:press==='Space' ? ' ' : press.replace('Shift+',''),shift:press==='Shift+Tab'});
// Yield a macrotask so the fake transport's real timers (gate settle delay, executor setImmediate) can run.
const turn = () => new Promise(resolve => setImmediate(resolve));

function rig({actions=[{step:'a01',press:'Tab'}], intentMs=0, foregroundMs=0, keyMs=0, releaseMs=0,
  transport, r1, check, observationMs=50, pollMs=10, timeoutMs=4000} = {}) {
  let time=0;
  const scheduled=[], phrases=[], presses=[];
  const advance = ms => {
    const end=time+ms;scheduled.sort((a,b)=>a.at-b.at);
    while(scheduled[0]?.at<=end){const item=scheduled.shift();time=item.at;item.fn();}
    time=end;
  };
  const later = (ms,fn) => scheduled.push({at:time+ms,fn});
  const sleep = ms => ms>0 ? new Promise(resolve=>later(ms,resolve)) : Promise.resolve();
  const clock = {now:()=>time,wait:async ms=>{advance(ms);await turn();}};
  const page = createPageInstrumentation({session:'page',now:()=>9000+time,snapshot:()=>({active:'body',state:{}})});
  const key = press => page.record('keydown',{...pageKey(press),target:'body'});
  const gate = sendGate({settleMs:0,now:()=>time});
  gate.setIntegrity(()=>[]);
  gate.setCheck(async context=>check ? check(context,{advance,sleep,later}) : []);
  // The actual frozen R1 page acknowledgement reader, over the same journal with its own cursor.
  const frozen = pageAck({read:async cursor=>page.read().events.filter(e=>e.type==='keydown'&&e.seq>cursor),ackMs:1000});
  const ackReader = Object.freeze(r1 ? r1(frozen) : Object.assign(token=>frozen(token),{before:token=>frozen.before(token)}));
  const env = {gate,page,key,advance,later,sleep,phrases,presses,now:()=>time};
  const executorBindings = {guard:gate,
    persistActionIntent:async()=>{advance(intentMs);},
    checkForeground:async()=>{advance(foregroundMs);return [];},
    nvda:{press:async press=>{
      presses.push(press);
      if(transport)return transport(press,env);
      const token=await gate.admit(info(press));
      if(!gate.commit(token))throw Error('fake transport: commit refused');
      if(keyMs===0)key(press);else if(keyMs!==null)later(keyMs,()=>key(press));
      await sleep(releaseMs);
      await gate.release(token,{ended:true});
    }}};
  const speech = {read:async()=>({source:'synthetic',session:'speech',connected:true,complete:true,phrases:[...phrases]})};
  const options = {fixture_id:'f-ab12',actions,executorBindings,speech,page:{read:()=>page.read()},clock,
    observationMs,pollMs,timeoutMs,receiptBindings:{getGate:()=>gate,ackReader,onIntent:()=>{}}};
  return {...env,options,clock,executorBindings,ackReader};
}
const reasons = result => result.reasons.join('; ');

test('M2B: 600ms intent + 401ms foreground is acknowledged against the gate-release boundary, not the executor request',async()=>{
  const f=rig({intentMs:600,foregroundMs:401});
  const result=await captureOfflineJourney(f.options);
  const record=result.records[0];
  assert.equal(result.completed,true,reasons(result));assert.equal(result.outcome,'COMPLETE');
  assert.equal(record.ack_timing.reference,'gate-release');assert.equal(record.ack_timing.deadline_ms,1000);
  assert.equal(record.ack_timing.clock,'node-monotonic-ms');
  assert.ok(record.ack_timing.release_at>=1001,'release is after the slow intent and foreground checks');
  assert.ok(record.ack_timing.observed_at-record.ack_timing.release_at<=1000);
  assert.ok(record.ack_timing.observed_at>=record.ack_timing.commit_not_before);
  assert.equal(record.ack_seq,1);
  assert.equal(record.gate_receipt.complete,true);assert.equal(record.gate_receipt.released_at,record.ack_timing.release_at);
  assert.equal(result.gate_receipts.complete,true);assert.equal(result.gate_receipts.receipts.length,1);
});

test('M2B: synthetic/unattested provenance and unverified quiescence survive a complete receipt capture',async()=>{
  const result=await captureOfflineJourney(rig().options);
  assert.equal(result.completed,true,reasons(result));
  assert.equal(result.source,'synthetic-unattested');assert.equal(result.guarded_execution_verified,false);
  assert.deepEqual([result.provenance.kind,result.provenance.attestation],['synthetic','UNATTESTED']);
  const receipts=result.gate_receipts;
  assert.deepEqual([receipts.provenance.kind,receipts.provenance.attestation],['synthetic','UNATTESTED']);
  assert.equal(receipts.physical_delivery_verified,false);assert.equal(receipts.guarded_execution_verified,false);
  assert.equal(receipts.r2_page_ack_verified,false);assert.equal(receipts.quiescence,'UNVERIFIED');
  assert.equal(result.records[0].execution.quiescence,'UNVERIFIED');
  assert.equal(result.records[0].gate_receipt.physical_delivery_verified,false);
});

test('M2B: page events are observed while executor settlement is still pending (slow post-send check)',async()=>{
  const f=rig({check:async(context,{sleep})=>{if(context.phase==='post')await sleep(3000);return [];}});
  const result=await captureOfflineJourney(f.options);
  const record=result.records[0];
  assert.equal(result.completed,true,reasons(result));
  assert.ok(record.ack_timing.observed_at-record.ack_timing.release_at<=1000);
  assert.ok(record.gate_receipt.finished_at>=record.ack_timing.release_at+3000,'executor settled long after the timely key');
  assert.ok(record.page.samples.some(s=>s.node_received.t<record.gate_receipt.finished_at),'page read concurrently with settlement');
});

test('M2B contrast: without receipts the same slow pre-send path keeps the conservative executor-request refusal',async()=>{
  const f=rig({intentMs:600,foregroundMs:401});
  delete f.options.receiptBindings;f.gate.setAck(f.ackReader);
  const result=await captureOfflineJourney(f.options);
  assert.equal(result.completed,false);assert.equal(result.records[0].ack_timing.reference,'executor-request');
  assert.match(reasons(result),/1000 ms of executor request/);assert.equal(result.gate_receipts,undefined);
});

test('M2B: a delayed page-journal inspection cannot make an early page-clock key timely',async()=>{
  const f=rig();let reads=0;
  // The key is journaled at release time (page clock), but the read that reveals it returns 1500ms later.
  f.options.page={read:async()=>{const value=f.page.read();if(value.events.some(e=>e.type==='keydown')&&reads++===0)f.advance(1500);return value;}};
  const result=await captureOfflineJourney(f.options);
  const record=result.records[0];
  assert.equal(result.completed,false);assert.equal(record.ack_seq,null);assert.equal(record.ack_timing.observed_at,null);
  assert.match(reasons(result),/after 1000 ms of gate release/);
  assert.ok(record.ack_timing.late_observed_at-record.ack_timing.release_at>1000);
  const event=record.page.events.find(e=>e.type==='keydown');
  assert.ok(event.t-9000<=record.ack_timing.release_at,'page timestamp itself looked early');
});

test('M2B: a key that never reaches the page fails at release + 1000ms even when R1 claims acknowledgement',async()=>{
  // Independent R1 evidence: this reader always acknowledges, the R2 page never sees the key.
  const f=rig({keyMs:null,r1:()=>Object.assign(async()=>({ack:true,reasons:[]}),{before:async()=>[]}),
    check:async(context,{sleep})=>{if(context.phase==='post')await sleep(3000);return [];}});
  const result=await captureOfflineJourney(f.options);
  const record=result.records[0];
  assert.equal(result.completed,false);assert.equal(record.ack_seq,null);
  assert.match(reasons(result),/not observed within 1000 ms of gate release/);
  assert.equal(f.now()<record.ack_timing.release_at+1000+50,true,'fails promptly, not after executor settlement');
  assert.deepEqual(result.gate_receipts.receipts[0].r1_ack.result,{ack:true,reasons:[]},'R1 evidence preserved separately');
});

test('M2B: a key on the page without any gate release receipt is never an acknowledgement',async()=>{
  // An unguarded transport: the key reaches the page but nothing passes through the gate.
  const f=rig({transport:(press,{key})=>{key(press);}});
  const result=await captureOfflineJourney(f.options);
  const record=result.records[0];
  assert.equal(result.completed,false);assert.equal(record.ack_seq,null);
  assert.match(reasons(result),/receipt/);
  assert.equal(record.gate_receipt.released_at,null);assert.equal(record.gate_receipt.complete,false);
});

test('M2B: an incomplete send (commit, then transport error before release) fails closed',async()=>{
  const f=rig({transport:async(press,{gate,key})=>{
    const token=await gate.admit(info(press));assert.equal(gate.commit(token),true);key(press);
    throw Error('synthetic socket write failure');
  }});
  const result=await captureOfflineJourney(f.options);
  const record=result.records[0];
  assert.equal(result.completed,false);assert.equal(record.ack_seq,null);
  assert.equal(record.gate_receipt.released_at,null);assert.equal(record.gate_receipt.complete,false);
  assert.equal(f.gate.isStopped(),true);
});

test('M2B: an invalid R1 acknowledgement invalidates the receipt and the capture even when R2 saw the key',async()=>{
  const f=rig({r1:()=>Object.assign(async()=>({ack:false,reasons:['synthetic R1 mismatch']}),{before:async()=>[]})});
  const result=await captureOfflineJourney(f.options);
  const record=result.records[0];
  assert.equal(result.completed,false);assert.match(reasons(result),/receipt/);
  assert.deepEqual(record.gate_receipt.r1_ack.result,{ack:false,reasons:['synthetic R1 mismatch']});
  assert.equal(record.gate_receipt.complete,false);
});

test('M2B: a release after the collection bound is expired and late, never promoted',async()=>{
  const f=rig({releaseMs:5000,timeoutMs:2000});
  const result=await captureOfflineJourney(f.options);
  const record=result.records[0];
  assert.equal(result.completed,false);assert.match(reasons(result),/timed out/);
  assert.equal(record.gate_receipt.expired,true);assert.equal(record.gate_receipt.complete,false);
  assert.equal(record.execution.cancellation_requested,true);assert.equal(f.gate.isStopped(),true);
});

test('M2B: a key journaled before the gate before-call boundary is contradictory, not an acknowledgement',async()=>{
  // R1's own before() is bypassed here so the contradiction must be caught by R2's independent observation.
  const f=rig({intentMs:0,r1:()=>Object.assign(async()=>({ack:true,reasons:[]}),{before:async()=>[]}),
    transport:async(press,{gate,key,advance})=>{
      key(press);advance(20);await turn();await turn();
      const token=await gate.admit(info(press));assert.equal(gate.commit(token),true);
      await gate.release(token,{ended:true});
    }});
  const result=await captureOfflineJourney(f.options);
  const record=result.records[0];
  assert.equal(result.completed,false);assert.equal(record.ack_seq,null);
  assert.match(reasons(result),/before the gate commit window/);
});

test('M2B: duplicate keydowns after release fail the R2 acknowledgement',async()=>{
  const f=rig({r1:()=>Object.assign(async()=>({ack:true,reasons:[]}),{before:async()=>[]}),
    transport:async(press,{gate,key,later})=>{
      const token=await gate.admit(info(press));assert.equal(gate.commit(token),true);
      key(press);later(5,()=>key(press));await gate.release(token,{ended:true});
    }});
  const result=await captureOfflineJourney(f.options);
  assert.equal(result.completed,false);assert.match(reasons(result),/expected "Tab" once, saw 2/);
});

test('M2B: capture clock regression during concurrent observation fails closed and expires the receipt',async()=>{
  const f=rig({check:async(context,{sleep})=>{if(context.phase==='post')await sleep(200);return [];}});
  let calls=0;const now=f.clock.now;
  f.options.clock={...f.clock,now:()=>f.presses.length&&++calls===3 ? now()-5 : now()};
  const result=await captureOfflineJourney(f.options);
  assert.equal(result.completed,false);assert.match(reasons(result),/clock/);
  assert.equal(result.gate_receipts.complete,false);assert.equal(f.gate.isStopped(),true);
});

test('M2B: cancellation mid-settlement stops the gate, expires the receipt and sends nothing further',async()=>{
  const f=rig({actions:[{step:'a01',press:'Tab'},{step:'a02',press:'Enter'}],
    check:async(context,{sleep})=>{if(context.phase==='post')await sleep(500);return [];}});
  let reads=0;const read=f.options.speech.read;
  f.options.speech={read:async context=>{const value=await read(context);if(f.presses.length&&++reads===3)value.connected=false;return value;}};
  const result=await captureOfflineJourney(f.options);
  const record=result.records[0];
  assert.equal(result.completed,false);assert.equal(record.capture_status,'disconnected');
  assert.equal(record.execution.cancellation_requested,true);assert.equal(record.gate_receipt.expired,true);
  assert.equal(f.gate.isStopped(),true);assert.deepEqual(f.presses,['Tab']);assert.equal(result.records.length,1);
});

test('M2B: sequential actions are each anchored to their own release receipt',async()=>{
  const f=rig({actions:[{step:'a01',press:'Tab'},{step:'a02',press:'Shift+Tab'},{step:'a03',press:'Enter'},{step:'a04',press:'Space'}],intentMs:300});
  const result=await captureOfflineJourney(f.options);
  assert.equal(result.completed,true,reasons(result));
  const releases=result.records.map(r=>r.ack_timing.release_at);
  assert.deepEqual(result.records.map(r=>r.gate_receipt.token.id),[1,2,3,4]);
  assert.ok(releases.every((t,i)=>i===0||t>releases[i-1]));
  assert.ok(result.records.every(r=>r.ack_timing.observed_at-r.ack_timing.release_at<=1000));
  assert.equal(result.gate_receipts.complete,true);
});

test('M2B: the model payload carries no gate receipt, token, timing or page data',async()=>{
  const result=await captureOfflineJourney(rig().options);
  assert.equal(result.completed,true,reasons(result));
  const text=JSON.stringify(speechModelPayload(result));
  for(const word of ['receipt','token','release','r1_ack','ack_timing','node-monotonic','keydown','page'])assert.equal(text.includes(word),false,word);
});

test('M2B: captureJourney refuses a receipt ledger it did not get from createSendReceiptLedger',async()=>{
  let reads=0;
  const provider={read:async()=>{reads++;return null;}};
  const forged=Object.freeze({begin(){},finish:async()=>({complete:true}),expire(){},read:()=>({receipts:[]})});
  await assert.rejects(captureJourney({fixture_id:'f-ab12',actions:[{step:'a01',press:'Tab'}],speech:provider,page:provider,
    execute:async()=>{},clock:{now:()=>0,wait:async()=>{}},observationMs:10,receipts:forged}),/receipt ledger/);
  assert.equal(reads,0);
});

for(const offset of [500,-5000])test(`M2B: a receipt ledger on a clock ${offset}ms off the capture clock is contradictory, not a deadline anchor`,async()=>{
  const f=rig();f.advance(10000); // Keep the shifted ledger clock non-negative.
  const ledger=createSendReceiptLedger({gate:f.gate,getGate:()=>f.gate,ackReader:f.ackReader,onIntent:()=>{},
    actions:[{step:'a01',press:'Tab'}],now:()=>f.now()+offset});
  const execute=async()=>{f.gate.arm('tabwise:a01');try{await f.executorBindings.nvda.press('Tab');}finally{f.gate.disarm();}};
  const result=await captureJourney({fixture_id:'f-ab12',actions:[{step:'a01',press:'Tab'}],speech:f.options.speech,
    page:f.options.page,execute,clock:f.clock,observationMs:50,timeoutMs:4000,receipts:ledger});
  assert.equal(result.completed,false);assert.match(reasons(result),/contradictory clock domain/);
  assert.equal(result.records[0].ack_seq,null);assert.equal(f.gate.isStopped(),true);
});

test('M2B: receipt bindings are validated before any provider read or executor construction',async()=>{
  const f=rig();let reads=0;
  f.options.speech={read:async()=>{reads++;return null;}};
  f.options.receiptBindings={...f.options.receiptBindings,ackReader:Object.assign(async()=>({ack:true,reasons:[]}),{before:async()=>[]})};
  await assert.rejects(captureOfflineJourney(f.options),/frozen|immutable/);
  assert.equal(reads,0);assert.deepEqual(f.presses,[]);
});

test('M2B: an externally stopped gate fails the action even after a timely independent R2 key observation',async()=>{
  const f=rig({transport:async(press,{gate,key})=>{
    const token=await gate.admit(info(press));assert.equal(gate.commit(token),true);key(press);
    gate.stop('synthetic external stop','stop');
    await gate.release(token,{ended:true});
  }});
  const result=await captureOfflineJourney(f.options);
  const record=result.records[0];
  assert.equal(result.completed,false);assert.equal(record.capture_status,'failed');
  assert.match(reasons(result),/stopped/);
  assert.equal(record.gate_receipt.complete,false);assert.equal(result.gate_receipts.complete,false);
});

test('M2B: a capture cannot complete while the receipt ledger journey is incomplete',async()=>{
  const f=rig();
  const ledger=createSendReceiptLedger({gate:f.gate,getGate:()=>f.gate,ackReader:f.ackReader,onIntent:()=>{},
    actions:[{step:'a01',press:'Tab'},{step:'a02',press:'Enter'}],now:()=>f.now()});
  const execute=async()=>{f.gate.arm('tabwise:a01');try{await f.executorBindings.nvda.press('Tab');}finally{f.gate.disarm();}};
  const result=await captureJourney({fixture_id:'f-ab12',actions:[{step:'a01',press:'Tab'}],speech:f.options.speech,
    page:f.options.page,execute,clock:f.clock,observationMs:50,timeoutMs:4000,receipts:ledger});
  assert.equal(result.records[0].gate_receipt.complete,true);
  assert.equal(result.completed,false);assert.equal(result.outcome,'INSUFFICIENT_EVIDENCE');
  assert.match(reasons(result),/receipt ledger journey incomplete/);
});
