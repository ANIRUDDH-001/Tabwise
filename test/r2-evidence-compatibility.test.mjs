import {test} from 'node:test';
import assert from 'node:assert/strict';
import {productCompatibility} from '../scripts/tabwise/r2-evidence-compatibility.mjs';
test('W5 R2 run/page evidence never qualifies as product artifact',()=>{
 for(const schema of ['tabwise-r2-run-evidence/1','tabwise-r2-page-evidence/1']){
  const result=productCompatibility({schema,run_class:'synthetic',class:'qualified',provenance:'observed-nvda',authorized:true});
  assert.equal(result.compatible,false);assert.equal(result.converted,null);
 }
});
test('W5 relabelled or malformed product evidence cannot bypass full ingestion identity',()=>{
 for(const value of [null,{},[],{version:'0.1.0',provenance:'observed-nvda',evidence_status:'complete'},{schema:'tabwise-r2-run-evidence/1',version:'0.1.0',runner:{workflow:'.github/workflows/tabwise-run.yml'}}]){
  const result=productCompatibility(value);assert.equal(result.compatible,false);assert.equal(result.converted,null);assert.ok(result.reasons.length);
 }
});

import {prepareIngest} from '../web/lib/server/jobs.mjs';
import {validateContract,sha256} from '../packages/contracts/index.mjs';
test('W5 actual product ingestion rejects experimental R2 workflow and synthetic evidence',()=>{
 const id='00000000-0000-4000-8000-000000000001',hash='a'.repeat(64);
 const evidence={version:'0.1.0',run_id:id,journey_id:'fernway-passenger',provenance:'synthetic-test',evidence_status:'incomplete',association:'observation-window-only',lanes:{keys:[],focus:[],speech:[],app_events:[],screenshots:[]},axe:[]};
 const bytes=Buffer.from(JSON.stringify(evidence));
 const manifest={version:'0.1.0',run_id:id,spec_sha256:hash,evidence_sha256:sha256(bytes),files:[{path:'evidence.json',sha256:sha256(bytes),bytes:bytes.length,kind:'evidence'}],stage_timings:[],runner:{workflow:'.github/workflows/tabwise-r2.yml',event:'workflow_dispatch',head_branch:'main',head_sha:'b'.repeat(40),actor:'owner',github_run_id:'123',github_run_attempt:1,profile:'A15',nvda_version:'synthetic'},evidence_status:'incomplete'};
 assert.equal(validateContract('artifact-manifest',manifest).ok,false);
 const result=prepareIngest({run:{id:123,path:'.github/workflows/tabwise-r2.yml',event:'workflow_dispatch',head_branch:'main',head_sha:'b'.repeat(40),display_title:`tabwise ${id}`,actor:{login:'owner'},run_attempt:1},manifest,files:{'evidence.json':bytes},expected:{actor:'owner',sha:'b'.repeat(40),run_id:id,spec_sha256:hash},workerReview:'PASS'});
 assert.equal(result.ok,false);assert.equal(result.classification,'INCONCLUSIVE');assert.equal(result.evidence,null);
});
