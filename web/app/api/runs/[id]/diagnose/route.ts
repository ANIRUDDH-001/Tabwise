import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readFile} from 'node:fs/promises';
import {endpoint} from '../../../../../lib/server/http';
import {requireUser,requireOperator,serviceClient} from '../../../../../lib/server/supabase';
import {authorizeRun,createHostedBroker,HttpError} from '../../../../../lib/server/core.mjs';
import {assertContract,sha256} from '../../../../../../packages/contracts/index.mjs';
import {diagnose,DIAGNOSIS_PROMPT} from '../../../../../../src/meta/diagnosis.mjs';
import {persistValidatedDiagnosis} from '../../../../../../src/repair/persistence.mjs';
export const maxDuration=150;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return endpoint(request,async()=>{
 const user=await requireUser(),db=serviceClient(),{id}=await params;const {data:run}=await db.from('runs').select('*').eq('id',id).maybeSingle();authorizeRun(user,run);
 const {data:flags}=await db.from('system_flags').select('*').single();
 if(!flags||flags.diagnosis_mode==='off')throw new HttpError(403,'diagnosis_off');
 if(flags.diagnosis_mode==='owner')await requireOperator(user.id);
 if(!flags.qualification_ref||!process.env.TABWISE_META_APPROVAL_REF)throw new HttpError(403,'probe_and_allocation_approval_required');
 if(run!.status!=='completed'||run!.evidence_status!=='complete')throw new HttpError(409,'qualified_evidence_required');
 const {data:blob,error:downloadError}=await db.storage.from('tabwise-evidence').download(`${id}/evidence.json`);
 if(downloadError||!blob||blob.size>4000000)throw new HttpError(409,'evidence_unavailable');
 const evidence=assertContract('evidence-bundle',JSON.parse(await blob.text()));
 if(evidence.provenance!=='observed-nvda'||evidence.evidence_status!=='complete'||evidence.run_id!==id)throw new HttpError(409,'qualified_evidence_required');
 const source=(await readFile(join(process.cwd(),'../fixtures/fernway/index.html'),'utf8')).replace(/\r\n/g,'\n');
 if(sha256(source)!==run!.spec?.app_hash)throw new HttpError(409,'matching_run_source_required');
 const timeline=Object.values(evidence.lanes).flat() as {evidence_ref:string}[];
 const input={version:'0.1.0',run_id:id,journey:run!.spec?.steps,evidence_refs:timeline.map(e=>e.evidence_ref),timeline,signals:[],axe:{violations:evidence.axe.reduce((sum:number,a:{violations:number})=>sum+a.violations,0),rules_checked:0},source:[{path:'index.html',sha256:sha256(source),lines:source.split('\n').map((text,n)=>({n:n+1,text}))}]};
 assertContract('diagnosis-input',input);
 const inputHash=sha256(JSON.stringify(input)),promptHash=sha256(DIAGNOSIS_PROMPT);
 const {data:cached}=await db.from('diagnoses').select('*').eq('run_id',id).eq('input_sha256',inputHash).eq('prompt_sha256',promptHash).eq('model','muse-spark-1.3').maybeSingle();
 if(cached)return Response.json({diagnosis_id:cached.id,...cached.output,model:cached.model,cached:true},{headers:{'Cache-Control':'private, no-store'}});
 const broker=createHostedBroker(async(name:string,args:Record<string,unknown>)=>{
  if(name==='reserve_hosted')return await db.rpc('reserve_diagnosis',{p_user:user.id,p_run:id,p_worst:args.p_worst});
  return await db.rpc(name,args);
 });
 const result=await diagnose({input,broker,apiKey:process.env.MODEL_API_KEY,logDir:join(tmpdir(),'tabwise-payloads'),fetchImpl:undefined});
 const saved=await persistValidatedDiagnosis({rpc:async(name:string,args:Record<string,unknown>)=>db.rpc(name,args),userId:user.id,run,input,result,source});
 return Response.json({...saved,...result.output,model:result.model,usage:result.usage,cost:result.cost_usd,validation_errors:result.validation_errors},{headers:{'Cache-Control':'private, no-store'}});
 },true);}
