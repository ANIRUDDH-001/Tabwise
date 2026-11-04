// Synthetic signature-contract fixture only. It is NOT a reconstructible native
// capture, and must never mint qualified evidence or a production native handle.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {observationFixture} from './helpers/r2-bridge-fixture.mjs';
import {sha256} from '../../packages/contracts/index.mjs';
import {stable} from '../../packages/contracts/r2-product.mjs';
import {prepareNativeProductRequest} from '../../src/r2/product-dispatch.mjs';
import {buildRuntimeMetadata} from '../../src/r2/runtime-metadata.mjs';
import {createCoordinator,canonical,publicText} from '../../scripts/tabwise/r2-admission.mjs';
import * as coordinatorTools from '../../src/r2/product-coordinator.mjs';
import {buildR2ProductExport} from '../../src/r2/product-export.mjs';
import {inspectR2ProductExport,openQualifiedR2ProductEvidence} from '../../src/r2/product-bridge.mjs';
const bytes=v=>Buffer.from(stable(v)+'\n');

async function fixture(){
 const f=observationFixture(),e=f.expected,files=f.files;delete files['r2-export.json'];
 const plan=JSON.parse(files['plan.json']);plan.pages[0].query='?flow=passenger&variant=healthy';files['plan.json']=bytes(plan);e.plan_sha256=sha256(files['plan.json']);
 const runtime=buildRuntimeMetadata({snapshot:{pid:123,created:'134000000000000001',path_sha256:'a'.repeat(64),product_version:'2026.2',executable_sha256:'b'.repeat(64)},expectedIdentity:{pid:123,created:'134000000000000001',path_sha256:'a'.repeat(64)},settings:{keyboard:{speakTypedCharacters:1,speakTypedWords:0},virtualBuffers:{enableOnPageLoad:false}},readback:{'keyboard.speakTypedCharacters':1,'keyboard.speakTypedWords':0,'virtualBuffers.enableOnPageLoad':false}});e.nvda_version=runtime.nvda_version;
 files['p1/events.jsonl']=bytes({phase:'native-runtime',runtime});
 delete files['observations.jsonl'];
 const node={available:true,connected:true,node_key:'go#1',tag:'button',id:'go',id_unique:true,is_body:false},after={identity_version:2,active:'go#1',active_identity:node,state:{dialogs:[],invalid:[],live:[]}};
 const capture=JSON.parse(files['p1/capture.json']);capture.source='nvda';capture.raw=[{seq:1,source:'nvda',text:'Go button',received:{clock:'node-monotonic-ms',t:17.75}}];capture.records[0]={...capture.records[0],raw_seq:[1],ack_seq:1,text:'Go button',page:{after,events:[{seq:1,t:12.25,type:'keydown',target:'go#1',active:'go#1',identity_version:2,source:'runner-page-recorder',active_identity:node},{seq:2,t:12.5,type:'focusin',target:'go#1',active:'go#1',identity_version:2,source:'runner-page-recorder',active_identity:node}]}};files['p1/capture.json']=bytes(capture);
 const page=JSON.parse(files['p1/manifest.json']);page.class='synthetic';page.files=['capture.json','events.jsonl'].map(path=>({path,bytes:files['p1/'+path].length,sha256:sha256(files['p1/'+path])}));files['p1/manifest.json']=bytes(page);e.page_manifest_sha256=sha256(files['p1/manifest.json']);files['p1/manifest.sha256']=Buffer.from(e.page_manifest_sha256+'  manifest.json\n');
 const raw=JSON.parse(files['run-manifest.json']);raw.run_class='synthetic';raw.plan_sha256=sha256(stable(plan));raw.pages[0].class='synthetic';raw.pages[0].manifest_sha256=e.page_manifest_sha256;files['run-manifest.json']=bytes(raw);e.run_manifest_sha256=sha256(files['run-manifest.json']);files['run-manifest.sha256']=Buffer.from(e.run_manifest_sha256+'  run-manifest.json\n');
 const request=prepareNativeProductRequest({userId:'owner',run:{id:e.product_run_id,user_id:'owner',status:'admitted',journey_version_id:'test-only-version',spec:e.spec},specBytes:files['product-spec.json'],planBytes:files['plan.json'],fixture:files['fixture.html'],pageId:'p1',planPath:'fixtures/r2/plans/test-origin.json',revision:e.revision,actor:e.actor,r2SourceSha256:e.r2_source_sha256,qualificationSha256:e.qualification_sha256});
 const key=generateKeyPairSync('ed25519'),binding={purpose:'r2-execution',repository:e.repository,workflow:e.workflow,revision:e.revision,actor:e.actor,owner_approval_ref:'D-999',review_ref:'synthetic-test-only',reviewed_files:['src/r2/product-producer.mjs'],reviewed_sha256:e.r2_source_sha256,qualification_sha256:e.qualification_sha256,plan_sha256:e.plan_sha256,fixtures:[{id:'p1',sha256:e.fixture_sha256}],permitted_attempt:1,expires_at:new Date(Date.now()+60000).toISOString()},authority={id:'test-only',binding,consumer:{run_id:'123',attempt:1},publicKey:publicText(key.publicKey)};
 let envelope;const signed=payload=>({payload,signature:sign(null,Buffer.from(canonical(payload)),key.privateKey).toString('base64')});
 const coordinator=await createCoordinator({...authority,transport:async q=>{envelope??=signed({schema:'tabwise-r2-consumption/1',authorization_id:authority.id,binding,consumer:authority.consumer,coordinator_key:q.coordinator_key,consumed_at:new Date().toISOString(),consumption_id:'00000000-0000-4000-8000-000000000001'});return {fresh:q.action==='consume',receipt:envelope};}});
 const challenge={page:'p1',nonce:'e'.repeat(64),pid:100,ppid:200},pageGrant=await coordinator.grant(challenge,{page:'p1',pid:100,ppid:200});
 const requestReceipt=signed({schema:'tabwise-native-plan-admission/1',request_sha256:request.request_sha256,product_run_id:request.product_run_id,github_run_id:'123',consumption_id:envelope.payload.consumption_id,plan_bytes_sha256:request.plan_bytes_sha256,fixture_sha256:request.fixture_sha256});
 const github={workflow:e.workflow,revision:e.revision,actor:e.actor,triggeringActor:e.actor,ref:'refs/heads/main',runId:'123',attempt:1};
 const intent={schema:'tabwise-native-product-session-intent/1',request,github,consumption_receipt:envelope,request_receipt:requestReceipt,page_grant:pageGrant};
 const result={schema:'tabwise-r2-session-result/1',fixture_id:'p1',completed:true,nvda:'stopped',manifest_sha256:e.page_manifest_sha256,runtime_checks:{brand:true,post_session_authentic:true},cleanup_errors:[],reasons:[],unexpected_loopback_requests:0,lifecycle:{clean:true}};
 const record={schema:'tabwise-native-product-session/1',producer_class:'genuine-unqualified',raw_manifest_class:'synthetic',request_sha256:request.request_sha256,product_run_id:request.product_run_id,github_run_id:'123',github_run_attempt:1,r2_source_sha256:e.r2_source_sha256,qualification_sha256:e.qualification_sha256,page_id:'p1',session:e.session,page_manifest_sha256:e.page_manifest_sha256,intent_sha256:sha256(bytes(intent)),session_result_sha256:sha256(bytes(result)),runtime,association:'observation-window-only',physical_quiescence_verified:false,native_qualified:false};
 const parent=mkdtempSync(join(tmpdir(),'tw-origin-contract-')),admissionDir=join(parent,'admission'),runDir=join(parent,'raw');mkdirSync(join(admissionDir,'product','p1'),{recursive:true});mkdirSync(runDir);writeFileSync(join(runDir,'run-manifest.json'),files['run-manifest.json']);
 const records={'product-session-intent.json':intent,'product-session-result.json':result,'product-session.json':record};for(const [name,value]of Object.entries(records))writeFileSync(join(admissionDir,'product','p1',name),bytes(value));
 const product={coordinator,authority,context:{delivery:{request,spec_text:files['product-spec.json'].toString(),plan_text:files['plan.json'].toString(),fixture_text:files['fixture.html'].toString()},github,receipt:envelope,requestReceipt}};
 return {f,files,expected:e,product,runDir,admissionDir,record,records,verification:{ok:true,errors:[],manifest_sha256:e.run_manifest_sha256,manifest:raw,run_class:'synthetic'},outcome:{stopped_after:null,pages:[{id:'p1',exit_code:0}]}};
}

test('test-signed product origin permits inspection while preserving raw classes and refusing qualification',async()=>{
 assert.equal(typeof coordinatorTools.sealNativeProductRun,'function','coordinator product-origin seal is missing');
 const a=await fixture();coordinatorTools.sealNativeProductRun(a);
 for(const name of ['product-run.json','product-admission.json'])a.files['product-producer/'+name]=readFileSync(join(a.admissionDir,'product',name));
 for(const name of Object.keys(a.records))a.files['product-producer/p1/'+name]=readFileSync(join(a.admissionDir,'product','p1',name));
 const build=()=>buildR2ProductExport({files:a.files,expected:a.expected,stage_timings:[],producerAuthority:a.product.authority});
 const built=build(),view=inspectR2ProductExport({...built,expected:a.expected,producerAuthority:a.product.authority});
 assert.equal(view.ok,true,view.errors.join('; '));assert.equal(view.source_verified,false);assert.equal(view.preview.evidence.evidence_status,'incomplete');assert.equal(view.preview.evidence.provenance,'synthetic-test');
 assert.equal(JSON.parse(built.files['run-manifest.json']).run_class,'synthetic');assert.throws(()=>openQualifiedR2ProductEvidence({...built,expected:a.expected,producerAuthority:a.product.authority}),/disabled/);
 for(const kind of ['signature','request','metadata','result','raw']){
  const other={...a.files};const path=kind==='signature'?'product-producer/product-admission.json':kind==='request'?'product-producer/p1/product-session-intent.json':kind==='metadata'?'p1/events.jsonl':kind==='result'?'product-producer/p1/product-session-result.json':'run-manifest.json';other[path]=Buffer.from('{}\n');
  assert.throws(()=>buildR2ProductExport({files:other,expected:a.expected,stage_timings:[],producerAuthority:a.product.authority}),kind);
 }
 // Recompute every public hash and provide a VALID test coordinator signature.
 // Semantic substitution must still fail; a checksum-only test would miss this.
 for(const kind of ['runtime-substitution','false-completion','quiescence-claim','request-owner']){
  const other={...a.files},sessionPath='product-producer/p1/product-session.json',intentPath='product-producer/p1/product-session-intent.json',resultPath='product-producer/p1/product-session-result.json';
  const record=JSON.parse(other[sessionPath]);
  if(kind==='runtime-substitution')record.runtime.executable_sha256='f'.repeat(64);
  if(kind==='quiescence-claim')record.physical_quiescence_verified=true;
  if(kind==='false-completion'){const value=JSON.parse(other[resultPath]);value.completed=false;other[resultPath]=bytes(value);record.session_result_sha256=sha256(other[resultPath]);}
  if(kind==='request-owner'){const value=JSON.parse(other[intentPath]);value.request.user_id='foreign-owner';other[intentPath]=bytes(value);record.intent_sha256=sha256(other[intentPath]);}
  other[sessionPath]=bytes(record);
  const manifest=JSON.parse(other['product-producer/product-run.json']);for(const f of manifest.files){const b=other['product-producer/'+f.path];f.sha256=sha256(b);f.bytes=b.length;}
  other['product-producer/product-run.json']=bytes(manifest);other['product-producer/product-admission.json']=bytes(a.product.coordinator.record(sha256(other['product-producer/product-run.json'])));
  assert.throws(()=>buildR2ProductExport({files:other,expected:a.expected,stage_timings:[],producerAuthority:a.product.authority}),kind);
 }
 assert.throws(()=>buildR2ProductExport({files:a.files,expected:a.expected,stage_timings:[],producerAuthority:{...a.product.authority,publicKey:publicText(generateKeyPairSync('ed25519').publicKey)}}),'unreviewed authority cannot replace W5');
});
