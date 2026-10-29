import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verificationVerdict} from '../scripts/tabwise/verdict.mjs';
const base={run_id:'base',qualified:true,complete:true,steps:[{step:1,speech:['Name, edit']},{step:2,speech:[],app_events:['validation-error']}]};
test('actual symptom disappearance and preserved speech produce FIXED; prediction ignored',()=>{
 const next={...structuredClone(base),run_id:'next'};next.steps[1].speech=['Enter a valid email address to continue.'];
 const verdict=verificationVerdict(base,next,{kind:'validation',step:2});assert.equal(verdict.verdict,'FIXED');
 next.steps[1].speech=[];assert.equal(verificationVerdict(base,next,{kind:'validation',step:2,expected_speech_after:['invented']}).verdict,'NOT_FIXED');
});
test('missing capture integrity means INCONCLUSIVE, missing unaffected speech means REGRESSED',()=>{
 const next={...structuredClone(base),run_id:'next'};next.complete=false;
 assert.equal(verificationVerdict(base,next,{kind:'validation',step:2}).verdict,'INCONCLUSIVE');
 next.complete=true;next.steps[0].speech=[];
 assert.equal(verificationVerdict(base,next,{kind:'validation',step:2}).verdict,'REGRESSED');
 next.qualified=false;assert.equal(verificationVerdict(base,next,{kind:'validation',step:2}).verdict,'INCONCLUSIVE');
});
