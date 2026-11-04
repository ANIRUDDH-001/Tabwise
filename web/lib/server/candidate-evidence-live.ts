import 'server-only';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {serviceClient,requireUser} from './supabase';
import {candidateConfiguration} from './candidate-run-live';
import {candidateRunStore} from './candidate-run.mjs';
import {prepareCandidateEvidence,selectCandidateArtifacts,encodeCandidateArchive,decodeCandidateArchive} from './candidate-evidence.mjs';
import {reviewedSourceRoot,reviewedR2Module} from '../../../src/r2/node-review.mjs';
import {withVerificationDirectory} from './verification-directory.mjs';
import {stable,same} from '../../../packages/contracts/r2-product.mjs';
import {sha256} from '../../../packages/contracts/index.mjs';
import {endpoint} from './http';
import {HttpError} from './core.mjs';
import {downloadArtifact} from './github';
const rawRequire=createRequire(import.meta.url),base='https://api.github.com/repos/ANIRUDDH-001/Tabwise';
async function candidateRemote(id:string,part=''){
 if(!/^[1-9][0-9]{0,19}$/.test(id)||!['','/artifacts?per_page=20','/jobs?per_page=20'].includes(part))throw Error('candidate remote identity');
 const token=process.env.GH_PAT;if(!token)throw new HttpError(503,'github_credential_pending');
 const r=await fetch(base+'/actions/runs/'+id+part,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!r.ok||Number(r.headers.get('content-length')??0)>200000)throw Error('candidate remote unavailable');return r.json();
}
async function authorized(request:Request,id:string){
 const user=await requireUser(),c=candidateConfiguration();
 if(c.enabled!==true||c.ref!=='refs/heads/feat/tabwise-r2-r7-product-completion')throw new HttpError(503,'candidate_execution_disabled');
 if(c.userId!==user.id)throw new HttpError(403,'candidate_owner_required');
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))throw new HttpError(404,'candidate_not_found');
 const db=serviceClient(),row=await candidateRunStore(db).read(user.id,id);if(!row)throw new HttpError(404,'candidate_not_found');return {user,db,row};
}
export async function candidateIngestPOST(request:Request,id:string){return endpoint(request,async()=>{
 const {user,db,row}=await authorized(request,id);
 if(row.state==='EVIDENCE_READY')return Response.json({state:row.state,classification:'NONPRODUCTION_UNQUALIFIED',production_qualified:false,replayed:true});
 if(row.state!=='RUN_BOUND')throw new HttpError(409,'candidate_request_conflict');
 const [remote,jobsResult,artifactsResult]=await Promise.all([candidateRemote(row.github_run_id),candidateRemote(row.github_run_id,'/jobs?per_page=20'),candidateRemote(row.github_run_id,'/artifacts?per_page=20')]);
 if(jobsResult.total_count>20||artifactsResult.total_count>20)throw new HttpError(409,'candidate_evidence_unavailable');
 const context={userId:user.id,row,remote,jobs:jobsResult.jobs,artifacts:artifactsResult.artifacts},selected=selectCandidateArtifacts(context);
 const [nativeArchive,readbackArchive]=await Promise.all([downloadArtifact(String(selected.native.id)),downloadArtifact(String(selected.readback.id))]);
 const evidence=await prepareCandidateEvidence({...context,nativeArchive,readbackArchive,verifySealed:async({files,request:r}:{files:Record<string,Uint8Array>,request:unknown})=>withVerificationDirectory(async(dir:string)=>{
  const root=reviewedSourceRoot(),policy=rawRequire(/* webpackIgnore: true */ resolve(root,'diagnostics/r2-candidate/policy.mjs'));
  const plan=reviewedR2Module('r2-run.mjs').parseR2Plan(files['plan.json']);if(!same(plan,policy.candidatePlan(r)))return false;
  for(const [path,bytes] of Object.entries(files)){const dest=resolve(dir,path);if(!dest.startsWith(resolve(dir)+'/')&&!dest.startsWith(resolve(dir)+'\\'))throw Error('candidate scratch scope');await mkdir(dirname(dest),{recursive:true});await writeFile(dest,bytes,{flag:'wx'});}
  const fixtures=new Map([['candidate-seat',Buffer.from(readFileSync(resolve(root,'fixtures/fernway/index.html'),'utf8').replaceAll('\r\n','\n'))]]);
  const result=await reviewedR2Module('r2-run.mjs').r2VerifyRun({plan,pages:plan.pages,fixtures},dir);return result.ok&&result.complete;
 })});
 const evidenceBytes=Buffer.from(stable(evidence)),digest=sha256(evidenceBytes),prefix='candidate/'+id+'/'+digest;
 // Preserve exact original ZIP bytes losslessly in the existing JSON-only
 // private bucket. No MIME allowlist, access policy or object cap is widened.
 const bytesByName={'native-archive.json':encodeCandidateArchive(nativeArchive,evidence.archives.native),'readback-archive.json':encodeCandidateArchive(readbackArchive,evidence.archives.readback),'evidence.json':evidenceBytes};
 // Content-addressed immutable staging: unknown outcomes retain originals. A
 // retry recovers only identical bytes, and never starts another native run.
 for(const [name,bytes] of Object.entries(bytesByName)){
  const path=prefix+'/'+name,{error}=await db.storage.from('tabwise-evidence').upload(path,bytes,{contentType:'application/json',upsert:false});
  if(error){const saved=await db.storage.from('tabwise-evidence').download(path);if(saved.error||!saved.data||saved.data.size!==bytes.length||sha256(Buffer.from(await saved.data.arrayBuffer()))!==sha256(bytes))throw new HttpError(503,'candidate_evidence_unavailable');}
 }
 const {error}=await db.rpc('finish_candidate_native_evidence',{p_user:user.id,p_run:id,p_request_sha:row.request_sha256,p_gh_run_id:row.github_run_id,p_readback:evidence,p_sha:digest});
 if(error)throw new HttpError(409,'candidate_evidence_unavailable');
 return Response.json({state:'EVIDENCE_READY',classification:'NONPRODUCTION_UNQUALIFIED',production_qualified:false,observation_rows:evidence.rows.length});
 },true);}
export async function candidateEvidenceGET(request:Request,id:string){return endpoint(request,async()=>{
 const {row,db}=await authorized(request,id);
 if(row.state!=='EVIDENCE_READY'||!row.readback||!row.readback_sha256)throw new HttpError(409,'candidate_evidence_unavailable');
 const prefix='candidate/'+id+'/'+row.readback_sha256;
 const {data,error}=await db.storage.from('tabwise-evidence').download(prefix+'/evidence.json');
 if(error||!data||data.size>2000000)throw new HttpError(503,'candidate_evidence_unavailable');
 const bytes=Buffer.from(await data.arrayBuffer());
 if(sha256(bytes)!==row.readback_sha256||bytes.toString('utf8')!==stable(row.readback)||row.readback.classification!=='NONPRODUCTION_UNQUALIFIED'||row.readback.production_qualified!==false)throw new HttpError(409,'candidate_evidence_unavailable');
 await Promise.all(['native','readback'].map(async kind=>{const saved=await db.storage.from('tabwise-evidence').download(prefix+'/'+kind+'-archive.json');if(saved.error||!saved.data||saved.data.size>4000000)throw new HttpError(503,'candidate_evidence_unavailable');decodeCandidateArchive(Buffer.from(await saved.data.arrayBuffer()),row.readback.archives[kind]);}));
 return Response.json(row.readback,{headers:{'Cache-Control':'private, no-store'}});
 });}
