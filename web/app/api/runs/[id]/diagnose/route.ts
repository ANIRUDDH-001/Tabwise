import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readFile} from 'node:fs/promises';
import {endpoint} from '../../../../../lib/server/http';
import {requireUser,requireOperator,serviceClient} from '../../../../../lib/server/supabase';
import {authorizeRun,createHostedBroker,HttpError} from '../../../../../lib/server/core.mjs';
import {assertContract,sha256} from '../../../../../../packages/contracts/index.mjs';
import {diagnose,DIAGNOSIS_PROMPT} from '../../../../../../src/meta/diagnosis.mjs';
import {diagnosisInput} from '../../../../../../src/meta/input.mjs';
import {readRunEvidence} from '../../../../../lib/server/stored-evidence.mjs';
import {persistValidatedDiagnosis} from '../../../../../../src/repair/persistence.mjs';
import {assertExecutionAllowed} from '../../../../../../src/deployment-execution.mjs';
export const maxDuration=150;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return endpoint(request,async()=>{
 assertExecutionAllowed();
 const user=await requireUser(),db=serviceClient(),{id}=await params;const {data:run}=await db.from('runs').select('*').eq('id',id).maybeSingle();authorizeRun(user,run);
 const {data:flags}=await db.from('system_flags').select('*').single();
 if(!flags||flags.diagnosis_mode==='off')throw new HttpError(403,'diagnosis_off');
 if(flags.diagnosis_mode==='owner')await requireOperator(user.id);
 if(!flags.qualification_ref||!process.env.TABWISE_META_APPROVAL_REF)throw new HttpError(403,'probe_and_allocation_approval_required');
 if(run!.status!=='completed'||run!.evidence_status!=='complete')throw new HttpError(409,'qualified_evidence_required');
 const {data:metadata,error:metadataError}=await db.from('artifacts').select('path,kind,bytes,sha256').eq('run_id',id).limit(201);
 if(metadataError)throw new HttpError(503,'evidence_service_unavailable');
 let stored;try{stored=await readRunEvidence({run,metadata,download:async(path:string)=>{
  const {data,error}=await db.storage.from('tabwise-evidence').download(path);
  if(error||!data||data.size>4000000)throw Error('artifact unavailable');
  return Buffer.from(await data.arrayBuffer());
 }});}catch{throw new HttpError(409,'stored_evidence_unavailable_or_integrity_failed');}
 if(!stored?.complete)throw new HttpError(409,'qualified_evidence_required');
 const source=(await readFile(join(process.cwd(),'../fixtures/fernway/index.html'),'utf8')).replace(/\r\n/g,'\n');
 if(sha256(source)!==run!.spec?.app_hash)throw new HttpError(409,'matching_run_source_required');
 const input=diagnosisInput({run,evidence:stored.evidence,source});
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
