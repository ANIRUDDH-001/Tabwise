import {test} from 'node:test';import assert from 'node:assert/strict';
import * as candidate from '../lib/server/candidate-run.mjs';
import {sectionFor} from '../lib/site-navigation.mjs';
test('candidate navigation stays in the private workspace',()=>{assert.equal(sectionFor('/candidate-runs/new'),'workspace');assert.equal(sectionFor('/candidate-runs/00000000-0000-4000-8000-000000000001'),'workspace');});
test('candidate workspace collection refuses foreign/class-swapped rows and strips raw data',()=>{
 assert.equal(typeof candidate.candidateWorkspaceViews,'function');
 const row={user_id:'owner',product_run_id:'candidate',journey_version_id:'version',state:'RUN_BOUND',classification:'NONPRODUCTION_UNQUALIFIED',production_qualified:false,created_at:'2026-11-04T00:00:00Z',request:{private:true},readback:{private:true}};
 const view=candidate.candidateWorkspaceViews([row],'owner');assert.equal(view[0].request,undefined);assert.equal(view[0].readback,undefined);
 assert.throws(()=>candidate.candidateWorkspaceViews([row],'foreign'));assert.throws(()=>candidate.candidateWorkspaceViews([{...row,production_qualified:true}],'owner'));
});
test('candidate API authenticates before loading configuration or product data',async()=>{
 assert.equal(typeof candidate.createCandidateRunHandler,'function');let touched=0;
 const h=candidate.createCandidateRunHandler({authenticate:async()=>null,configuration:()=>{touched++;},store:{create:()=>{touched++;}}});
 assert.equal((await h(new Request('https://tabwise.test/api/candidate-runs',{method:'POST'}))).status,401);assert.equal(touched,0);
});
test('candidate configuration outages remain distinguishable from saved-source conflicts',async()=>{
 const h=candidate.createCandidateRunHandler({authenticate:async()=>{throw Object.assign(Error('unavailable'),{status:503,reason:'server_configuration_pending'});}});
 const r=await h(new Request('https://tabwise.test/api/candidate-runs'));assert.equal(r.status,503);assert.equal((await r.json()).reason,'server_configuration_pending');
});
test('candidate API requires same-origin and an explicitly configured isolated owner',async()=>{
 assert.equal(typeof candidate.createCandidateRunHandler,'function');let touched=0;
 const h=candidate.createCandidateRunHandler({authenticate:async()=>({id:'foreign'}),configuration:()=>({enabled:true,userId:'owner',ref:'refs/heads/feat/tabwise-r2-r7-product-completion'}),store:{create:()=>{touched++;}}});
 assert.equal((await h(new Request('https://tabwise.test/api/candidate-runs',{method:'POST',headers:{origin:'https://elsewhere.test'}}))).status,403);
 assert.equal((await h(new Request('https://tabwise.test/api/candidate-runs',{method:'POST',headers:{origin:'https://tabwise.test'}}))).status,403);assert.equal(touched,0);
});
test('candidate view always exposes the qualification boundary',()=>{
 assert.equal(typeof candidate.candidateRunView,'function');
 const v=candidate.candidateRunView({product_run_id:'id',state:'RUN_BOUND',github_run_id:'123',request:{request_sha256:'a'.repeat(64)}});
 assert.equal(v.classification,'NONPRODUCTION_UNQUALIFIED');assert.equal(v.production_qualified,false);assert.equal(v.github_run_id,'123');assert.equal(v.native_observations_available,false);
});
