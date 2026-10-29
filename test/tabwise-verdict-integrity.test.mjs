import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verificationVerdict} from '../scripts/tabwise/verdict.mjs';
test('verification without the trigger event cannot say NOT_FIXED or FIXED',()=>{
 const baseline={run_id:'a',qualified:true,complete:true,steps:[{step:1,speech:[],app_events:['validation-error']}]};
 const next={run_id:'b',qualified:true,complete:true,steps:[{step:1,speech:['Enter a valid email address to continue.'],app_events:[]}]};
 assert.equal(verificationVerdict(baseline,next,{kind:'validation',step:1}).verdict,'INCONCLUSIVE');
});
test('already healthy baseline and duplicate step identities cannot establish a repair',()=>{
 const baseline={run_id:'a',qualified:true,complete:true,steps:[{step:1,speech:['Enter a valid email address to continue.'],app_events:['validation-error']}]};
 const next={...structuredClone(baseline),run_id:'b'};
 assert.equal(verificationVerdict(baseline,next,{kind:'validation',step:1}).verdict,'INCONCLUSIVE');
 const dup={run_id:'c',qualified:true,complete:true,steps:[{step:1,speech:[]},{step:1,speech:[]}]};
 assert.equal(verificationVerdict(dup,{...dup,run_id:'d'},{kind:'validation',step:1}).verdict,'INCONCLUSIVE');
});
