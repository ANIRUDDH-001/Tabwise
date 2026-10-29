import {endpoint} from '../../../../lib/server/http';
import {requireUser,serviceClient} from '../../../../lib/server/supabase';
import {requireOwnedRun} from '../../../../lib/server/run-record.mjs';
import {HttpError} from '../../../../lib/server/core.mjs';
import {pendingVerificationView} from '../../../../lib/server/verification-presentation.mjs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return endpoint(request,async()=>{
 const user=await requireUser(),db=serviceClient(),{id}=await params;
 const {data:value,error}=await db.from('verifications').select('id,patch_id,baseline_run_id,verify_run_id').eq('id',id).maybeSingle();if(error)throw new HttpError(503,'verification_service_unavailable');if(!value)throw new HttpError(404,'verification_not_found');
 const baseline=requireOwnedRun(user,await db.from('runs').select('id,user_id,status').eq('id',value.baseline_run_id).maybeSingle());
 const rerun=value.verify_run_id?requireOwnedRun(user,await db.from('runs').select('id,user_id,status').eq('id',value.verify_run_id).maybeSingle()):null;
 const {data:patch,error:patchError}=await db.from('patches').select('id,run_id,status').eq('id',value.patch_id).maybeSingle();if(patchError)throw new HttpError(503,'verification_service_unavailable');
 return Response.json(pendingVerificationView(value,baseline,rerun,patch),{headers:{'Cache-Control':'private, no-store'}});
 });}
