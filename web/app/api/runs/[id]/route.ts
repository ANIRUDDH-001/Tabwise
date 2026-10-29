import {endpoint} from '../../../../lib/server/http';
import {requireUser,serviceClient} from '../../../../lib/server/supabase';
import {authorizeRun} from '../../../../lib/server/core.mjs';
import {reconcileLive} from '../../../../lib/server/live-reconcile';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return endpoint(request,async()=>{
 const user=await requireUser(),db=serviceClient(),{id}=await params;
 const {data:run}=await db.from('runs').select('*').eq('id',id).maybeSingle();authorizeRun(user,run);
 const current=await reconcileLive(run!);
 const [{data:stages},{data:patches},{data:diagnostics}]=await Promise.all([db.from('run_stages').select('*').eq('run_id',id),db.from('patches').select('id,status').eq('run_id',id).limit(25),db.from('artifacts').select('path').eq('run_id',id).like('path','diagnostics/%').limit(1)]);
 return Response.json({run_id:id,status:current.status,reason:current.reason,stages:stages??[],patches:patches??[],diagnostic_evidence_available:Boolean(diagnostics?.length),gh_run_url:current.gh_run_id?`https://github.com/ANIRUDDH-001/Tabwise/actions/runs/${current.gh_run_id}`:null,evidence_status:current.evidence_status},{headers:{'Cache-Control':'private, no-store'}});
 });}
