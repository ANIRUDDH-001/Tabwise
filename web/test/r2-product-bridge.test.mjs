import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sha256} from '../../packages/contracts/index.mjs';
import {validateR2ProductArtifact} from '../../packages/contracts/r2-product.mjs';
import {inspectR2ProductExport,openQualifiedR2ProductEvidence,readQualifiedR2ProductEvidence} from '../../src/r2/product-bridge.mjs';
import {prepareR2BridgeIngest} from '../lib/server/r2-evidence-bridge.mjs';
import {observationFixture} from './helpers/r2-bridge-fixture.mjs';
// Positive shape fixtures contain simulated observations, not a qualified runtime or valid production handle.
test('R2 positive projection preserves identity, clocks, sequences, citations and source bytes; fixture stays synthetic',()=>{
 const f=observationFixture(),view=inspectR2ProductExport(f);assert.equal(view.ok,true);assert.equal(view.source_verified,false);assert.equal(view.preview.evidence.provenance,'synthetic-test');assert.equal(view.preview.evidence.evidence_status,'incomplete');
 const mapped=Object.values(view.preview.evidence.lanes).flat();for(const event of f.events)assert.deepEqual(mapped.find(x=>x.evidence_ref===event.evidence_ref),event);
 assert.equal(view.preview.manifest.runner.workflow,'.github/workflows/tabwise-r2.yml');assert.equal(view.preview.manifest.runner.github_run_id,'123');assert.equal(view.preview.manifest.spec_sha256,f.expected.spec_sha256);
 for(const [p,b] of Object.entries(f.files))assert.deepEqual(view.preview.files[p],b);
 assert.equal(validateR2ProductArtifact(view.preview.manifest,view.preview.files).ok,true);
});
test('R2 positive artifact contract validates shape independently of runtime permission',()=>{
 const v=inspectR2ProductExport(observationFixture());assert.equal(v.ok,true);
 const p=structuredClone(v.preview),e=JSON.parse(Buffer.from(p.files['evidence.json']).toString('utf8'));e.provenance='observed-nvda';e.evidence_status='complete';p.files['evidence.json']=Buffer.from(JSON.stringify(e));p.manifest.evidence_status='complete';p.files['native-attestation.json']=Buffer.from('{"fixture_only":true}');p.manifest.native_attestation_sha256=sha256(p.files['native-attestation.json']);p.manifest.files.push({path:'native-attestation.json',sha256:p.manifest.native_attestation_sha256,bytes:p.files['native-attestation.json'].length,kind:'journal'});p.manifest.files.sort((a,b)=>a.path.localeCompare(b.path));p.manifest.evidence_sha256=sha256(p.files['evidence.json']);
 Object.assign(p.manifest.files.find(x=>x.path==='evidence.json'),{sha256:sha256(p.files['evidence.json']),bytes:p.files['evidence.json'].length});
 assert.equal(validateR2ProductArtifact(p.manifest,p.files).ok,true);
 assert.throws(()=>readQualifiedR2ProductEvidence(p)); // A shape-valid fixture never becomes a genuine runtime handle.
});
test('R2 identity/spec/plan/page/session/step/reference/file mismatches all refuse',()=>{
 for(const change of [
  f=>f.expected.github_run_id='124',f=>f.expected.github_run_attempt=2,f=>f.expected.product_run_id='00000000-0000-4000-8000-000000000002',
  f=>f.expected.plan_sha256='f'.repeat(64),f=>f.expected.page_id='p2',f=>f.expected.session='other',f=>f.expected.spec_sha256='f'.repeat(64),
  f=>f.exp.step_map[0].step=2,f=>f.exp.step_map[0].task='wrong',f=>f.exp.observations.push(f.exp.observations[0]),
  f=>delete f.files['p1/capture.json'],f=>f.files['observations.jsonl']=Buffer.from('tampered'),f=>f.files['unlisted.json']=Buffer.from('{}')
 ]){const f=observationFixture();change(f);f.repack();assert.equal(inspectR2ProductExport(f).ok,false);}
});
test('R2 synthetic/incomplete raw manifests are never promoted, even with observed labels',()=>{
 for(const field of ['run_class','class']){const f=observationFixture(),path=field==='run_class'?'run-manifest.json':'p1/manifest.json',m=JSON.parse(f.files[path]);m[field]='synthetic';f.files[path]=Buffer.from(JSON.stringify(m));f.repack();assert.equal(inspectR2ProductExport(f).ok,false);}
});
test('R2 production opening requires independently qualified source policy; missing or forged handles refuse ingestion',()=>{
 const f=observationFixture();assert.throws(()=>openQualifiedR2ProductEvidence({...f,attestation:{verdict:'PASS',authorized:true}}),/disabled|qualification/);
 for(const handle of [null,{},inspectR2ProductExport(f),inspectR2ProductExport(f).preview]){const result=prepareR2BridgeIngest({handle,user:{id:'owner'},run:{id:f.expected.product_run_id,user_id:'owner',spec:f.expected.spec},workerReview:'PASS'});assert.equal(result.ok,false);assert.equal(result.classification,'INCONCLUSIVE');}
});

test('R2 resealed source records cannot lose telemetry, duplicate refs, reverse clocks or cite absent assets',()=>{
 for(const change of [
  rows=>rows[2].event.evidence_ref=rows[0].event.evidence_ref,
  rows=>rows[2].event.t=1,
  rows=>rows[0].event.artifact_path='constructor',
  rows=>delete rows[1].event.clock
 ]){
  const f=observationFixture(),rows=f.files['observations.jsonl'].toString().trim().split('\n').map(JSON.parse);change(rows);const b=Buffer.from(rows.map(x=>JSON.stringify(x)).join('\n')+'\n');f.files['observations.jsonl']=b;Object.assign(f.exp.source_files.find(x=>x.path==='observations.jsonl'),{bytes:b.length,sha256:sha256(b)});f.repack();assert.equal(inspectR2ProductExport(f).ok,false);
 }
 const f=observationFixture();f.exp.observations=f.exp.observations.filter(x=>x.line!==3);f.repack();assert.equal(inspectR2ProductExport(f).ok,false);
});

test('R2 cannot silently omit a nonrequired app event from an observation source',()=>{
 const f=observationFixture(),row={schema:'tabwise-r2-product-observation/1',lane:'app_events',page_id:'p1',session:'session-1',task:'focus-go',action:'a1',event:{evidence_ref:'r2:app:3',step:1,seq:3,clock:'page-monotonic-ms',t:13,kind:'app',text:'Ready',target:null,duration_ms:null,artifact_path:null}};
 f.files['observations.jsonl']=Buffer.concat([f.files['observations.jsonl'],Buffer.from(JSON.stringify(row)+'\n')]);Object.assign(f.exp.source_files.find(x=>x.path==='observations.jsonl'),{bytes:f.files['observations.jsonl'].length,sha256:sha256(f.files['observations.jsonl'])});f.repack();assert.equal(inspectR2ProductExport(f).ok,false);
});
