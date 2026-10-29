import {endpoint} from '../../../../../lib/server/http';
import {requireUser,serviceClient} from '../../../../../lib/server/supabase';
import {ownedJourneyVersion} from '../../../../../lib/server/journey-version.mjs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return endpoint(request,async()=>{
 const user=await requireUser(),db=serviceClient(),{id}=await params;
 const result=await db.from('journey_versions').select('id,user_id,journey_id,n,sha256,steps,created_at').eq('id',id).eq('user_id',user.id).maybeSingle();
 return Response.json(ownedJourneyVersion(user,result),{headers:{'Cache-Control':'private, no-store'}});
 });}
