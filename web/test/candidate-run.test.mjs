import {test} from 'node:test';import assert from 'node:assert/strict';
import * as candidate from '../lib/server/candidate-run.mjs';
test('candidate API authenticates before loading configuration or product data',async()=>{
 assert.equal(typeof candidate.createCandidateRunHandler,'function');let touched=0;
 const h=candidate.createCandidateRunHandler({authenticate:async()=>null,configuration:()=>{touched++;},store:{create:()=>{touched++;}}});
 assert.equal((await h(new Request('https://tabwise.test/api/candidate-runs',{method:'POST'}))).status,401);assert.equal(touched,0);
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
