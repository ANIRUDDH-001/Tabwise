import {endpoint} from '../../../../lib/server/http';
import {requireUser,requireOperator,serviceClient} from '../../../../lib/server/supabase';
export async function GET(request:Request){return endpoint(request,async()=>{
 const user=await requireUser();await requireOperator(user.id);const db=serviceClient();
 const [flags,budget,capacity]=await Promise.all([db.from('system_flags').select('*').single(),db.from('hosted_budget').select('*').single(),db.from('capacity_snapshots').select('*').order('at',{ascending:false}).limit(1).maybeSingle()]);
 return Response.json({flags:flags.data,budget:budget.data,capacity:capacity.data},{headers:{'Cache-Control':'private, no-store'}});
 });}
