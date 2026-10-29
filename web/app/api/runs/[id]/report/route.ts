import {endpoint} from '../../../../../lib/server/http';
import {requireUser,serviceClient} from '../../../../../lib/server/supabase';
import {authorizeRun,HttpError} from '../../../../../lib/server/core.mjs';
import {readRunEvidence} from '../../../../../lib/server/stored-evidence.mjs';
import {buildDiagnosticReport} from '../../../../../lib/server/diagnostic-report.mjs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return endpoint(request,async()=>{
 const user=await requireUser(),db=serviceClient(),{id}=await params;
 const {data:run,error}=await db.from('runs').select('*').eq('id',id).maybeSingle();if(error)throw new HttpError(503,'report_service_unavailable');authorizeRun(user,run);
 const results=await Promise.all([db.from('artifacts').select('path,kind,bytes,sha256').eq('run_id',id).limit(201),db.from('findings').select('id,source,step,title,mechanism,confidence,evidence_refs').eq('run_id',id).order('id').limit(25),db.from('diagnoses').select('id,model,output').eq('run_id',id).order('id').limit(10),db.from('patches').select('id,status,reviewed_at').eq('run_id',id).order('id').limit(25)]);
 if(results.some(result=>result.error))throw new HttpError(503,'report_service_unavailable');
 let stored;try{stored=await readRunEvidence({run,metadata:results[0].data,download:async(path:string)=>{const {data,error}=await db.storage.from('tabwise-evidence').download(path);if(error||!data||data.size>4000000)throw Error('artifact unavailable');return Buffer.from(await data.arrayBuffer());}});}catch{throw new HttpError(409,'report_evidence_integrity_failed');}
 if(!stored)throw new HttpError(404,'report_evidence_not_collected');
 const report=buildDiagnosticReport({run,stored,findings:results[1].data??[],diagnoses:results[2].data??[],patches:results[3].data??[]});
 return Response.json(report,{headers:{'Cache-Control':'private, no-store','Content-Disposition':`attachment; filename="${run.id}-diagnostic-${report.sha256.slice(0,12)}.json"`,'X-Content-Type-Options':'nosniff'}});
 });}
