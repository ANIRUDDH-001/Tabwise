import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixtures} from '../packages/contracts/fixtures.mjs';
import {sha256,validateDiagnosis} from '../packages/contracts/index.mjs';
import {diagnosisInput} from '../src/meta/input.mjs';
function sample(){const evidence=structuredClone(fixtures['evidence-bundle'].valid),source='<form></form>';evidence.provenance='observed-nvda';evidence.evidence_status='complete';return {evidence,source,run:{id:evidence.run_id,journey_id:evidence.journey_id,status:'completed',evidence_status:'complete',spec:{app_hash:sha256(source),steps:fixtures.journey.valid.steps}}};}
test('legitimate observed records project without invented events or signals',()=>{const a=sample(),v=diagnosisInput(a);assert.deepEqual(v.timeline,a.evidence.lanes.keys);assert.deepEqual(v.signals,[]);assert.equal(v.source[0].sha256,sha256(a.source));});
test('synthetic, incomplete, wrong identity and stale source fail closed',()=>{for(const mutate of [a=>a.evidence.provenance='synthetic-test',a=>a.evidence.evidence_status='incomplete',a=>a.run.status='failed',a=>a.run.journey_id='fernway-seat',a=>a.source+='x']){const a=sample();mutate(a);assert.throws(()=>diagnosisInput(a));}});
test('findings cannot cite an unrelated observation step',()=>{const input=structuredClone(fixtures['diagnosis-input'].valid),output=structuredClone(fixtures['diagnosis-output'].valid);input.timeline[0].step=2;assert.equal(validateDiagnosis(input,output).ok,false);});

import {diagnose} from '../src/meta/diagnosis.mjs';
test('unbacked input references refuse before budget reservation or transport',async()=>{const input=structuredClone(fixtures['diagnosis-input'].valid);input.evidence_refs.push('fabricated');let calls=0;await assert.rejects(()=>diagnose({input,broker:{reserve:()=>calls++},fetchImpl:()=>calls++}),/origins/);assert.equal(calls,0);});
