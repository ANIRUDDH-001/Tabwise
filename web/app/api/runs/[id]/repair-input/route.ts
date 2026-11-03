import {endpoint} from '../../../../../lib/server/http';
import {requireUser,serviceClient} from '../../../../../lib/server/supabase';
import {authorizeRun,HttpError} from '../../../../../lib/server/core.mjs';
import {consumePatchedSource} from '../../../../../../src/repair/rerun.mjs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return endpoint(request,async()=>{
 const user=await requireUser(),{id}=await params,db=serviceClient();
 const {data:run}=await db.from('runs').select('*').eq('id',id).maybeSingle();authorizeRun(user,run);
 const {data:binding}=await db.from('repair_reruns').select('*').eq('verify_run_id',id).eq('user_id',user.id).maybeSingle();
 if(!binding)throw new HttpError(404,'repair_input_unavailable');
 const {data:application}=await db.from('repair_applications').select('*').eq('id',binding.application_id).eq('user_id',user.id).maybeSingle();
 if(!application)throw new HttpError(409,'repair_input_unavailable');
 const {data:patch}=await db.from('patches').select('*').eq('id',application.patch_id).maybeSingle();
 const {data:baseline}=await db.from('runs').select('*').eq('id',binding.baseline_run_id).eq('user_id',user.id).maybeSingle();
 const bundle={application,patch,baseline,binding};
 try{consumePatchedSource({...bundle,spec:run.spec,baseSource:application.base_source});}catch{throw new HttpError(409,'repair_input_integrity_failed');}
 return Response.json(bundle,{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 });}
