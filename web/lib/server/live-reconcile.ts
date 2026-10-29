import {github,downloadArtifact} from './github';
import {serviceClient} from './supabase';
import {HttpError,verifyWorkerIdentity} from './core.mjs';
import {reconcileRun} from './reconcile.mjs';
import {ingestArchive} from './artifact-ingest.mjs';
import {ingestDiagnosticArchive} from './diagnostic-ingest.mjs';
import {createArtifactCompensation} from './artifact-store.mjs';
type Run={id:string,status:string,deadline_at:string,created_at:string,gh_run_id:string|null,gh_head_sha:string|null,spec_sha256:string|null};
type Remote={id:number,run_attempt:number,head_sha:string,display_title:string,created_at:string,path:string,event:string,head_branch:string,actor:{login:string},status:string,conclusion:string|null};
export async function reconcileLive(run:Run){
 const db=serviceClient(),{data:flags}=await db.from('system_flags').select('*').single(),actor=process.env.GH_PAT_OWNER;
 if(!actor||!flags||flags.worker_review_verdict!=='PASS'||!process.env.TABWISE_EXECUTION_APPROVAL_REF)return run;
 const transition=async(id:string,from:string,to:string,reason:string|null)=>{const {error}=await db.rpc('run_transition',{p_id:id,p_from:from,p_to:to,p_reason:reason});if(error)throw new HttpError(409,'run_state_changed');};
 const identity=(remote:Remote)=>flags.approved_worker_shas.includes(remote.head_sha)&&verifyWorkerIdentity(remote,{run_id:run.id,spec_sha256:run.spec_sha256,runner:{actor,head_sha:remote.head_sha,github_run_id:String(remote.id)}},{actor,sha:remote.head_sha,run_id:run.id,spec_sha256:run.spec_sha256}).ok;
 const archiveFor=async(row:Run)=>{
  if(!/^\d+$/.test(row.gh_run_id??''))throw new HttpError(409,'invalid_github_run');
  const {data:remote}=await github(`/actions/runs/${row.gh_run_id}`);
  if(!identity(remote)||remote.head_sha!==row.gh_head_sha||!Number.isSafeInteger(remote.run_attempt)||remote.run_attempt<1)throw new HttpError(409,'worker_identity');
  const {data}=await github(`/actions/runs/${row.gh_run_id}/artifacts`);
  const artifacts=data.artifacts.filter((a:{name:string,expired:boolean})=>a.name===`tabwise-evidence-${row.gh_run_id}-${remote.run_attempt}`&&!a.expired);
  if(artifacts.length!==1||artifacts[0].size_in_bytes>8000000)throw new HttpError(409,'artifact_missing_or_oversized');
  return {remote,artifact:artifacts[0],archive:await downloadArtifact(String(artifacts[0].id))};
 };
 const store=async(path:string,bytes:Uint8Array,kind:string)=>{const {error}=await db.storage.from('tabwise-evidence').upload(path,bytes,{contentType:kind==='screenshot'?'image/webp':'application/json',upsert:false});if(error)throw new HttpError(500,'artifact_store_failed');};
 type Manifest={files:{path:string,sha256:string,bytes:number,kind:string}[]};
 const record=async(row:Run,manifest:Manifest)=>{const {error}=await db.from('artifacts').insert(manifest.files.map(f=>({run_id:row.id,...f})));if(error)throw new HttpError(500,'artifact_metadata_failed');};
 const compensation=(row:Run)=>createArtifactCompensation(db,row.id);
 return reconcileRun(run,{
  transition,
  claim:async(id:string)=>{const {data,error}=await db.rpc('claim_reconcile',{p_run:id});return !error&&data===true;},
  cancel:async(id:string)=>{await github(`/actions/runs/${id}/cancel`,{method:'POST'});},
  find:async(row:Run)=>{const {data}=await github('/actions/workflows/tabwise-run.yml/runs?event=workflow_dispatch&branch=main&per_page=30');return (data.workflow_runs as Remote[]).filter(r=>r.display_title===`tabwise ${row.id}`&&r.created_at>=row.created_at);},
  identity,
  saveIdentity:async(row:Run)=>{await db.from('runs').update({gh_run_id:row.gh_run_id,gh_head_sha:row.gh_head_sha}).eq('id',row.id);},
  status:async(row:Run)=>{if(!/^\d+$/.test(row.gh_run_id??''))throw new HttpError(409,'invalid_github_run');const {data,remaining}=await github(`/actions/runs/${row.gh_run_id}/jobs`);const jobs=data.jobs as {status:string,conclusion:string|null,steps:{name:string,status:string,started_at:string|null,completed_at:string|null}[]}[];return {status:jobs.length&&jobs.every(j=>j.status==='completed')?'completed':jobs.some(j=>j.status==='in_progress')?'in_progress':'queued',conclusion:jobs.every(j=>j.conclusion==='success')?'success':'failure',rate_remaining:remaining,stages:jobs.flatMap(j=>j.steps).slice(0,30)};},
  stages:async(id:string,stages:{name:string,status:string,started_at:string|null,completed_at:string|null}[])=>{if(stages.length)await db.from('run_stages').upsert(stages.map(s=>({run_id:id,stage:s.name.slice(0,120),status:s.status,started_at:s.started_at,finished_at:s.completed_at})),{onConflict:'run_id,stage'});},
  downgrade:async(reason:string)=>{await db.from('system_flags').update({dispatch_mode:'owner_only',note:reason});await db.from('audit_log').insert({actor:'reconciler',action:'automatic_downgrade',subject:run.id,detail:{reason}});},
  ingest:async(row:Run)=>{
   const {remote,artifact,archive}=await archiveFor(row);
   await ingestArchive({archive,remoteRun:remote,expected:{actor,sha:row.gh_head_sha,run_id:row.id,spec_sha256:row.spec_sha256},workerReview:flags.worker_review_verdict,store,...compensation(row),
    record:async(manifest:Manifest)=>{await record(row,manifest);const {error}=await db.from('runs').update({evidence_status:'complete'}).eq('id',row.id).eq('status','ingesting');if(error)throw new HttpError(500,'evidence_status_failed');}
   });return {complete:true,artifact_id:String(artifact.id)};
  },
  ingestPartial:async(row:Run)=>{
   const {remote,archive}=await archiveFor(row);
   return ingestDiagnosticArchive({archive,remoteRun:remote,expected:{actor,sha:row.gh_head_sha,run_id:row.id,spec_sha256:row.spec_sha256},workerReview:flags.worker_review_verdict,store,...compensation(row),record:async(manifest:Manifest)=>record(row,manifest)});
  },
  deleteArtifact:async(id:string)=>{if(!/^\d+$/.test(id))throw new HttpError(409,'invalid_artifact');await github(`/actions/artifacts/${id}`,{method:'DELETE'});},
 });
}
