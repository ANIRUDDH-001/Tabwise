import {endpoint,body as readBody} from '../../../../lib/server/http';
import {requireUser,serviceClient} from '../../../../lib/server/supabase';
import {requireOwnedRun} from '../../../../lib/server/run-record.mjs';
import {HttpError} from '../../../../lib/server/core.mjs';
import {pendingVerificationView} from '../../../../lib/server/verification-presentation.mjs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return endpoint(request,async()=>{
 const user=await requireUser(),db=serviceClient(),{id}=await params;
 const {data:value,error}=await db.from('verifications').select('id,patch_id,baseline_run_id,verify_run_id,verdict').eq('id',id).maybeSingle();if(error)throw new HttpError(503,'verification_service_unavailable');if(!value)throw new HttpError(404,'verification_not_found');
 const baseline=requireOwnedRun(user,await db.from('runs').select('id,user_id,status').eq('id',value.baseline_run_id).maybeSingle());
 const rerun=value.verify_run_id?requireOwnedRun(user,await db.from('runs').select('id,user_id,status').eq('id',value.verify_run_id).maybeSingle()):null;
 const {data:patch,error:patchError}=await db.from('patches').select('id,run_id,status').eq('id',value.patch_id).maybeSingle();if(patchError)throw new HttpError(503,'verification_service_unavailable');
 if(value.verdict!==null&&rerun){
  const {data:stored,error:resultError}=await db.from('repair_verdicts').select('result').eq('verify_run_id',rerun.id).eq('user_id',user.id).maybeSingle();
  if(resultError)throw new HttpError(503,'repair_verdict_service_unavailable');
  if(stored)return Response.json({...pendingVerificationView(value,baseline,rerun,patch),status:'recorded',reason:'Stored MACHINE/L3 symptom check; withheld-task acceptance requires independent review.',result:stored.result},{headers:{'Cache-Control':'private, no-store'}});
 }
 return Response.json(pendingVerificationView(value,baseline,rerun,patch),{headers:{'Cache-Control':'private, no-store'}});
 });}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return endpoint(request,async()=>{
 const user=await requireUser(),db=serviceClient(),{id}=await params;
 const {data:value,error}=await db.from('verifications').select('*').eq('id',id).maybeSingle();
 if(error)throw new HttpError(503,'verification_service_unavailable');if(!value)throw new HttpError(404,'verification_not_found');
 const owned=async(runId:string)=>requireOwnedRun(user,await db.from('runs').select('*').eq('id',runId).maybeSingle());
 const baseline=await owned(value.baseline_run_id),run=await owned(value.verify_run_id);
 const one=async(table:string,key:string,id:string)=>{const {data,error}=await db.from(table).select('*').eq(key,id).single();if(error||!data)throw new HttpError(409,'repair_record_unavailable');return data;};
 const binding=await one('repair_reruns','verify_run_id',run.id),application=await one('repair_applications','id',binding.application_id),patch=await one('patches','id',value.patch_id),finding=await one('findings','id',patch.finding_id);
 const body=await readBody(request,2000);
 if(body.action==='register_oracle'){
  if(!['validation','status','focus'].includes(body.kind)||!Number.isSafeInteger(body.step)||typeof body.review_ref!=='string'||!body.review_ref.trim())throw new HttpError(400,'explicit_oracle_review_required');
  const {data,error}=await db.rpc('register_repair_oracle',{p_user:user.id,p_patch:patch.id,p_kind:body.kind,p_step:body.step,p_review_ref:body.review_ref});
  if(error)throw new HttpError(409,'oracle_registration_refused');return Response.json({oracle:data},{headers:{'Cache-Control':'private, no-store'}});
 }
 const oracle=await one('repair_oracles','patch_id',patch.id);
 if(application.patch_id!==patch.id)throw new HttpError(409,'repair_patch_mismatch');
 const metadata=async(runId:string)=>{const {data,error}=await db.from('artifacts').select('path,kind,bytes,sha256').eq('run_id',runId).limit(201);if(error)throw new HttpError(503,'evidence_service_unavailable');return data;};
 const {recomputeStoredRepair}=await import('../../../../lib/server/repair-verdict.mjs');
 const result=await recomputeStoredRepair({userId:user.id,run,bundle:{baseline,binding,application,patch},finding,oracle,baselineMetadata:await metadata(baseline.id),rerunMetadata:await metadata(run.id),download:async(_runId:string,path:string)=>{
  const {data,error}=await db.storage.from('tabwise-evidence').download(path);if(error||!data||data.size>4000000)throw new HttpError(409,'repair_evidence_unavailable');return Buffer.from(await data.arrayBuffer());
 }});
 const {data:saved,error:saveError}=await db.rpc('persist_repair_verdict',{p_user:user.id,p_run:run.id,p_result:result});
 if(saveError)throw new HttpError(409,'repair_verdict_persistence_refused');
 return Response.json({...saved,result},{headers:{'Cache-Control':'private, no-store'}});
 },true);}
