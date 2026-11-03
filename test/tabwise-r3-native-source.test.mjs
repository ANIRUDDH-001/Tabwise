import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preparePatchedSession} from '../scripts/tabwise/repair-session.mjs';
import {sha256} from '../packages/contracts/index.mjs';
import {validatePatchProposal} from '../src/repair/patch.mjs';
function sample(){
 const source='<title>Repair</title>\n<p>old</p>\n',diff='--- a/index.html\n+++ b/index.html\n@@ -2,1 +2,1 @@\n-<p>old</p>\n+<p>new</p>\n';
 const id='00000000-0000-4000-8000-000000000001',run='00000000-0000-4000-8000-000000000002',steps=[{step:1,key:'Tab',text:null,checkpoint:true}];
 const c=validatePatchProposal({runId:id,source,baseSha256:sha256(source),evidenceRefs:['speech:1'],knownEvidenceRefs:['speech:1'],proposal:{diff,rationale:'Offline test',expected_speech_after:[]}});assert.equal(c.ok,true);
 const candidate=c.patched['index.html'];
 const baseline={id,user_id:'owner',journey_id:'fernway-passenger',status:'completed',evidence_status:'complete',spec:{app_hash:sha256(source),steps}};
 const patch={id:'patch',run_id:id,status:'approved',reviewed_by:'owner',diff,validator:{ok:true,contract:c.contract}};
 const application={id:'candidate',user_id:'owner',run_id:id,patch_id:'patch',base_source:source,base_sha256:sha256(source),patch_sha256:sha256(diff),source_sha256:sha256(candidate),source:candidate};
 const binding={verify_run_id:run,baseline_run_id:id,application_id:'candidate',source_sha256:sha256(candidate),patch_sha256:sha256(diff),user_id:'owner'};
 const spec={version:'0.1.0',run_id:run,journey_id:baseline.journey_id,variant:'patched',patch_ref:sha256(diff),app_hash:sha256(candidate),steps};
 return {spec,bundle:{application,patch,baseline,binding},evidenceDir:'D:/offline-evidence',timing:{ackMs:1000,timeoutMs:1000,observationMs:2000,pollMs:10},handleTimeoutMs:1000,focusWaitMs:1000};
}
test('native adapter supplies exact detached candidate bytes and unchanged journey to real session contract',()=>{const a=sample(),data=preparePatchedSession(a);assert.equal(sha256(data.fixture),a.spec.app_hash);assert.deepEqual(data.approved.task,[{step:'step-1',press:'Tab'}]);assert.equal(data.approved.fixture_sha256,a.spec.app_hash);a.bundle.application.source='substitution';assert.notEqual(data.fixture.toString(),'substitution');assert.equal(data.spec.actions,1);});
test('substitution, foreign owner, replay, stale revision, incomplete baseline and invalid native documents refuse',()=>{for(const mutate of [a=>a.bundle.application.source+='x',a=>a.bundle.binding.user_id='foreign',a=>a.spec.run_id=a.bundle.baseline.id,a=>a.bundle.application.base_sha256='0'.repeat(64),a=>a.bundle.baseline.evidence_status='incomplete',a=>a.spec.steps=[{...a.spec.steps[0],key:'Enter'}],a=>a.timing.actions=99]){const a=sample();mutate(a);assert.throws(()=>preparePatchedSession(a));}});
test('native plan consumes repair bytes only when approved fixture and task match',async()=>{
 const {r2SessionData}=await import('../scripts/tabwise/r2-run.mjs');const a=sample(),data=preparePatchedSession(a),page={id:data.fixture_id,query:data.approved.query,fixture_sha256:a.spec.app_hash,task:data.approved.task},plan={spec:a.timing,handleTimeoutMs:a.handleTimeoutMs,focusWaitMs:a.focusWaitMs};
 assert.deepEqual(r2SessionData(plan,page,data.fixture,a.evidenceDir,a),data);
 assert.throws(()=>r2SessionData(plan,page,Buffer.from('substitution'),a.evidenceDir,a));
 assert.throws(()=>r2SessionData(plan,{...page,fixture_sha256:'0'.repeat(64)},data.fixture,a.evidenceDir,a));
 assert.throws(()=>r2SessionData(plan,{...page,task:[{step:'step-1',press:'Enter'}]},data.fixture,a.evidenceDir,a));
});

test('staged source cleanup remains bound to the created directory after a consumer crash',async()=>{
 const {stagePatchedWorkerSource}=await import('../scripts/tabwise/repair-source.mjs');
 const {mkdtemp,writeFile,readFile,rm,stat}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const a=sample(),dir=await mkdtemp(join(tmpdir(),'r3-delivery-')),path=join(dir,'bundle.json');
 try{await writeFile(path,JSON.stringify(a.bundle));const source=await stagePatchedWorkerSource({spec:a.spec,bundlePath:path});
  try{assert.equal(await readFile(join(source.root,'index.html'),'utf8'),a.bundle.application.source);assert.throws(()=>{source.root=dir;});throw Error('consumer crash');}
  catch(e){assert.equal(e.message,'consumer crash');}finally{await source.dispose();await source.dispose();}
  await assert.rejects(()=>stat(source.root),{code:'ENOENT'});assert.ok(await stat(path));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('approved repair packet binds stored owner, product run, revision and initial worker attempt',async()=>{
 const {validateRepairPacket}=await import('../scripts/tabwise/repair-session.mjs');const {parseR2Plan}=await import('../scripts/tabwise/r2-run.mjs');
 const a=sample(),head='a'.repeat(40),env={GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1'};
 const packet={schema:'tabwise-r3-native-input/1',owner_id:'owner',product_run_id:a.spec.run_id,revision:head,attempt:1,spec:a.spec,bundle:{...a.bundle,run:{id:a.spec.run_id,user_id:'owner',kind:'verify',status:'running',gh_head_sha:head,gh_run_id:123,spec:a.spec}}};
 assert.deepEqual(validateRepairPacket({packet,head,env}).spec,a.spec);
 for(const change of [p=>p.owner_id='foreign',p=>p.product_run_id=p.bundle.baseline.id,p=>p.revision='b'.repeat(40),p=>p.attempt=2,p=>p.bundle.run.gh_run_id=999,p=>p.bundle.run.status='cancelled',p=>p.bundle.application.source+='x']){const bad=structuredClone(packet);change(bad);assert.throws(()=>validateRepairPacket({packet:bad,head,env}));}
 assert.throws(()=>validateRepairPacket({packet,head,env:{...env,GITHUB_RUN_ATTEMPT:'2'}}));
 const data=preparePatchedSession(a),plan={schema:'tabwise-r2-plan/1',split:'withheld',spec:a.timing,handleTimeoutMs:1000,focusWaitMs:1000,pages:[{id:a.spec.journey_id,fixture:'index.html',query:data.approved.query,fixture_sha256:a.spec.app_hash,task:data.approved.task}],repair:{path:'repair.json',sha256:sha256(JSON.stringify(packet))}};
 assert.deepEqual(parseR2Plan(Buffer.from(JSON.stringify(plan))).repair,plan.repair);
 for(const repair of [{...plan.repair,path:'../foreign.json'},{...plan.repair,sha256:'wrong'},{...plan.repair,unexpected:true}])assert.throws(()=>parseR2Plan(Buffer.from(JSON.stringify({...plan,repair}))));
});

test('native evidence URL and independent reseal verification bind the approved flow query',async()=>{
 const {createR2EvidenceWriter,verifyR2PageEvidence}=await import('../scripts/tabwise/r2-evidence.mjs');const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const a=sample(),data=preparePatchedSession(a),root=await mkdtemp(join(tmpdir(),'r3-query-')),dir=join(root,'page');
 try{const writer=createR2EvidenceWriter({enabled:true,dir,page:{fixture_id:data.fixture_id,session:'synthetic-query-test',port:4100},fixture:data.fixture,approved:data.approved,nonce:'00000000',spec:data.spec});
  assert.equal(writer.identity.url,'http://127.0.0.1:4100/index.html?flow=passenger&variant=broken');
  await writer.seal({incomplete:['Synthetic URL-binding check only; no native observation.']});
  const checked=await verifyR2PageEvidence(dir,{fixture:data.fixture,approved:data.approved});assert.equal(checked.ok,true,checked.errors.join('; '));assert.equal(checked.class,'incomplete');
  const wrong=await verifyR2PageEvidence(dir,{fixture:data.fixture,approved:{...data.approved,query:'?flow=seat&variant=broken'}});assert.equal(wrong.ok,false);
 }finally{await rm(root,{recursive:true,force:true});}
});
