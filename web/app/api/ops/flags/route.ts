import {endpoint,body} from '../../../../lib/server/http';
import {requireUser,requireOperator,serviceClient} from '../../../../lib/server/supabase';
import {HttpError} from '../../../../lib/server/core.mjs';
export async function POST(request:Request){return endpoint(request,async()=>{
 const user=await requireUser();await requireOperator(user.id);const input=await body(request,1000);
 if(input?.action==='limits'){
  if(Object.keys(input).some(k=>!['action','public_daily_dispatch_limit'].includes(k))||!Number.isInteger(input.public_daily_dispatch_limit)||input.public_daily_dispatch_limit<0||input.public_daily_dispatch_limit>5)throw new HttpError(400,'invalid_daily_limit');
  const db=serviceClient(),{error}=await db.from('system_flags').update({public_daily_dispatch_limit:input.public_daily_dispatch_limit});if(error)throw new HttpError(500,'limit_update_failed');
  await db.from('audit_log').insert({actor:user.id,action:'daily_limit',detail:{public_daily_dispatch_limit:input.public_daily_dispatch_limit}});return Response.json({public_daily_dispatch_limit:input.public_daily_dispatch_limit});
 }
 if(input?.action!=='kill_switch'||Object.keys(input).some(k=>!['action','reason'].includes(k)))throw new HttpError(400,'mode_activation_requires_recorded_approval');
 const db=serviceClient(),{error}=await db.rpc('kill_switch',{p_reason:typeof input.reason==='string'?input.reason.slice(0,500):'Owner kill switch'});
 if(error)throw new HttpError(500,'kill_switch_failed');return Response.json({dispatch_mode:'off',diagnosis_mode:'off'});
 },true);}
