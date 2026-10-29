import {endpoint} from '../../../../lib/server/http';
import {requireUser,serviceClient} from '../../../../lib/server/supabase';
import {authorizeRun} from '../../../../lib/server/core.mjs';
import {reconcileLive} from '../../../../lib/server/live-reconcile';
import {reviewView} from '../../../../lib/server/run-review-view.mjs';
import {findingReferences} from '../../../../lib/server/finding-references.mjs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return endpoint(request,async()=>{
 const user=await requireUser(),db=serviceClient(),{id}=await params;
 const {data:run}=await db.from('runs').select('*').eq('id',id).maybeSingle();authorizeRun(user,run);
 const current=await reconcileLive(run!);
 const [{data:stages},{data:patches},{data:diagnostics},{data:cleanup},{data:findings,error:findingsError},{data:diagnoses,error:diagnosesError}]=await Promise.all([db.from('run_stages').select('*').eq('run_id',id),db.from('patches').select('id,status').eq('run_id',id).limit(25),db.from('artifacts').select('path').eq('run_id',id).like('path','diagnostics/%').limit(1),db.from('audit_log').select('detail').eq('subject',id).in('action',['artifact_cleanup_pending','artifact_cleanup_complete']).order('id',{ascending:false}).limit(1).maybeSingle(),db.from('findings').select('id,source,step,title,mechanism,confidence,evidence_refs').eq('run_id',id).limit(25),db.from('diagnoses').select('id,model,output').eq('run_id',id).limit(10)]);
 if(findingsError||diagnosesError)throw Error('review evidence unavailable');
 return Response.json({run_id:id,status:current.status,reason:current.reason,stages:stages??[],patches:patches??[],...reviewView(current.evidence_status,findings,diagnoses),finding_refs:current.evidence_status==='complete'?findingReferences(findings):{},diagnostic_evidence_available:Boolean(diagnostics?.length),artifact_cleanup_pending:cleanup?.detail?.artifact_cleanup_pending??current.artifact_cleanup_pending??false,gh_run_url:current.gh_run_id?`https://github.com/ANIRUDDH-001/Tabwise/actions/runs/${current.gh_run_id}`:null,evidence_status:current.evidence_status},{headers:{'Cache-Control':'private, no-store'}});
 });}
