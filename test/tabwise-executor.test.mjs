import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as module from '../scripts/tabwise/executor.mjs';
import {captureJourney} from '../src/r2/capture.mjs';
const steps=[{step:1,key:'Tab',text:null,checkpoint:false}];
function fake(){
 const calls=[];let stopped=false;
 return {calls,options:{steps,nvda:{press:async(...args)=>calls.push(['press',...args])},guard:{isStopped:()=>stopped,arm:label=>{calls.push(['arm',label]);return {};},disarm:()=>calls.push(['disarm']),idle:async()=>({quiet:true}),stop:(...args)=>{stopped=true;calls.push(['stop',...args]);}},checkForeground:async()=>[],persistActionIntent:async intent=>calls.push(['intent',intent])}};
}
test('executor preflights whole journey, refuses all typing, and always uses literal capture:false',async()=>{
 const f=fake();for(const key of ['Escape','ArrowDown','Home','type'])assert.throws(()=>module.createGuardedPressExecutor({...f.options,steps:[...steps,{step:2,key,text:key==='type'?'AshaTest':null}]}));
 assert.equal(f.calls.length,0);
 const executor=module.createGuardedPressExecutor(f.options);await executor.execute({step:'1',press:'Tab'},{signal:new AbortController().signal});
 assert.deepEqual(f.calls.find(c=>c[0]==='press'),['press','Tab',{capture:false}]);
 assert.equal(f.calls[0][0],'intent');assert.equal(executor.snapshot().underlying_settled,true);assert.equal(executor.snapshot().physical_quiescence_verified,false);
 await assert.rejects(()=>executor.execute({step:'1',press:'Tab'},{}),/sequence/);
});
test('abort stops guard exactly once while an ignored send remains unsettled',async()=>{
 const f=fake();let release,started;const reached=new Promise(resolve=>started=resolve);
 f.options.nvda.press=()=>{started();return new Promise(resolve=>release=resolve);};
 const controller=new AbortController(),executor=module.createGuardedPressExecutor(f.options),pending=executor.execute({step:'1',press:'Tab'},{signal:controller.signal});
 await reached;controller.abort();controller.abort();
 assert.equal(f.calls.filter(c=>c[0]==='stop').length,1);assert.equal(executor.snapshot().cancellation_requested,true);assert.equal(executor.snapshot().underlying_settled,false);assert.equal(executor.snapshot().physical_quiescence_verified,false);
 release();await assert.rejects(()=>pending,/stopped|cancel/);assert.equal(executor.snapshot().underlying_settled,true);assert.equal(f.calls.filter(c=>c[0]==='stop').length,1);
});
test('foreground, intent failure, or abort during foreground check never sends',async()=>{
 for(const kind of ['foreground','intent','abort']){
  const f=fake(),controller=new AbortController();
  if(kind==='foreground')f.options.checkForeground=async()=>['wrong foreground'];
  if(kind==='intent')f.options.persistActionIntent=async()=>{throw Error('intent write failed');};
  if(kind==='abort')f.options.checkForeground=async()=>{controller.abort();return [];};
  const executor=module.createGuardedPressExecutor(f.options);await assert.rejects(()=>executor.execute({step:'1',press:'Tab'},{signal:controller.signal}));
  assert.equal(f.calls.some(c=>c[0]==='press'),false,kind);
 }
});
test('late executor settlement cannot replace the independent conservative R2 acknowledgement deadline',async()=>{
 let t=0;const events=[],f=fake();f.options.nvda.press=async()=>{t=1100;events.push({seq:1,t:20,type:'keydown',key:'Tab',shift:false});};
 const executor=module.createGuardedPressExecutor(f.options);
 const capture=await captureJourney({fixture_id:'synthetic',actions:[{step:'1',press:'Tab'}],execute:executor.execute,clock:{now:()=>t,wait:async ms=>{t+=ms;}},speech:{read:async()=>({source:'fake-nvda',session:'s',connected:true,complete:true,phrases:[]})},page:{read:async()=>({session:'p',complete:true,clock:'page-monotonic-ms',t,active:'email',state:{},events})},observationMs:2000,timeoutMs:2000});
 assert.equal(capture.completed,false);assert.equal(capture.records[0].ack_seq,null);assert.match(capture.reasons.join(';'),/1000/);assert.equal(capture.guarded_execution_verified,false);
});
