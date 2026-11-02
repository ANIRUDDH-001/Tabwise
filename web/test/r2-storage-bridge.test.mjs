import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sha256} from '../../packages/contracts/index.mjs';
import {inspectR2ProductExport} from '../../src/r2/product-bridge.mjs';
import {readRunEvidence,screenshotBytes,screenshotMediaType} from '../lib/server/stored-evidence.mjs';
import {ingestR2BridgeArchive} from '../lib/server/artifact-ingest.mjs';
import {observationFixture,storedZip} from './helpers/r2-bridge-fixture.mjs';
test('stored shape-valid R2 evidence still requires independent native qualification on read',async()=>{
 const f=observationFixture(),p=inspectR2ProductExport(f).preview,e=p.evidence;e.provenance='observed-nvda';e.evidence_status='complete';p.files['evidence.json']=Buffer.from(JSON.stringify(e));p.files['native-attestation.json']=Buffer.from('{"fixture_only":true}');
 p.manifest.evidence_status='complete';p.manifest.native_attestation_sha256=sha256(p.files['native-attestation.json']);p.manifest.evidence_sha256=sha256(p.files['evidence.json']);p.manifest.files=Object.keys(p.files).sort().map(path=>({path,sha256:sha256(p.files[path]),bytes:p.files[path].length,kind:path==='evidence.json'?'evidence':'journal'}));
 const run={id:f.expected.product_run_id,journey_id:f.expected.journey_id,spec:f.expected.spec,spec_sha256:f.expected.spec_sha256,gh_run_id:'123',gh_head_sha:f.expected.revision,status:'completed',evidence_status:'complete'};
 await assert.rejects(readRunEvidence({run,metadata:p.manifest.files,download:async path=>path===run.id+'/manifest.json'?Buffer.from(JSON.stringify(p.manifest)):p.files[path.slice(run.id.length+1)]}),/qualification disabled/);
});
test('R2 PNG screenshot bytes preserve encoding; legacy product and arbitrary bytes remain refused',()=>{
 const png=Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000','hex');
 const value={runner:{workflow:'.github/workflows/tabwise-r2.yml'},artifacts:[{path:'p1/screen.png',kind:'screenshot'}],evidence:{lanes:{screenshots:[{artifact_path:'p1/screen.png'}]}},files:{'p1/screen.png':png}};
 assert.deepEqual(screenshotBytes(value,'p1/screen.png'),png);assert.equal(screenshotMediaType(png),'image/png');
 assert.throws(()=>screenshotBytes({...value,runner:{workflow:'.github/workflows/tabwise-run.yml'}},'p1/screen.png'));
 assert.throws(()=>screenshotMediaType(Buffer.from('<svg/>')));
});
test('R2 ZIP bridge reaches native verifier and cannot store fixture/forged attestation',async()=>{
 const f=observationFixture();let stores=0;
 await assert.rejects(ingestR2BridgeArchive({archive:storedZip({...f.files,'native-attestation.json':Buffer.from('{"fixture_only":true}')}),expected:f.expected,user:{id:'owner'},run:{id:f.expected.product_run_id},workerReview:'PASS',store:async()=>stores++}),/qualification disabled/);assert.equal(stores,0);
});
