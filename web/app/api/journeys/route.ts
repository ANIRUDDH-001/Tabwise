import {endpoint,body} from '../../../lib/server/http';
import {requireUser,serviceClient} from '../../../lib/server/supabase';
import {HttpError} from '../../../lib/server/core.mjs';
import {assertContract,sha256} from '../../../../packages/contracts/index.mjs';
export async function POST(request:Request){return endpoint(request,async()=>{
 const user=await requireUser(),journey=assertContract('journey',await body(request)),db=serviceClient();
 const {data:last}=await db.from('journey_versions').select('n').eq('journey_id',journey.journey_id).eq('user_id',user.id).order('n',{ascending:false}).limit(1).maybeSingle();
 const hash=sha256(JSON.stringify(journey));const {data,error}=await db.from('journey_versions').insert({journey_id:journey.journey_id,user_id:user.id,n:(last?.n??0)+1,steps:journey.steps,sha256:hash}).select('id,n,sha256').single();
 if(error)throw new HttpError(409,'version_conflict_retry_save');return Response.json(data,{status:201});
 },true);}
