import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGuardedPressExecutor} from '../scripts/tabwise/executor.mjs';
test('N4 distinguishes intent/foreground refusals from failures after underlying press starts',async()=>{
 for(const phase of ['intent','foreground','send']){
  let stopped=false,sends=0;const stops=[];
  const guard={status:()=>({sends}),isStopped:()=>stopped,stop:(reason,kind)=>{stopped=true;stops.push({reason,kind});},arm:()=>({}),disarm:()=>{},idle:async()=>({quiet:true})};
  const executor=createGuardedPressExecutor({steps:[{step:1,key:'Tab',text:null}],guard,nvda:{press:async()=>{sends++;throw Error('send failed');}},persistActionIntent:async()=>{if(phase==='intent')throw Error('intent failed');},checkForeground:async()=>phase==='foreground'?['wrong PID']:[]});
  await assert.rejects(()=>executor.execute({step:'1',press:'Tab'}));assert.equal(stops[0].kind,phase==='send'?'send':'pre',phase);assert.equal(sends,phase==='send'?1:0);
 }
});
