import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixtures} from '../../packages/contracts/fixtures.mjs';
import {sha256} from '../../packages/contracts/index.mjs';
import {readRunEvidence,screenshotBytes} from '../lib/server/stored-evidence.mjs';
function sample(diagnostic=false){
 const manifest=structuredClone(fixtures['artifact-manifest'].valid),evidence=structuredClone(fixtures['evidence-bundle'].valid);
 evidence.provenance='observed-nvda';evidence.evidence_status=manifest.evidence_status=diagnostic?'incomplete':'complete';
 const bytes=Buffer.from(JSON.stringify(evidence));manifest.files=[{path:'evidence.json',sha256:sha256(bytes),bytes:bytes.length,kind:'evidence'}];manifest.evidence_sha256=sha256(bytes);
 const prefix=diagnostic?'diagnostics/1/':'',run={id:manifest.run_id,journey_id:evidence.journey_id,status:diagnostic?'failed':'completed',evidence_status:evidence.evidence_status,spec_sha256:manifest.spec_sha256,gh_run_id:manifest.runner.github_run_id,gh_head_sha:manifest.runner.head_sha};
 const files={[`${run.id}/${prefix}manifest.json`]:Buffer.from(JSON.stringify(manifest)),[`${run.id}/${prefix}evidence.json`]:bytes};
 return {run,metadata:manifest.files.map(f=>({...f,path:prefix+f.path})),download:async path=>files[path],files};
}
test('stored complete evidence binds run identity and metadata hashes before exposing five lanes',async()=>{
 const result=await readRunEvidence(sample());assert.equal(result.complete,true);assert.equal(result.runner.profile,'A15');assert.deepEqual(Object.keys(result.evidence.lanes),['keys','focus','speech','app_events','screenshots']);
});
test('diagnostic bundles retain original lanes but are always inconclusive',async()=>{
 const result=await readRunEvidence(sample(true));assert.equal(result.complete,false);assert.equal(result.classification,'INCONCLUSIVE');assert.equal(result.prefix,'diagnostics/1/');
});
test('stored evidence refuses changed bytes, foreign identity and missing database hash anchors',async()=>{
 for(const change of [s=>s.run.gh_run_id='999',s=>s.metadata[0].sha256='0'.repeat(64),s=>s.files[`${s.run.id}/evidence.json`]=Buffer.from('{}')]){const s=sample();change(s);await assert.rejects(()=>readRunEvidence(s));}
});
test('absent evidence remains unavailable without downloading invented files',async()=>{
 assert.equal(await readRunEvidence({run:{id:'r'},metadata:[],download:()=>{throw Error('must not download');}}),null);
});
test('D2 rejects evidence labelled for a different journey even when all file hashes match',async()=>{
 const value=sample();value.run.journey_id='fernway-seat';await assert.rejects(()=>readRunEvidence(value),/journey|provenance/);
});
test('screenshot delivery requires an exact screenshot-lane reference and WebP encoding',()=>{
 const value={artifacts:[{path:'screen.webp',kind:'screenshot'}],evidence:{lanes:{screenshots:[{artifact_path:'screen.webp'}]}},files:{'screen.webp':Buffer.from('RIFF0000WEBPdata')}};
 assert.equal(screenshotBytes(value,'screen.webp').length,16);
 assert.throws(()=>screenshotBytes(value,'../screen.webp'));
 value.files['screen.webp']=Buffer.from('<svg onload="bad()"/>');assert.throws(()=>screenshotBytes(value,'screen.webp'),/encoding/);
});
