import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixtures} from '../../packages/contracts/fixtures.mjs';
import {sha256} from '../../packages/contracts/index.mjs';
import {prepareIngest} from '../lib/server/jobs.mjs';
function sample(){
 const manifest=structuredClone(fixtures['artifact-manifest'].valid),evidence=structuredClone(fixtures['evidence-bundle'].valid);
 evidence.provenance='observed-nvda';evidence.evidence_status='complete';
 const bytes=Buffer.from(JSON.stringify(evidence));manifest.files=[{path:'evidence.json',bytes:bytes.length,sha256:sha256(bytes),kind:'evidence'}];manifest.evidence_sha256=sha256(bytes);manifest.evidence_status='complete';manifest.runner.github_run_attempt=2;
 const run={id:1,run_attempt:2,path:manifest.runner.workflow,event:manifest.runner.event,head_branch:'main',head_sha:manifest.runner.head_sha,actor:{login:manifest.runner.actor},display_title:`tabwise ${manifest.run_id}`};
 const expected={sha:run.head_sha,actor:run.actor.login,run_id:manifest.run_id,spec_sha256:manifest.spec_sha256};
 return {manifest,files:{'evidence.json':bytes},run,expected,workerReview:'PASS'};
}
test('ingest binds the artifact attempt and complete runner metadata to authenticated GitHub metadata',()=>{
 const good=sample();assert.equal(prepareIngest(good).ok,true);
 for(const field of ['github_run_attempt','workflow','event','head_branch']){
  const bad=sample();bad.manifest.runner[field]=field==='github_run_attempt'?1:'forged';assert.equal(prepareIngest(bad).ok,false,field);
 }
 for(const value of [undefined,0,-1,NaN,'2']){const bad=sample();bad.run.run_attempt=value;assert.equal(prepareIngest(bad).ok,false,String(value));}
 const partial=sample();partial.manifest.evidence_status='incomplete';const result=prepareIngest(partial);assert.equal(result.ok,false);assert.equal(result.classification,'INCONCLUSIVE');assert.equal(result.evidence,null);
 const changed=sample();changed.files['evidence.json']=Buffer.from('{}');assert.equal(prepareIngest(changed).ok,false);
});
