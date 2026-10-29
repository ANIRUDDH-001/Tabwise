import {endpoint} from '../../../../../lib/server/http';
import {requireUser,serviceClient} from '../../../../../lib/server/supabase';
import {authorizeRun,HttpError} from '../../../../../lib/server/core.mjs';
import {readRunEvidence,screenshotBytes} from '../../../../../lib/server/stored-evidence.mjs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return endpoint(request,async()=>{
 const user=await requireUser(),db=serviceClient(),{id}=await params;
 const {data:run,error}=await db.from('runs').select('*').eq('id',id).maybeSingle();if(error)throw new HttpError(503,'evidence_service_unavailable');authorizeRun(user,run);
 const {data:metadata,error:metadataError}=await db.from('artifacts').select('path,kind,bytes,sha256').eq('run_id',id).limit(201);if(metadataError)throw new HttpError(503,'evidence_service_unavailable');
 let result;try{result=await readRunEvidence({run,metadata,download:async(path:string)=>{
  const {data,error}=await db.storage.from('tabwise-evidence').download(path);if(error||!data||data.size>4000000)throw Error('artifact unavailable');return Buffer.from(await data.arrayBuffer());
 }});}catch{throw new HttpError(409,'stored_evidence_unavailable_or_integrity_failed');}
 if(!result)throw new HttpError(404,'evidence_not_collected');
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 const asset=new URL(request.url).searchParams.get('asset');
 if(asset){try{return new Response(new Uint8Array(screenshotBytes(result,asset)),{headers:{...headers,'Content-Type':'image/webp'}});}catch{throw new HttpError(404,'screenshot_unavailable');}}
 const {files,...view}=result;return Response.json(view,{headers});
 });}
