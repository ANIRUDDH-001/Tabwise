import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGuardedPressExecutor} from '../scripts/tabwise/executor.mjs';
test('L3 entering press without an initiated send remains pre; committed sends are send',async()=>{
 for(const initiated of [false,true]){
  let sends=0,stopped=false,kind;
  const guard={status:()=>({sends}),isStopped:()=>stopped,stop:(_,value)=>{stopped=true;kind=value;},arm:()=>true,disarm:()=>{},idle:async()=>({quiet:true})};
  const executor=createGuardedPressExecutor({steps:[{step:1,key:'Tab',text:null}],guard,checkForeground:async()=>[],persistActionIntent:async()=>{},nvda:{press:async()=>{if(initiated)sends++;throw Error('press failed');}}});
  await assert.rejects(()=>executor.execute({step:'1',press:'Tab'}));assert.equal(kind,initiated?'send':'pre');
 }
});
