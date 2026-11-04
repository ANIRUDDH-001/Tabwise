import {recordNativeDispatch} from './native-request.mjs';
import {matchNativeProductRun} from '../../../src/r2/product-dispatch.mjs';
import {isPreviewDeployment,assertExecutionAllowed} from '../../../src/deployment-execution.mjs';
// Missing/ambiguous state never selects a producer. No inference from status/title.
export function producerLane({run,record,error,native,nativeError}){
 if(error||nativeError||!record||record.product_run_id!==run.id||record.user_id!==run.user_id)return 'blocked';
 if(record.producer==='native-r2')return 'native-r2';
 return record.producer==='legacy'&&!native?'legacy':'blocked';
}
function dispatchBinding({configuration:c,userId,runId,requestSha256,row}){
 assertExecutionAllowed();
 if(c?.enabled!==true||c.sender_enabled!==true||c.policy?.enabled!==true||c.status?.enabled!==true||c.status.verdict!=='PASS')throw Error('native sender disabled');
 const r=row?.request,b=c.binding;
 if(!r||row.user_id!==userId||r.request_sha256!==requestSha256||r.product_run_id!==runId||r.execution_authorized!==false||r.workflow!=='.github/workflows/tabwise-r2.yml'||!b||b.purpose!=='r2-execution'||b.workflow!==r.workflow||b.revision!==r.revision||c.deployment_sha!==r.revision||b.actor!==r.actor||b.plan_sha256!==r.plan_sha256||b.reviewed_sha256!==r.r2_source_sha256||b.qualification_sha256!==r.qualification_sha256||c.status.plan_sha256!==r.plan_sha256||c.status.reviewed_sha256!==r.r2_source_sha256||c.status.qualification_sha256!==r.qualification_sha256||c.status.owner_approval_ref!==b.owner_approval_ref||c.status.review_ref!==b.review_ref||c.status.actor!==r.actor||!c.status.reviewer||c.status.reviewer===r.actor||!/^D-[0-9]+$/.test(b.owner_approval_ref)||!(Date.parse(b.expires_at)>Date.now()))throw Error('native dispatch approval/source binding');
 return {r,b};
}
export async function dispatchNativeProduct({configuration:c,userId,runId,requestSha256,store,send}){
 assertExecutionAllowed();
 if(c?.enabled!==true||c.sender_enabled!==true||c.policy?.enabled!==true||c.status?.enabled!==true||c.status.verdict!=='PASS')throw Error('native sender disabled');
 const row=await store.read(userId,runId),{r,b}=dispatchBinding({configuration:c,userId,runId,requestSha256,row});
 return recordNativeDispatch({userId,runId,requestSha256,store,send:async()=>{const intent=await store.read(userId,runId);if(c.delivery_enabled===true&&(!intent.dispatch_nonce||intent.state!=='DISPATCH_INTENT'))throw Error('persisted nonce required');return send('/actions/workflows/tabwise-r2.yml/dispatches',{ref:'main',inputs:{approved_revision:r.revision,owner_approval:b.owner_approval_ref,plan_path:r.plan_path,plan_sha256:r.plan_sha256,...(c.delivery_enabled===true?{product_bound:'true',product_run_id:runId,product_request_sha256:requestSha256,product_nonce:intent.dispatch_nonce}:{})}});}});
}
export function nativeRequestCapabilities({configuration:c,userId,run,row}){
 const denied={can_dispatch:false,can_ingest:false};
 if(isPreviewDeployment()||!row||row.user_id!==userId||run.user_id!==userId||row.product_run_id!==run.id||row.request?.product_run_id!==run.id)return denied;
 let can_dispatch=false;
 if(run.status==='admitted'&&row.state==='PREPARED')try{
  dispatchBinding({configuration:c,userId,runId:run.id,requestSha256:row.request_sha256,row});can_dispatch=true;
 }catch{}
 const can_ingest=c?.enabled===true&&c.ingestion_enabled===true&&c.policy?.enabled===true&&c.status?.enabled===true&&c.status.verdict==='PASS'&&
  row.state==='RUN_BOUND'&&['uploading','ingesting'].includes(run.status)&&/^[1-9][0-9]{0,19}$/.test(row.github_run_id??'')&&
  run.gh_run_id===row.github_run_id&&run.gh_head_sha===row.request.revision&&row.request_sha256===row.request.request_sha256;
 return {can_dispatch,can_ingest};
}

// Polling never dispatches or ingests. GitHub completion only makes evidence
// available for the separately authenticated, signed-artifact ingestion path.
export async function reconcileNativeRun(run,row,api){
 if(isPreviewDeployment()||['completed','failed','cancelled','timed_out'].includes(run.status))return run;
 if(!row||row.user_id!==run.user_id||row.product_run_id!==run.id||row.request?.product_run_id!==run.id||row.request_sha256!==row.request.request_sha256)throw Error('native progress ownership/binding mismatch');
 if(!Number.isFinite(Date.parse(run.deadline_at)))throw Error('native progress deadline missing');
 if(row.github_run_id){
  if(!['DISPATCH_ACCEPTED','RUN_BOUND'].includes(row.state)||!/^[1-9][0-9]{0,19}$/.test(row.github_run_id)||run.gh_run_id!==row.github_run_id||run.gh_head_sha!==row.request.revision)throw Error('native progress association mismatch');
 }
 if(Date.parse(run.deadline_at)<=Date.now()){
  let cancellationPending=false;
  if(row.github_run_id)try{
   const remote=await api.readRemote(row.github_run_id);
   matchNativeProductRun(row.request,{...row.request,github_run_id:row.github_run_id},remote);
   if(remote.status!=='completed')await api.cancel(row.github_run_id);
  }catch{cancellationPending=true;}
  const reason=cancellationPending?'deadline_exceeded_cancel_pending':'deadline_exceeded';
  await api.transition(run.id,run.status,'timed_out',reason);
  return {...run,status:'timed_out',reason,evidence_status:'incomplete',cancellation_pending:cancellationPending};
 }
 if(!row.github_run_id)return run; // Unknown POST outcomes never cause discovery or another send.
 if(api.claim&&await api.claim(run.id)!==true)return run;
 const remote=await api.readRemote(row.github_run_id);
 matchNativeProductRun(row.request,{...row.request,github_run_id:row.github_run_id},remote);
 if(remote.status==='completed'&&remote.conclusion!=='success'){
  const status=remote.conclusion==='cancelled'?'cancelled':'failed',reason='native_worker_'+status;
  await api.transition(run.id,run.status,status,reason);
  return {...run,status,reason,evidence_status:'incomplete'};
 }
 if(!['in_progress','completed'].includes(remote.status))return run;
 if(run.status==='dispatched'){
  await api.transition(run.id,'dispatched','running',null);run={...run,status:'running'};
 }
 if(remote.status==='completed'&&remote.conclusion==='success'){
  if(run.status==='running'){await api.transition(run.id,'running','uploading',null);run={...run,status:'uploading'};}
  return {...run,native_evidence_pending:true};
 }
 return run;
}
