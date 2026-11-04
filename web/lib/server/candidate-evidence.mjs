// Authenticated GitHub origin plus raw replay. Candidate keys/signatures are
// consistency checks, never independent qualification or production authority.
import {readArtifactZip} from './artifact-zip.mjs';
import {sha256} from '../../../packages/contracts/index.mjs';
import {stable,same} from '../../../packages/contracts/r2-product.mjs';
import {parseUniqueJson} from '../../../src/r2/strict-json.mjs';
import {captureObservationSources} from '../../../src/r2/capture-export.mjs';
import {validateRuntimeMetadata} from '../../../src/r2/runtime-metadata.mjs';
import {verifyAdmissionRecord} from '../../../scripts/tabwise/r2-admission.mjs';
const CLASS='NONPRODUCTION_UNQUALIFIED',fail=why=>{throw Error('candidate evidence refused: '+why);};
export function encodeCandidateArchive(bytes,expected){
 if(!(bytes instanceof Uint8Array)||!/^\d+$/.test(expected?.id??'')||bytes.length!==expected.bytes||sha256(bytes)!==expected.sha256)fail('original archive wrapper binding');
 const wrapped=Buffer.from(stable({schema:'tabwise-candidate-original-archive/1',original_artifact_id:expected.id,encoding:'base64',sha256:expected.sha256,bytes:bytes.length,data:Buffer.from(bytes).toString('base64')}));
 if(wrapped.length>4000000)fail('original archive exceeds existing storage object cap');return wrapped;
}
export function decodeCandidateArchive(wrapped,expected){
 if(!(wrapped instanceof Uint8Array)||wrapped.length>4000000)fail('bounded original archive wrapper required');
 const v=parseUniqueJson(Buffer.from(wrapped).toString('utf8'));
 if(Object.keys(v).sort().join(',')!=='bytes,data,encoding,original_artifact_id,schema,sha256'||v.schema!=='tabwise-candidate-original-archive/1'||v.original_artifact_id!==expected.id||v.encoding!=='base64'||v.sha256!==expected.sha256||v.bytes!==expected.bytes||typeof v.data!=='string')fail('original archive wrapper identity');
 const bytes=Buffer.from(v.data,'base64');if(bytes.toString('base64')!==v.data||bytes.length!==expected.bytes||sha256(bytes)!==expected.sha256)fail('original archive wrapper bytes');return bytes;
}
export function selectCandidateArtifacts({userId,row,remote,jobs,artifacts}){
 const r=row?.request,id=row?.github_run_id;
 if(!r||row.user_id!==userId||row.state!=='RUN_BOUND'||!id||String(remote?.id)!==id||remote.status!=='completed'||remote.conclusion!=='success'||remote.event!=='workflow_dispatch'||remote.path!==r.workflow||remote.head_sha!==r.revision||'refs/heads/'+remote.head_branch!==r.ref||remote.run_attempt!==2||remote.actor?.login!==r.actor||remote.triggering_actor?.login!==r.actor||remote.repository?.full_name!==r.repository)fail('owned successful exact candidate workflow required');
 if(!Array.isArray(jobs)||jobs.length>20)fail('bounded jobs required');
 for(const name of ['candidate-native','candidate-verify']){const hits=jobs.filter(j=>j.name===name);if(hits.length!==1||hits[0].status!=='completed'||hits[0].conclusion!=='success'||hits[0].run_attempt!==2)fail('separate native/verifier success required');}
 if(!Array.isArray(artifacts)||artifacts.length>20)fail('bounded artifacts required');
 const pick=name=>{const hits=artifacts.filter(a=>a.name===name);if(hits.length!==1)fail('unique original artifact required');const a=hits[0];if(!Number.isSafeInteger(a.id)||a.id<1||a.expired!==false||!Number.isSafeInteger(a.size_in_bytes)||a.size_in_bytes<1||a.size_in_bytes>8000000||!/^sha256:[a-f0-9]{64}$/.test(a.digest??'')||String(a.workflow_run?.id)!==id||a.workflow_run.head_sha!==r.revision||a.workflow_run.head_branch!==remote.head_branch)fail('artifact identity/digest');return a;};
 return {native:pick('candidate-native-'+id+'-2'),readback:pick('candidate-readback-'+id+'-2')};
}
export async function prepareCandidateEvidence({userId,row,remote,jobs,artifacts,nativeArchive,readbackArchive,verifySealed}){
 const selected=selectCandidateArtifacts({userId,row,remote,jobs,artifacts}),r=row.request;
 for(const [kind,bytes] of [['native',nativeArchive],['readback',readbackArchive]])if(!(bytes instanceof Uint8Array)||bytes.length!==selected[kind].size_in_bytes||'sha256:'+sha256(bytes)!==selected[kind].digest)fail('original archive hash');
 const files=readArtifactZip(nativeArchive),separate=readArtifactZip(readbackArchive),json=path=>{if(!files[path])fail('missing '+path);return parseUniqueJson(files[path].toString('utf8'));};
 if(Object.keys(separate).join(',')!=='candidate-readback.json')fail('separate readback inventory');
 const readback=parseUniqueJson(separate['candidate-readback.json'].toString('utf8'));
 if(readback.schema!=='tabwise-candidate-readback/1'||readback.classification!==CLASS||readback.production_qualified!==false||readback.integrity_pass!==true||readback.native_interaction_pass!==true||!same(readback.request,r)||readback.github_run_id!==row.github_run_id||readback.github_run_attempt!==2||!Array.isArray(readback.negative)||readback.negative.length!==5||new Set(readback.negative.map(n=>n.kind)).size!==5||readback.negative.some(n=>n.refused!==true))fail('independent readback binding');
 const index=json('index.json'),actual=Object.fromEntries(Object.entries(files).filter(([path])=>path!=='index.json').map(([path,b])=>[path,{sha256:sha256(b),bytes:b.length}]));
 if(!same(index,actual))fail('raw index coverage');
 const envelope=json('request.json');
 if(!same(envelope.request,r)||envelope.spec_text!==row.spec_text||files['saved-spec.json']?.toString('utf8')!==row.spec_text||sha256(Buffer.from(row.spec_text))!==r.spec_sha256)fail('saved product source');
 const report=json('report.json'),session=json('session.json'),authority=json('authority.json'),admission=json('admission.json'),p=report.approval;
 if(report.classification!==CLASS||report.production_qualified!==false||report.pass!==true||report.product_run_id!==row.product_run_id||report.request_sha256!==r.request_sha256||p?.request_sha256!==r.request_sha256||p.github_run_id!==row.github_run_id||p.github_run_attempt!==2||p.revision!==r.revision||p.production_qualified!==false||session.completed!==true||session.nvda!=='stopped')fail('native lifecycle identity');
 const source=Object.fromEntries(Object.entries(files).filter(([path])=>path.startsWith('source/')).map(([path,b])=>[path.slice(7),b]));
 const runManifest=source['run-manifest.json'];if(!runManifest||sha256(runManifest)!==readback.run_manifest_sha256)fail('run manifest binding');
 const binding=authority.binding;
 if(authority.id!=='candidate-'+row.product_run_id||binding.purpose!=='candidate-execution'||binding.permitted_attempt!==2||binding.reviewed_sha256!==r.source_scope_sha256||binding.qualification_sha256!==r.runtime_scope_sha256||binding.owner_approval_ref!=='CANDIDATE-'+r.request_sha256||binding.review_ref!=='NONPRODUCTION:'+sha256(stable(p))||binding.revision!==r.revision||binding.workflow!==r.workflow||binding.actor!==r.actor||binding.repository!==r.repository||!same(authority.consumer,{run_id:row.github_run_id,attempt:2}))fail('candidate-only W5 binding');
 verifyAdmissionRecord(admission,{...authority,manifest:readback.run_manifest_sha256,pages:['candidate-seat']});
 if(typeof verifySealed!=='function'||!await verifySealed({files:source,request:r}))fail('raw sealed replay');
 const page=parseUniqueJson(source['candidate-seat/manifest.json'].toString('utf8'));
 const rows=captureObservationSources({files:source,expected:{page_id:'candidate-seat',session:page.page.session,spec:parseUniqueJson(row.spec_text)}});
 const runtimeEvents=source['candidate-seat/events.jsonl'].toString('utf8').trimEnd().split('\n').map(parseUniqueJson).filter(e=>e.phase==='native-runtime');
 if(runtimeEvents.length!==1)fail('runtime metadata coverage');const runtime=validateRuntimeMetadata(runtimeEvents[0].runtime);
 if(!same(rows,readback.rows)||!same(runtime,readback.runtime)||!rows.some(r=>r.row.lane==='speech'))fail('observation/runtime readback replay');
 return {schema:'tabwise-candidate-stored-evidence/1',classification:CLASS,production_qualified:false,native_interaction_pass:true,product_run_id:row.product_run_id,request_sha256:r.request_sha256,github_run_id:row.github_run_id,revision:r.revision,runtime,rows,run_manifest_sha256:readback.run_manifest_sha256,archives:{native:{id:String(selected.native.id),sha256:sha256(nativeArchive),bytes:nativeArchive.length},readback:{id:String(selected.readback.id),sha256:sha256(readbackArchive),bytes:readbackArchive.length}}};
}
