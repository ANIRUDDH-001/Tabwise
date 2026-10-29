import {endpoint} from '../../../lib/server/http';
import {requireUser,serviceClient} from '../../../lib/server/supabase';
import {loadOwnedWorkspace} from '../../../lib/server/workspace-data.mjs';
import {catalogView} from '../../../lib/workspace-state.mjs';
import {HttpError} from '../../../lib/server/core.mjs';
export async function GET(request:Request){return endpoint(request,async()=>{
 const user=await requireUser(),db=serviceClient();
 const data=await loadOwnedWorkspace(user.id,async(table:string,userId:string)=>{
  const fields=table==='runs'?'id,user_id,status,evidence_status,created_at':'id,user_id,journey_id,n,sha256,created_at';
  const {data,error}=await db.from(table).select(fields).eq('user_id',userId).order('created_at',{ascending:false}).limit(25);
  if(error)throw new HttpError(503,'workspace_service_unavailable');return data??[];
 });
 const {data:catalog,error}=await db.from('journeys').select('id,app_id,name,supported').eq('app_id','fernway').limit(3);if(error)throw new HttpError(503,'workspace_service_unavailable');
 return Response.json({...data,catalog:catalogView(catalog)},{headers:{'Cache-Control':'private, no-store'}});
 });}
