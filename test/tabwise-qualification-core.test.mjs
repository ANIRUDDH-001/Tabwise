import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {sendGate} from '../src/speech/sendguard.mjs';
import {runObserverQualification} from '../scripts/tabwise/qualification-core.mjs';
const nonce='0123abcd';
function fake(mode='healthy'){
 let t=0,client,performed=0;const calls=[],journals=[];const guard=sendGate({settleMs:0});guard.setIntegrity(()=>[]);
 class Client extends EventEmitter{constructor(){super();client=this;}async connect(options){calls.push(['observer.connect',options]);}disconnect(){calls.push(['observer.close']);}}
 const cfg=JSON.parse(readFileSync('fixtures/r1/steps.json','utf8'));
 const runtime={guard,getGate:()=>guard,NVDAClient:Client,cfg,assertAuthentic:()=>{},relayOwnerPid:async()=>mode==='relay-mismatch'?99:12,nvda:{start:async()=>{calls.push(['nvda.start']);return {pid:12,relay_pid:12,reset_confirmed:true};},getSettings:()=>cfg.nvda_settings,keyboardCommands:{reportTitle:'report-title'},perform:async(command,options)=>{
  performed++;calls.push(['perform',command,options]);
  for(const keys of (mode==='unexpected-key'?[[27]]:[[162],[45,84]])){
   const token=await guard.admit({path:'nvda',keys:keys.map(vk=>({vk,scan:0,ext:false}))});if(!guard.commit(token))throw Error('commit refused');await guard.release(token);
  }
  client.emit('speak',`R1 sign-up ${nonce}`);client.emit('speak','Google Chrome');if(mode==='lost')guard.stop('NVDA protocol: connection closed','send');
 },lastSpokenPhrase:async()=>`R1 sign-up ${nonce}. Google Chrome`,stop:async()=>calls.push(['nvda.stop'])}};
 const snapshot={complete:true,nonce,title:`R1 sign-up ${nonce}`,events:[],active:'body'};
 const page={pid:123,keys:async()=>[],read:async()=>structuredClone(snapshot),close:async()=>calls.push(['browser.close'])};
 const browser={open:async()=>page},foreground={check:async()=>({pid:mode==='wrong-foreground'?999:123,title:`R1 sign-up ${nonce}`,request_id:1,request_started_ms:t,received_ms:t}),close:()=>calls.push(['foreground.close'])};
 return {calls,journals,get performed(){return performed;},args:{runtime,browser,foreground,nonce,writer:{append:(kind,value)=>journals.push({kind,value})},clock:{now:()=>t,wait:async ms=>{t+=ms;}}}};
}
test('offline qualification performs one guarded captured title action and preserves all mandatory control intents',async()=>{
 const f=fake(),result=await runObserverQualification(f.args);
 assert.equal(result.candidate_pass,true,JSON.stringify(result));assert.equal(result.relay_equivalence_verified,false);assert.equal(result.full_worker_ready,false);assert.equal(result.provenance,'injected-offline-test');assert.equal(f.performed,1);
 assert.deepEqual(f.calls.find(call=>call[0]==='perform'),['perform','report-title',{capture:true}]);assert.deepEqual(result.assessment.match_seq,[1,2]);
 assert.equal(f.journals.filter(entry=>entry.kind==='intents').length,2);assert.equal(result.guard.acks.unconfirmable,2);assert.equal(result.physical_quiescence_verified,false);
 assert.ok(f.calls.findIndex(call=>call[0]==='observer.close')<f.calls.findIndex(call=>call[0]==='browser.close'));assert.equal(f.calls.at(-1)[0],'nvda.stop');
});
test('qualification refuses relay/foreground mismatch before the title action and retains incomplete evidence',async()=>{
 for(const mode of ['relay-mismatch','wrong-foreground']){const f=fake(mode),result=await runObserverQualification(f.args);assert.equal(result.candidate_pass,false);assert.equal(f.performed,0);assert.ok(result.reasons.length);assert.equal(f.calls.at(-1)[0],'nvda.stop');}
});
test('qualification rejects unexpected sends and silent registered transport loss without a retry',async()=>{
 for(const mode of ['unexpected-key','lost']){const f=fake(mode),result=await runObserverQualification(f.args);assert.equal(result.candidate_pass,false);assert.equal(f.performed,1);assert.equal(result.full_worker_ready,false);}
});
test('qualification preserves pending action evidence after timeout and never reports a safety result',async()=>{
 const f=fake();f.args.runtime.cfg={...f.args.runtime.cfg,action_timeout_ms:20};f.args.runtime.nvda.perform=()=>new Promise(()=>{});
 const result=await runObserverQualification(f.args);assert.equal(result.candidate_pass,false);assert.ok(result.pending_operations.includes('guarded title'));assert.equal(result.guard.kind,'timeout');assert.equal(result.physical_quiescence_verified,false);assert.equal(f.calls.at(-1)[0],'nvda.stop');
});
test('aborted qualification refuses before startup and still follows the one cleanup path',async()=>{
 const f=fake(),controller=new AbortController();controller.abort();const result=await runObserverQualification({...f.args,signal:controller.signal});
 assert.equal(result.candidate_pass,false);assert.equal(f.performed,0);assert.equal(f.calls.some(call=>call[0]==='nvda.start'),false);assert.equal(f.calls.at(-1)[0],'nvda.stop');
});
