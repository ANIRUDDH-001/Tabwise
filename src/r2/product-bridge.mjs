// Fixture inspection never mints a native handle; production policy is loaded internally.
import {readFileSync} from 'node:fs';
import {createPublicKey,verify} from 'node:crypto';
import {assertContract,sha256,LIMITS} from '../../packages/contracts/index.mjs';
import {SCHEMA,IDENTITY_KEYS,identity,exact,stable,same,safePath,validateR2ProductArtifact} from '../../packages/contracts/r2-product.mjs';
import {parseUniqueJson as uniqueJson} from './strict-json.mjs';
import {reviewedR2Module} from './node-review.mjs';
import {captureObservationSources} from './capture-export.mjs';
import {verifyNativeProductOrigin} from './product-origin.mjs';
const handles=new WeakMap(),copyFiles=f=>Object.fromEntries(Object.entries(f).map(([p,b])=>[p,Buffer.from(b)]));
const parse=b=>uniqueJson(new TextDecoder('utf-8',{fatal:true}).decode(b));
function inspect({files,expected},producerAuthority){
 if(!files||Object.getPrototypeOf(files)!==Object.prototype||Object.keys(files).length>98)throw Error('source file map');
 let total=0;for(const [p,b] of Object.entries(files)){if(!safePath(p)||!(b instanceof Uint8Array))throw Error('source bytes/path');total+=b.length;}if(total>LIMITS.RUN_BYTES)throw Error('source total cap');
 const exp=parse(files['r2-export.json']);exact(exp,['schema','identity','source_files','step_map','observations','axe','stage_timings']);identity(exp.identity);const i=exp.identity;
 if(exp.schema!=='tabwise-r2-product-export/1'||!expected||IDENTITY_KEYS.some(k=>!same(i[k],expected[k])))throw Error('trusted identity mismatch');
 assertContract('run-spec',expected.spec);
 if(i.product_run_id!==expected.spec.run_id||i.journey_id!==expected.spec.journey_id||i.app_hash!==expected.spec.app_hash||i.app_hash!==i.fixture_sha256||sha256(files['product-spec.json'])!==i.spec_sha256||!same(parse(files['product-spec.json']),expected.spec))throw Error('product spec/app binding');
 if(!Array.isArray(exp.source_files)||!same(exp.source_files.map(f=>f.path),Object.keys(files).filter(p=>p!=='r2-export.json').sort()))throw Error('exact source coverage');
 for(const f of exp.source_files){exact(f,['path','sha256','bytes','kind']);if(!['journal','source','axe','screenshot'].includes(f.kind)||!safePath(f.path)||['evidence.json','native-attestation.json'].includes(f.path)||sha256(files[f.path])!==f.sha256||files[f.path].length!==f.bytes)throw Error('source hash mismatch');}
 if(sha256(Buffer.from(new TextDecoder('utf-8',{fatal:true}).decode(files['plan.json']).replace(/\r\n/g,'\n')))!==i.plan_sha256)throw Error('approved plan digest');
 const plan=reviewedR2Module('r2-run.mjs').parseR2Plan(files['plan.json']),p=plan.pages.find(p=>p.id===i.page_id);
 if(!p||p.fixture_sha256!==i.fixture_sha256||sha256(Buffer.from(new TextDecoder('utf-8',{fatal:true}).decode(files[p.fixture]).replace(/\r\n/g,'\n')))!==i.fixture_sha256)throw Error('plan fixture');
 if(sha256(files['run-manifest.json'])!==i.run_manifest_sha256||sha256(files[i.page_id+'/manifest.json'])!==i.page_manifest_sha256||files['run-manifest.sha256']?.toString()!==i.run_manifest_sha256+'  run-manifest.json\n'||files[i.page_id+'/manifest.sha256']?.toString()!==i.page_manifest_sha256+'  manifest.json\n')throw Error('sealed source identity');
 const run=parse(files['run-manifest.json']),page=parse(files[i.page_id+'/manifest.json']),capture=parse(files[i.page_id+'/capture.json']);
 const origin=files['product-producer/product-run.json']?verifyNativeProductOrigin({files,expected,authority:producerAuthority}):null;
 if(origin&&(!Array.isArray(exp.observations)||exp.observations.some(p=>!p||!Object.hasOwn(p,'pointer'))||!Array.isArray(exp.axe)||exp.axe.length))throw Error('fresh producer requires original raw capture projections');
 const rawClass=origin?'synthetic':'genuine-unqualified';
 if(run.schema!=='tabwise-r2-run-evidence/1'||run.run_class!==rawClass||'stopped_after' in run||run.plan_sha256!==sha256(stable(plan))||!same(run.order,plan.pages.map(p=>p.id))||run.pages.length!==plan.pages.length)throw Error('synthetic/incomplete/unbound R2 run');
 for(const [n,entry] of run.pages.entries()){
  if(entry.class!==rawClass||entry.exit_code!==0||entry.id!==entry.dir||entry.id!==run.order[n]||!files[entry.id+'/manifest.json']||sha256(files[entry.id+'/manifest.json'])!==entry.manifest_sha256||files[entry.id+'/manifest.sha256']?.toString()!==entry.manifest_sha256+'  manifest.json\n')throw Error('incomplete R2 page');
 }
 const entry=run.pages.find(p=>p.id===i.page_id);
 if(entry?.manifest_sha256!==i.page_manifest_sha256||page.schema!=='tabwise-r2-page-evidence/1'||page.class!==rawClass||page.page?.fixture_id!==i.page_id||page.page.session!==i.session||page.transform?.fixture_sha256!==i.fixture_sha256||!Array.isArray(page.incomplete)||page.incomplete.length)throw Error('page/session binding');
 if(!Array.isArray(page.files))throw Error('page file table');for(const f of page.files){if(!safePath(f.path)||!files[i.page_id+'/'+f.path]||sha256(files[i.page_id+'/'+f.path])!==f.sha256||files[i.page_id+'/'+f.path].length!==f.bytes)throw Error('page source hash');}
 if(capture.schema!=='r2-capture/1'||capture.fixture_id!==i.page_id||capture.completed!==true||capture.outcome!=='COMPLETE'||!['nvda','observed-nvda'].includes(capture.source)||capture.reasons?.length||capture.unattributed?.length||capture.unattributed_page?.length||capture.records?.length!==p.task.length)throw Error('unverified native capture');
 if(!Array.isArray(exp.step_map)||exp.step_map.length!==expected.spec.steps.length||exp.step_map.length!==p.task.length)throw Error('step coverage');
 const map=new Map();for(const [n,m] of exp.step_map.entries()){exact(m,['task','action','step']);const task=p.task[n],step=expected.spec.steps[n],raw=page.step_map?.actions?.[n],record=capture.records[n];
  if(m.task!==task.step||m.action!=='a'+(n+1)||m.step!==step.step||task.press!==step.key||raw?.task!==m.task||raw.action!==m.action||raw.press!==task.press||record.step!==m.action||record.press!==task.press||!['speech','observed-silence'].includes(record.capture_status)||record.reasons?.length||map.has(m.task))throw Error('step/task/action binding');map.set(m.task,m);}
 const lanes={keys:[],focus:[],speech:[],app_events:[],screenshots:[]},axe=[],refs=new Set(),pointers=new Set(),sequences=new Set(),last=new Map(),lastTime=new Map();
 const native=exp.observations?.some(p=>'pointer' in p)?captureObservationSources({files,expected}):null;
 if(native&&!same(exp.observations,native.map(x=>x.pointer)))throw Error('raw capture coverage');
 function source(pointer,kind){
  if('pointer' in pointer){
   exact(pointer,['path','pointer']);const found=native?.find(x=>same(x.pointer,pointer));
   if(!found||kind!=='event')throw Error('raw capture pointer');
   return accept(found.row,kind);
  }
  exact(pointer,['path','line']);if(!Number.isSafeInteger(pointer.line)||pointer.line<1||!exp.source_files.some(f=>f.path===pointer.path)||pointers.has(pointer.path+':'+pointer.line))throw Error('source pointer');
  pointers.add(pointer.path+':'+pointer.line);const lines=new TextDecoder('utf-8',{fatal:true}).decode(files[pointer.path]).split('\n');if(!lines.at(-1))lines.pop();const line=lines[pointer.line-1];if(!line||line.length>30000)throw Error('missing raw observation');
  const row=uniqueJson(line);return accept(row,kind);
 }
 function accept(row,kind){exact(row,['schema','lane','page_id','session','task','action',kind]);const m=map.get(row.task);
  if(row.schema!=='tabwise-r2-product-observation/1'||row.page_id!==i.page_id||row.session!==i.session||!m||m.action!==row.action||row[kind]?.step!==m.step)throw Error('raw observation binding');
  const e=row[kind];if(refs.has(e.evidence_ref))throw Error('duplicate evidence reference');refs.add(e.evidence_ref);
  if(kind==='event'){if(!Object.hasOwn(lanes,row.lane))throw Error('observation lane');const k=e.clock+':'+e.seq;if(sequences.has(k)||e.seq<=(last.get(e.clock)??-1)||e.t<(lastTime.get(e.clock)??0))throw Error('observation sequence');sequences.add(k);last.set(e.clock,e.seq);lastTime.set(e.clock,e.t);if(e.artifact_path!==null&&(!Object.hasOwn(files,e.artifact_path)||!exp.source_files.some(f=>f.path===e.artifact_path)))throw Error('missing observed artifact');lanes[row.lane].push(structuredClone(e));}
  else{if(row.lane!=='axe'||!Object.hasOwn(files,e.artifact_path))throw Error('axe source missing');axe.push(structuredClone(e));}
 }
 if(!Array.isArray(exp.observations)||exp.observations.length>2000||!Array.isArray(exp.axe)||exp.axe.length>25)throw Error('observation cap');
 for(const ptr of exp.observations)source(ptr,'event');for(const ptr of exp.axe)source(ptr,'axe');
 const referencedFiles=new Set([...exp.observations,...exp.axe].map(p=>p.path));
 for(const f of exp.source_files.filter(f=>f.path.endsWith('.jsonl'))){
  const lines=new TextDecoder('utf-8',{fatal:true}).decode(files[f.path]).split('\n');if(!lines.at(-1))lines.pop();
  for(const [n,line] of lines.entries()){
   if(!line)throw Error('empty source record');const row=uniqueJson(line);
   if(row?.schema==='tabwise-r2-product-observation/1'&&!pointers.has(f.path+':'+(n+1))||referencedFiles.has(f.path)&&row?.schema!=='tabwise-r2-product-observation/1')throw Error('unmapped native observation');
  }
 }

 for(const step of expected.spec.steps)if(!['keys','speech','focus'].every(l=>lanes[l].some(e=>e.step===step.step)))throw Error('missing observation telemetry');
 const evidence={version:'0.1.0',run_id:i.product_run_id,journey_id:i.journey_id,provenance:'synthetic-test',evidence_status:'incomplete',association:'observation-window-only',lanes,axe};assertContract('evidence-bundle',evidence);
 return {exp,evidence,files:copyFiles(files),identity:structuredClone(i)};
}
function project(data,native=false,attestation=null){
 const files=copyFiles(data.files),evidence=structuredClone(data.evidence);
 if(native){evidence.provenance='observed-nvda';evidence.evidence_status='complete';files['native-attestation.json']=Buffer.from(JSON.stringify(attestation));}
 files['evidence.json']=Buffer.from(JSON.stringify(evidence));const i=data.identity,kind=new Map(data.exp.source_files.map(f=>[f.path,f.kind]));kind.set('r2-export.json','journal');kind.set('native-attestation.json','journal');kind.set('evidence.json','evidence');
 const manifest={schema:SCHEMA,version:'0.1.0',run_id:i.product_run_id,spec_sha256:i.spec_sha256,evidence_sha256:sha256(files['evidence.json']),files:Object.keys(files).sort().map(path=>({path,sha256:sha256(files[path]),bytes:files[path].length,kind:kind.get(path)})),stage_timings:structuredClone(data.exp.stage_timings),runner:{workflow:i.workflow,event:'workflow_dispatch',head_branch:'main',head_sha:i.revision,actor:i.actor,github_run_id:i.github_run_id,github_run_attempt:i.github_run_attempt,profile:i.profile,nvda_version:i.nvda_version},r2_identity:structuredClone(i),export_sha256:sha256(files['r2-export.json']),native_attestation_sha256:attestation?sha256(files['native-attestation.json']):null,evidence_status:evidence.evidence_status};
 const c=validateR2ProductArtifact(manifest,files);if(!c.ok)throw Error(c.errors.join('; '));return {manifest,evidence,files};
}
export function inspectR2ProductExport(input){try{return {ok:true,errors:[],source_verified:false,preview:project(inspect(input,input.producerAuthority))};}catch(e){return {ok:false,errors:[e.message],source_verified:false,preview:null};}}
function attest(data,envelope,policy){
 exact(policy,['schema','enabled','public_key','review_ref','qualification_sha256','source_scope_sha256','not_before','not_after']);
 if(policy.schema!=='tabwise-r2-native-product-policy/1'||policy.enabled!==true)throw Error('native qualification disabled');
 exact(envelope,['payload','signature']);const p=envelope.payload;exact(p,['schema','export_sha256','identity','review_ref','qualification_sha256','source_scope_sha256','created_at','integrity_verified','observation_complete','custody_confirmed','runtime']);
 const key=createPublicKey(policy.public_key);if(key.asymmetricKeyType!=='ed25519'||typeof envelope.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)||!verify(null,Buffer.from(stable(p)),key,Buffer.from(envelope.signature,'base64')))throw Error('native attestation signature');
 if(p.schema!=='tabwise-r2-native-attestation/1'||p.export_sha256!==sha256(data.files['r2-export.json'])||!same(p.identity,data.identity)||p.review_ref!==policy.review_ref||p.qualification_sha256!==policy.qualification_sha256||p.qualification_sha256!==data.identity.qualification_sha256||p.source_scope_sha256!==policy.source_scope_sha256||p.source_scope_sha256!==data.identity.r2_source_sha256||p.integrity_verified!==true||p.observation_complete!==true||p.custody_confirmed!==true||p.runtime!=='nvda')throw Error('native verifier binding');
 const iso=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
 if(![p.created_at,policy.not_before,policy.not_after].every(iso)||typeof policy.review_ref!=='string'||!policy.review_ref)throw Error('native verification metadata');
 const t=Date.parse(p.created_at),from=Date.parse(policy.not_before),to=Date.parse(policy.not_after);if(![t,from,to].every(Number.isFinite)||t<from||t>Date.now()||Date.now()>to)throw Error('stale native verification');return true;
}
export function assessNativeAttestation(input,policy){try{const data=inspect(input);attest(data,input.attestation,policy);return {ok:true,errors:[],source_verified:false};}catch(e){return {ok:false,errors:[e.message],source_verified:false};}}
export function openQualifiedR2ProductEvidence(input){
 const policy=JSON.parse(readFileSync(new URL('../../scripts/tabwise/r2-product-policy.json',import.meta.url),'utf8')),q=JSON.parse(readFileSync(new URL('../../scripts/tabwise/qualification-status.json',import.meta.url),'utf8'));
 if(policy.enabled!==true||q.enabled!==true||q.verdict!=='PASS')throw Error('native qualification disabled');
 if(q.reviewed_sha256!==policy.qualification_sha256)throw Error('qualification digest mismatch');
 const data=inspect(input);attest(data,input.attestation,policy);const handle=Object.freeze({});handles.set(handle,project(data,true,input.attestation));return handle;
}
export function readQualifiedR2ProductEvidence(handle){const d=handles.get(handle);if(!d)throw Error('qualified native evidence handle required');return {manifest:structuredClone(d.manifest),evidence:structuredClone(d.evidence),files:copyFiles(d.files)};}
