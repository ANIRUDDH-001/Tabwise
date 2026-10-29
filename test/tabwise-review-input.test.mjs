import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as worker from '../scripts/tabwise/worker.mjs';
import * as input from '../scripts/tabwise/input-policy.mjs';
import {encodeSpec} from '../packages/contracts/index.mjs';
import {fixtures} from '../packages/contracts/fixtures.mjs';
import {PALETTE,KEYS} from '../packages/contracts/palette.mjs';

test('P0 palette and press policy match owner decisions',()=>{
 assert.deepEqual(KEYS,['Tab','Shift+Tab','Enter','Space','type']);
 assert.equal(PALETTE.name,'AshaTest');assert.equal(PALETTE.invalid_email,'invalid.email');
 for(const text of Object.values(PALETTE))assert.match(text,/^[A-Za-z0-9@.]+$/);
});
test('whole journey refuses every unsupported late press before any provider call',async()=>{
 let calls=0;const providers={execute:()=>calls++,speech:{read:()=>calls++},page:{read:()=>calls++}};
 for(const key of ['Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End']){
  const spec=structuredClone(fixtures['run-spec'].valid);spec.steps.push({step:2,key,text:null,checkpoint:false});
  assert.throws(()=>input.preflightJourney(spec.steps),/unsupported/);
  // Untrusted JSON cannot bypass the dispatch decoder either.
  const raw=Buffer.from(JSON.stringify(spec));
  const {sha256}=await import('../packages/contracts/index.mjs');
  await assert.rejects(()=>worker.runOfflineWorker({run_id:spec.run_id,spec_b64:raw.toString('base64'),spec_sha256:sha256(raw)},providers));
 }
 assert.equal(calls,0);
});
test('whole typed value rejects mixed or unsafe characters before sending any prefix',()=>{
 let sends=0;
 for(const text of ['Asha Test','invalid-email','AshaTest\n','AshaTest;'])assert.throws(()=>{
  const actions=input.preflightJourney([{step:1,key:'type',text}]);for(const action of actions)sends++;
 },/typed|palette/);
 assert.equal(sends,0);
 for(const text of Object.values(PALETTE))assert.doesNotThrow(()=>input.preflightJourney([{step:1,key:'type',text}]));
});
test('offline worker refuses unbranded physical-capable providers before even reading speech',async()=>{
 for(const source of ['fake-nvda','nvda']){
  let calls=0;const providers={execute:()=>calls++,speech:{read:()=>{calls++;return {source};}},page:{read:()=>calls++}};
  await assert.rejects(()=>worker.runOfflineWorker(encodeSpec(fixtures['run-spec'].valid),providers),/offline transport/);
  assert.equal(calls,0);
 }
});
test('offline fake transport is immutable, self-contained, and cannot accept executable overrides',async()=>{
 assert.throws(()=>worker.createOfflineTransport({execute:()=>{throw Error('must never run');}}),/options/);
 const fake=worker.createOfflineTransport();assert.ok(Object.isFrozen(fake));
 const out=await worker.runOfflineWorker(encodeSpec(fixtures['run-spec'].valid),fake);
 assert.equal(out.capture.source,'fake-nvda');assert.equal(out.capture.guarded_execution_verified,false);
 assert.equal(out.manifest.evidence_status,'incomplete');
 await assert.rejects(()=>worker.runOfflineWorker(encodeSpec(fixtures['run-spec'].valid),{...fake}),/offline transport/);
});
