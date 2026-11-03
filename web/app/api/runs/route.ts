import {endpoint,body} from '../../../lib/server/http';
import {requireUser,serviceClient} from '../../../lib/server/supabase';
import {HttpError} from '../../../lib/server/core.mjs';
import {assertContract} from '../../../../packages/contracts/index.mjs';
import {dispatchAdmitted} from '../../../lib/server/jobs.mjs';
import {github} from '../../../lib/server/github';
import {nativeRequestRoute} from '../../../lib/server/native-request-live';
export async function POST(request:Request){return endpoint(request,async()=>{
 const user=await requireUser(),input=await body(request);
 if(!input||Object.keys(input).some(k=>!['journey_version_id','patch_id'].includes(k))||typeof input.journey_version_id!=='string')throw new HttpError(400,'invalid_run_request');
 const key=request.headers.get('Idempotency-Key');if(!key||key.length>128)throw new HttpError(400,'idempotency_key_required');
 const db=serviceClient();const {data:version}=await db.from('journey_versions').select('*').eq('id',input.journey_version_id).eq('user_id',user.id).maybeSingle();if(!version)throw new HttpError(404,'journey_version_not_found');
 // No irreversible dispatch path is active before a separately recorded execution approval.
 if(!process.env.TABWISE_EXECUTION_APPROVAL_REF)throw new HttpError(503,'worker_review_and_execution_approval_pending');
 if(input.patch_id&&!process.env.TABWISE_REPAIR_EXECUTION_APPROVAL_REF)throw new HttpError(503,'repair_worker_source_binding_approval_pending');
 if(input.patch_id!==undefined&&(typeof input.patch_id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.patch_id)))throw new HttpError(400,'invalid_run_request');
 assertContract('journey',{version:'0.1.0',journey_id:version.journey_id,name:'Saved journey',steps:version.steps});
 const {data:admission,error:admissionError}=await db.rpc(input.patch_id?'admit_repair':'admit_version',{p_user:user.id,p_version:version.id,p_key:key,...(input.patch_id?{p_patch:input.patch_id}:{})});
 if(admissionError)throw new HttpError(500,'admission_failed');
 if(admission.reason)return Response.json(admission,{status:admission.http_status??429});
 const {data:run}=await db.from('runs').select('*').eq('id',admission.run_id).eq('user_id',user.id).single();
 if(!run)throw new HttpError(500,'admission_record_missing');
 if(run.journey_version_id!==version.id)throw new HttpError(409,'native_request_conflict');
 if(!input.patch_id){
  const preparation=await nativeRequestRoute(request,run.id),value=await preparation.json();
  return Response.json({...value,run_id:run.id,status:run.status},{status:preparation.ok?202:preparation.status});
 }
 const result=await dispatchAdmitted(run,{
  claim:async(id:string)=>{const {error}=await db.rpc('run_transition',{p_id:id,p_from:'admitted',p_to:'dispatching',p_reason:null});return !error;},
  saveSpec:async(id:string,hash:string)=>{const {error}=await db.from('runs').update({spec_sha256:hash}).eq('id',id).eq('status','dispatching');if(error)throw new HttpError(500,'spec_persistence_failed');},
  dispatch:async(payload:unknown)=>{await github('/actions/workflows/tabwise-run.yml/dispatches',{method:'POST',body:JSON.stringify(payload),headers:{'Content-Type':'application/json'}});},
  transition:async(id:string,from:string,to:string,reason:string|null)=>{const {error}=await db.rpc('run_transition',{p_id:id,p_from:from,p_to:to,p_reason:reason});if(error)throw new HttpError(409,'run_state_changed');},
 });
 return Response.json(result,{status:202});
 },true);}
