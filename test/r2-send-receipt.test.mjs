import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sendGate, VK} from '../src/speech/sendguard.mjs';
import {createGuardedPressExecutor} from '../scripts/tabwise/executor.mjs';
import {captureOfflineJourney} from '../src/r2/binding.mjs';
import {createPageInstrumentation} from '../src/r2/page-provider.mjs';
import {createSendReceiptLedger} from '../src/r2/send-receipt.mjs';

const actions = [{step:'a01',press:'Tab'},{step:'a02',press:'Enter'}];
const info = press => ({path:'nvda',keys:(press==='Shift+Tab' ? [VK.Shift,VK.Tab] :
  [({Tab:VK.Tab,Enter:VK.Enter,Space:VK.Space})[press]]).map(vk=>({vk,scan:0,ext:false}))});
const deferred = () => { let resolve; const promise = new Promise(r=>{resolve=r;}); return {promise,resolve}; };

function rig({ack, before, check, intent} = {}) {
  let time=0;
  const gate=sendGate({settleMs:0,now:()=>time});
  gate.setIntegrity(()=>[]);
  gate.setCheck(async context=>check ? check(context) : []);
  const journal=[], calls=[];
  const reader=Object.freeze(Object.assign(async token=>{calls.push(['ack',token]);return ack ? ack(token) : {ack:true,reasons:[]};},
    {before:async token=>{calls.push(['before',token]);return before ? before(token) : [];}}));
  const options={gate,getGate:()=>gate,ackReader:reader,now:()=>time,actions,
    onIntent:token=>{journal.push(token);return intent?.(token);}};
  const ledger=createSendReceiptLedger(options);
  const begin=(step='a01')=>ledger.begin(step,{deadlineAt:10000});
  const send=async (press='Tab')=>{
    const token=await gate.admit(info(press));
    if(!gate.commit(token))throw Error('fake transport: commit refused');
    calls.push(['fake-transport',press,time]);
    await gate.release(token,{ended:true});
    return token;
  };
  return {gate,ledger,options,reader,journal,calls,begin,send,
    advance:ms=>{time+=ms;},setTime:t=>{time=t;},now:()=>time};
}

test('actual gate receipt preserves token identity, R1 ack, counters and a bounded commit inference',async()=>{
  const f=rig();f.begin();f.gate.arm('tabwise:a01');const token=await f.send();
  const receipt=await f.ledger.finish('a01');
  assert.equal(receipt.complete,true);assert.equal(receipt.token.id,token.id);
  assert.equal(receipt.token.action_label,'tabwise:a01');
  assert.deepEqual(receipt.expected_key,{key:'Tab',shift:false});
  assert.equal(f.calls.find(c=>c[0]==='before')[1],token);
  assert.equal(f.calls.find(c=>c[0]==='ack')[1],token);
  assert.equal(f.journal[0],token,'existing intent hook remains in the path');
  assert.deepEqual(receipt.r1_ack.result,{ack:true,reasons:[]});
  assert.deepEqual(receipt.commit,{kind:'gate-state-inference',not_before:0,not_after:0,sends_before:0,sends_after:1});
  assert.equal(receipt.committed_at,undefined);assert.equal(receipt.physical_delivery_verified,false);
  assert.equal(receipt.guarded_execution_verified,false);assert.equal(receipt.quiescence,'UNVERIFIED');
  receipt.token.id=99;assert.equal(f.ledger.read().receipts[0].token.id,1);
});

test('released_at is stamped at reader entry rather than after an asynchronous reader resolves',async()=>{
  let f; f=rig({before:async()=>{f.advance(10);return [];},ack:async()=>{f.advance(700);return {ack:true,reasons:[]};}});
  f.begin();f.gate.arm('tabwise:a01');await f.send();const r=await f.ledger.finish('a01');
  assert.equal(r.before_call_at,0);assert.equal(r.before_settled_at,10);
  assert.equal(r.released_at,10);assert.equal(r.r1_ack.completed_at,710);
  assert.deepEqual(r.commit,{kind:'gate-state-inference',not_before:10,not_after:10,sends_before:0,sends_after:1});
});

test('600ms intent + 401ms foreground: real gate receipt exists but current R2 capture still refuses',async()=>{
  const f=rig();let journal;
  const page=createPageInstrumentation({session:'page',now:()=>9000+f.now(),snapshot:()=>({active:'body',state:{}})});
  const executorBindings={guard:f.gate,persistActionIntent:async()=>{f.advance(600);},checkForeground:async()=>{f.advance(401);return [];},
    nvda:{press:async press=>{
      const token=await f.gate.admit(info(press));assert.equal(f.gate.commit(token),true);
      page.record('keydown',{key:'Tab',shift:false,target:'body'});
      await f.gate.release(token,{ended:true});
    }}};
  f.begin();
  journal=await captureOfflineJourney({fixture_id:'f-ab12',actions:[actions[0]],executorBindings,
    speech:{read:()=>({source:'synthetic',session:'speech',connected:true,complete:true,phrases:[]})},
    page:{read:()=>page.read()},clock:{now:f.now,wait:async ms=>f.advance(ms)},observationMs:20,timeoutMs:2000});
  const r=await f.ledger.finish('a01');assert.equal(r.released_at,1001);assert.equal(r.complete,true);
  assert.equal(journal.completed,false);assert.equal(journal.records[0].ack_seq,null);
  assert.equal(journal.records[0].ack_timing.deadline_ms,1000);
  assert.match(journal.reasons.join(';'),/1000 ms of executor request/);
  assert.equal(f.ledger.read().r2_page_ack_verified,false);
});

test('slow post-send foreground checking cannot move release-entry time or attest a later page inspection',async()=>{
  let f;f=rig({check:async context=>{if(context.phase==='post')f.advance(5000);return [];}});
  f.begin();f.gate.arm('tabwise:a01');await f.send();const r=await f.ledger.finish('a01');
  assert.equal(r.released_at,0);assert.equal(r.finished_at,5000);assert.equal(r.complete,true);
  assert.equal(r.r2_page_ack_verified,false);assert.equal(f.ledger.read().provenance.attestation,'UNATTESTED');
});

test('missing R1 acknowledgement stays missing and never becomes a complete receipt',async()=>{
  const f=rig({ack:async()=>({ack:false,reasons:['expected Tab once, saw 0']})});
  f.begin();f.gate.arm('tabwise:a01');await f.send();const r=await f.ledger.finish('a01');
  assert.equal(r.complete,false);assert.equal(r.r1_ack.result.ack,false);
  assert.equal(r.gate_finished.acks.missing,1);assert.ok(r.commit);
});

for(const press of ['Tab','Shift+Tab','Enter','Space'])test(`actual gate supports exact receipt key ${press}`,async()=>{
  const f=rig();
  // The ledger copies its action contract, so use a new owned gate for each key.
  const gate=sendGate({settleMs:0,now:()=>0});gate.setIntegrity(()=>[]);gate.setCheck(async()=>[]);
  const ledger=createSendReceiptLedger({...f.options,gate,getGate:()=>gate,actions:[{step:'a01',press}]});
  ledger.begin('a01',{deadlineAt:10000});gate.arm('tabwise:a01');
  const token=await gate.admit(info(press));assert.equal(gate.commit(token),true);await gate.release(token,{ended:true});
  const r=await ledger.finish('a01');assert.equal(r.complete,true);
  assert.deepEqual(r.expected_key,{key:press==='Space'?' ':press.replace('Shift+',''),shift:press==='Shift+Tab'});
});

test('wrong labels and keys are refused before fake transport or original ack reader',async()=>{
  for(const [label,press] of [['wrong-label','Tab'],['tabwise:a01','Enter']]){
    const f=rig();f.begin();f.gate.arm(label);
    await assert.rejects(f.gate.admit(info(press)),/label|key/);
    assert.deepEqual(f.calls,[]);assert.equal(f.gate.status().sends,0);
    assert.equal((await f.ledger.finish('a01')).complete,false);
  }
});

test('failed commit produces no release timestamp or invented commit receipt',async()=>{
  const f=rig();f.begin();f.gate.arm('tabwise:a01');const token=await f.gate.admit(info('Tab'));
  f.advance(101);assert.equal(f.gate.commit(token),false);
  const r=await f.ledger.finish('a01');assert.equal(r.complete,false);assert.equal(r.released_at,null);assert.equal(r.commit,null);
  assert.equal(r.gate_finished.sends,0);
});

test('cancellation before admission has no token; cancellation after commit preserves only inferred commit',async()=>{
  for(const after of [false,true]){
    const f=rig();f.begin();f.gate.arm('tabwise:a01');let token;
    if(after){token=await f.gate.admit(info('Tab'));assert.equal(f.gate.commit(token),true);}
    f.gate.stop('synthetic cancellation','stop');
    if(after)await f.gate.release(token,{ended:true});else await assert.rejects(f.gate.admit(info('Tab')),/R1_REFUSED/);
    const r=await f.ledger.finish('a01');assert.equal(r.complete,false);assert.equal(Boolean(r.commit),after);
    assert.equal(r.token===null,!after);assert.equal(r.physical_delivery_verified,false);
  }
});

test('concurrent actions and concurrent gate sends are rejected, not merged into one receipt',async()=>{
  const f=rig();f.begin();assert.throws(()=>f.ledger.begin('a02',{deadlineAt:10000}),/concurrent|active/);
  const g=rig();g.begin();g.gate.arm('tabwise:a01');await g.gate.admit(info('Tab'));
  await assert.rejects(g.gate.admit(info('Tab')),/in flight/);
  assert.equal((await g.ledger.finish('a01')).complete,false);assert.equal(g.ledger.read().receipts.length,1);
});

test('a second send for the same action is rejected even after the first release',async()=>{
  const f=rig();f.begin();f.gate.arm('tabwise:a01');await f.send();
  await assert.rejects(f.gate.admit(info('Tab')),/duplicate|one token/);
  assert.equal(f.gate.status().sends,1);assert.equal((await f.ledger.finish('a01')).complete,false);
});

test('actual gate refuses forged, foreign and duplicate release tokens without creating ledger evidence',async()=>{
  for(const kind of ['copy','foreign','duplicate']){
    const f=rig();f.begin();f.gate.arm('tabwise:a01');const token=await f.gate.admit(info('Tab'));
    assert.equal(f.gate.commit(token),true);let invalid={...token};
    if(kind==='foreign'){const g=rig();g.begin();g.gate.arm('tabwise:a01');invalid=await g.gate.admit(info('Tab'));}
    if(kind==='duplicate'){await f.gate.release(token,{ended:true});invalid=token;}
    await assert.rejects(f.gate.release(invalid,{ended:true}),/unknown|finished/);
    assert.equal(f.ledger.read().receipts.length,1);
    assert.equal((await f.ledger.finish('a01')).complete,false);
  }
});

test('a release-reader entry after collection timeout is retained as late and never promoted',async()=>{
  const f=rig();f.begin();f.gate.arm('tabwise:a01');const token=await f.gate.admit(info('Tab'));
  assert.equal(f.gate.commit(token),true);f.advance(10001);f.ledger.expire('a01');
  await f.gate.release(token,{ended:true});const r=await f.ledger.finish('a01');
  assert.equal(r.released_at,10001);assert.equal(r.late,true);assert.equal(r.complete,false);
  assert.equal(r.r1_ack.result,null);assert.equal(f.calls.filter(c=>c[0]==='ack').length,0);
});

test('ack reader completion after expiry cannot revive the receipt or mutate a returned snapshot',async()=>{
  const entered=deferred(),reply=deferred();const f=rig({ack:async()=>{entered.resolve();return reply.promise;}});
  f.begin();f.gate.arm('tabwise:a01');const token=await f.gate.admit(info('Tab'));f.gate.commit(token);
  const pending=f.gate.release(token,{ended:true});await entered.promise;
  f.advance(10001);f.ledger.expire('a01');const snapshot=f.ledger.read();const saved=JSON.stringify(snapshot);
  reply.resolve({ack:true,reasons:[]});await pending;
  const r=await f.ledger.finish('a01');assert.equal(r.complete,false);assert.equal(r.late,true);
  assert.equal(r.r1_ack.result,null);assert.deepEqual(r.late_ack_result,{ack:true,reasons:[]});
  assert.equal(JSON.stringify(snapshot),saved);
});

for(const time of [-1,NaN,Infinity])test(`invalid receipt clock ${time} fails closed`,async()=>{
  const f=rig();f.begin();f.gate.arm('tabwise:a01');f.setTime(time);
  await assert.rejects(f.gate.admit(info('Tab')),/clock|timestamp/);
  assert.equal((await f.ledger.finish('a01')).complete,false);assert.equal(f.gate.status().sends,0);
});

test('a regressing release-entry clock cannot create a bounded commit interval',async()=>{
  const f=rig();f.advance(10);f.begin();f.gate.arm('tabwise:a01');const token=await f.gate.admit(info('Tab'));
  f.gate.commit(token);f.setTime(9);await f.gate.release(token,{ended:true});
  const r=await f.ledger.finish('a01');assert.equal(r.complete,false);assert.equal(r.commit,null);
});

test('mutated token keys and changed registered-gate identity invalidate collection',async()=>{
  const mutated=rig();mutated.begin();mutated.gate.arm('tabwise:a01');
  const token=await mutated.gate.admit(info('Tab'));mutated.gate.commit(token);
  token.info.keys[0].vk=VK.Enter;await mutated.gate.release(token,{ended:true});
  assert.equal((await mutated.ledger.finish('a01')).complete,false);
  const f=rig();let owner=f.gate;
  const gate=sendGate({settleMs:0,now:()=>0});owner=gate;gate.setIntegrity(()=>[]);gate.setCheck(async()=>[]);
  const ledger=createSendReceiptLedger({...f.options,gate,getGate:()=>owner});ledger.begin('a01',{deadlineAt:10000});
  gate.arm('tabwise:a01');owner=null;await assert.rejects(gate.admit(info('Tab')),/identity/);
  assert.equal((await ledger.finish('a01')).complete,false);
});

test('inconsistent send counters and out-of-order action completion are refused',async()=>{
  const f=rig();f.begin();await assert.rejects(f.ledger.finish('a02'),/order|identity/);
  const g=rig();g.begin();g.gate.arm('tabwise:a01');const token=await g.gate.admit(info('Tab'));
  assert.equal(g.gate.commit(token),true);
  // An otherwise gate-shaped boundary lies about the counter: it is never authentic infrastructure.
  let sends=0;const fake=Object.freeze({setAck(){},onIntent(){},isStopped:()=>false,stop(){},idle:async()=>({quiet:true}),
    status:()=>({stopped:false,misdelivered:false,sends,live:0,refused:0,acks:{confirmed:0,missing:0,unconfirmable:0}})});
  const ledger=createSendReceiptLedger({...g.options,gate:fake,getGate:()=>fake});ledger.begin('a01',{deadlineAt:10000});
  sends=2;assert.equal((await ledger.finish('a01')).complete,false);
  assert.match(ledger.read().errors.join(';'),/counter/);
});

test('wrapping refuses a mutable original reader so its before capability cannot change invisibly to gate.commit',()=>{
  const gate=sendGate();
  const reader=Object.assign(async()=>({ack:true,reasons:[]}),{before:async()=>[]});
  assert.throws(()=>createSendReceiptLedger({gate,getGate:()=>gate,ackReader:reader,onIntent:()=>{},actions,now:()=>0}),/frozen|immutable/);
});

test('the actual gate ack timeout cannot be erased by a later successful reader result',async()=>{
  const entered=deferred(),reply=deferred();
  const f=rig({ack:async()=>{entered.resolve();return reply.promise;}});
  f.begin();f.gate.arm('tabwise:a01');const token=await f.gate.admit(info('Tab'));assert.equal(f.gate.commit(token),true);
  const pending=f.gate.release(token,{ended:true});await entered.promise;
  await pending; // Actual unmodified gate: default 1000ms acknowledgement + its fixed margin.
  assert.equal(f.gate.status().acks.missing,1);
  const finished=await f.ledger.finish('a01'),saved=JSON.stringify(finished);
  reply.resolve({ack:true,reasons:[]});await new Promise(resolve=>setImmediate(resolve));
  const r=f.ledger.read().receipts[0];
  assert.equal(r.complete,false);assert.equal(r.r1_ack.result,null);assert.equal(r.late,true);
  assert.deepEqual(r.late_ack_result,{ack:true,reasons:[]});
  assert.equal(JSON.stringify(finished),saved);
});

test('sequential actions keep distinct authentic tokens and advance the send counter exactly once each',async()=>{
  const f=rig();
  f.begin();f.gate.arm('tabwise:a01');const first=await f.send('Tab');const a=await f.ledger.finish('a01');
  f.gate.disarm();f.advance(5);f.begin('a02');f.gate.arm('tabwise:a02');const second=await f.send('Enter');const b=await f.ledger.finish('a02');
  assert.notEqual(first,second);assert.equal(a.token.id,1);assert.equal(b.token.id,2);
  assert.equal(a.gate_started.sends,0);assert.equal(a.gate_at_release.sends,1);
  assert.equal(b.gate_started.sends,1);assert.equal(b.gate_at_release.sends,2);
  assert.equal(f.ledger.read().complete,true);
});

test('a successful answer beyond the collection deadline is late even without an explicit expire call',async()=>{
  let f;f=rig({ack:async()=>{f.advance(10001);return {ack:true,reasons:[]};}});
  f.begin();f.gate.arm('tabwise:a01');await f.send();const r=await f.ledger.finish('a01');
  assert.equal(r.released_at,0);assert.equal(r.complete,false);assert.equal(r.late,true);
  assert.equal(r.r1_ack.result,null);assert.deepEqual(r.late_ack_result,{ack:true,reasons:[]});
});

test('R1 ack failure or exception retains partial receipt facts and stops subsequent actions',async()=>{
  for(const ack of [async()=>{throw Error('reader failed');},async()=>({ack:null,reasons:[]}),async()=>({ack:true,reasons:['unexplained key']})]){
    const f=rig({ack});f.begin();f.gate.arm('tabwise:a01');await f.send();
    const r=await f.ledger.finish('a01');assert.equal(r.complete,false);assert.equal(r.released_at,0);
    assert.equal(r.gate_finished.acks.missing,1);
    assert.throws(()=>f.ledger.begin('a02',{deadlineAt:10000}));
  }
});

test('before-call refusal preserves the existing reader verdict and produces zero committed sends',async()=>{
  const f=rig({before:async()=>['stray key already present']});f.begin();f.gate.arm('tabwise:a01');
  await assert.rejects(f.send(),/stray key/);const r=await f.ledger.finish('a01');
  assert.deepEqual(r.before_result,['stray key already present']);assert.equal(r.gate_finished.sends,0);
  assert.equal(r.released_at,null);assert.equal(r.commit,null);assert.equal(r.complete,false);
});

test('duplicate installation cannot replace owned callbacks or silently drop the existing intent hook',()=>{
  const f=rig();assert.throws(()=>createSendReceiptLedger(f.options),/already/);
});

for(const postErrors of [[],['synthetic post-check mismatch']]) {
  test(`finish waits for actual frozen gate post-check settlement (${postErrors.length?'failure':'success'})`,async()=>{
    const entered=deferred(),reply=deferred();
    const f=rig({check:async context=>{
      if(context.phase==='post'){entered.resolve();return reply.promise;}
      return [];
    }});
    f.begin();f.gate.arm('tabwise:a01');const sending=f.send();
    let finishing;
    try {
      await entered.promise;
      assert.equal(f.gate.status().acks.confirmed,1);
      assert.equal(f.gate.status().live,0);
      assert.deepEqual(await f.gate.idle(1),{quiet:false},'ack and live counters do not establish settlement');
      finishing=Promise.resolve(f.ledger.finish('a01'));
      const pendingSnapshot=f.ledger.read(),pendingBytes=JSON.stringify(pendingSnapshot);
      assert.equal(f.ledger.read().receipts[0].complete,false,'pending post-check must not finalize receipt');
      reply.resolve(postErrors);await sending;
      const result=await finishing;
      assert.equal(JSON.stringify(pendingSnapshot),pendingBytes);
      assert.equal(result.complete,postErrors.length===0);
      assert.equal(result.release_settlement.quiet,true);
      assert.equal(result.quiescence,'UNVERIFIED');
      const saved=JSON.stringify(result);
      await new Promise(resolve=>setImmediate(resolve));
      assert.equal(JSON.stringify(result),saved);
      if(postErrors.length){
        await assert.rejects(async()=>f.ledger.finish('a01'),/identity|order|active/);
        assert.equal(f.ledger.read().receipts[0].complete,false);
      }
    } finally {reply.resolve(postErrors);await sending;if(finishing)await finishing;}
  });
}

for(const kind of ['resolved promise','rejected promise','custom thenable','custom thenable returning rejected child']) {
  test(`thenable intent is refused before admission/commit without unhandled rejection: ${kind}`,async()=>{
    let savedToken,returned,child,thenCalls=0;
    const unhandled=[];const listener=reason=>unhandled.push(reason);
    process.on('unhandledRejection',listener);
    const f=rig({intent:token=>{
      savedToken=token;
      returned=kind==='resolved promise'?Promise.resolve():kind==='rejected promise'?Promise.reject(Error('synthetic async intent failure')):
        {then(resolve,reject){
          thenCalls++;assert.equal(f.gate.isStopped(),true);assert.equal(this,returned);
          if(kind==='custom thenable returning rejected child'){
            child=Promise.reject(Error('synthetic rejected child'));resolve();return child;
          }
          reject(Error('synthetic thenable failure'));
        }};
      return returned;
    }});
    try {
      f.begin();f.gate.arm('tabwise:a01');
      await assert.rejects(f.gate.admit(info('Tab')),/thenable|synchronous/i);
      assert.equal(f.journal.length,1);assert.equal(f.journal[0],savedToken);
      assert.equal(f.gate.isStopped(),true);
      assert.equal(f.gate.commit(savedToken),false);
      assert.equal(f.gate.status().sends,0);
      assert.deepEqual(f.calls,[],'no before-reader or fake transport after async intent');
      assert.equal((await f.ledger.finish('a01')).complete,false);
      await new Promise(resolve=>setImmediate(resolve));
      assert.deepEqual(unhandled,[]);
      if(kind.startsWith('custom thenable'))assert.equal(thenCalls,1);
    } finally {
      // Keep the deliberately failing pre-fix run free from leaked rejections.
      if(returned instanceof Promise)await returned.catch(()=>{});
      if(child)await child.catch(()=>{});
      process.off('unhandledRejection',listener);
    }
  });
}

test('synchronous intent exception retains exact error identity and original token invocation',async()=>{
  const original=Error('synchronous intent failure');let received;
  const f=rig({intent:function(token){received=token;assert.equal(this,undefined);throw original;}});
  f.begin();f.gate.arm('tabwise:a01');
  await assert.rejects(f.gate.admit(info('Tab')),error=>error===original);
  assert.equal(received,f.journal[0]);assert.equal(f.journal.length,1);
  assert.equal(f.gate.commit(received),false);assert.equal(f.gate.status().sends,0);
  assert.equal((await f.ledger.finish('a01')).complete,false);
});

test('bounded finish times out while post-check is unresolved and cannot be revived afterward',async()=>{
  const entered=deferred(),reply=deferred();
  const f=rig({check:async context=>{if(context.phase==='post'){entered.resolve();return reply.promise;}return [];}});
  f.begin();f.gate.arm('tabwise:a01');const sending=f.send();
  try {
    await entered.promise;
    const result=await f.ledger.finish('a01',{settleTimeoutMs:20});
    assert.equal(result.complete,false);assert.equal(result.release_settlement.quiet,false);
    assert.match(result.errors.join(';'),/settlement/);
    assert.equal(f.gate.isStopped(),true);
    const saved=JSON.stringify(result);
    reply.resolve([]);await sending;
    assert.equal(f.ledger.read().receipts[0].complete,false);
    assert.equal(JSON.stringify(result),saved);
  } finally {reply.resolve([]);await sending;}
});

test('cancellation while finish waits for idle remains incomplete after successful post-check',async()=>{
  const entered=deferred(),reply=deferred();
  const f=rig({check:async context=>{if(context.phase==='post'){entered.resolve();return reply.promise;}return [];}});
  f.begin();f.gate.arm('tabwise:a01');const sending=f.send();let finishing;
  try {
    await entered.promise;finishing=f.ledger.finish('a01');f.ledger.expire('a01');
    reply.resolve([]);await sending;
    const r=await finishing;assert.equal(r.complete,false);assert.equal(r.expired,true);
    assert.equal(r.quiescence,'UNVERIFIED');assert.equal(r.physical_delivery_verified,false);
  } finally {reply.resolve([]);await sending;if(finishing)await finishing;}
});

test('concurrent finish calls are refused while the original idle wait remains pending',async()=>{
  const entered=deferred(),reply=deferred();
  const f=rig({check:async context=>{if(context.phase==='post'){entered.resolve();return reply.promise;}return [];}});
  f.begin();f.gate.arm('tabwise:a01');const sending=f.send();let finishing;
  try {
    await entered.promise;finishing=f.ledger.finish('a01');
    await assert.rejects(f.ledger.finish('a01'),/concurrent|duplicate/);
    reply.resolve([]);await sending;
    assert.equal((await finishing).complete,false);
  } finally {reply.resolve([]);await sending;if(finishing)await finishing;}
});

test('invalid settlement bounds refuse without an unbounded idle wait',async()=>{
  for(const settleTimeoutMs of [0,-1,5001,NaN]){
    const f=rig();f.begin();
    await assert.rejects(f.ledger.finish('a01',{settleTimeoutMs}),/settlement wait bound/);
    assert.equal(f.gate.isStopped(),true);assert.equal(f.ledger.read().receipts[0].complete,false);
  }
});
