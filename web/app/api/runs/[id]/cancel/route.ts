import {endpoint} from '../../../../../lib/server/http';
import {requireUser,serviceClient} from '../../../../../lib/server/supabase';
import {authorizeRun,HttpError} from '../../../../../lib/server/core.mjs';
import {github} from '../../../../../lib/server/github';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return endpoint(request,async()=>{
 const user=await requireUser(),db=serviceClient(),{id}=await params;const {data:run}=await db.from('runs').select('*').eq('id',id).maybeSingle();authorizeRun(user,run);
 if(['completed','failed','cancelled','timed_out'].includes(run!.status))return Response.json({status:run!.status});
 if(run!.gh_run_id){if(!/^\d+$/.test(run!.gh_run_id))throw new HttpError(409,'invalid_run_identity');await github(`/actions/runs/${run!.gh_run_id}/cancel`,{method:'POST'});}
 const {error}=await db.rpc('run_transition',{p_id:id,p_from:run!.status,p_to:'cancelled',p_reason:'Owner cancellation; partial evidence retained'});if(error)throw new HttpError(409,'run_state_changed');
 return Response.json({status:'cancelled',evidence_status:'incomplete'});
 },true);}
