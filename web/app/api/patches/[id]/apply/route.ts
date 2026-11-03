import {endpoint,body} from '../../../../../lib/server/http';
import {requireUser} from '../../../../../lib/server/supabase';
import {HttpError} from '../../../../../lib/server/core.mjs';
import {ownedPatchReview} from '../../../../../lib/server/patch-review';
import {applyApprovedRepair} from '../../../../../../src/repair/application.mjs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return endpoint(request,async()=>{
 const user=await requireUser(),{id}=await params,input=await body(request,2000);
 if(!input||Object.keys(input).join(',')!=='patch_sha256'||typeof input.patch_sha256!=='string')throw new HttpError(400,'invalid_application_request');
 const {db,context}=await ownedPatchReview(id,user.id);
 const {data:saved,error:readError}=await db.from('repair_applications').select('id,patch_sha256,source_sha256').eq('patch_id',id).eq('user_id',user.id).maybeSingle();
 if(readError)throw new HttpError(503,'repair_application_status_unavailable');
 if(saved){if(saved.patch_sha256!==input.patch_sha256)throw new HttpError(409,'repair_application_digest_conflict');return Response.json({schema:'tabwise-repair-application/1',application_id:saved.id,status:'materialized',patch_sha256:saved.patch_sha256,source_sha256:saved.source_sha256,replayed:true,dispatch:false,verdict:null},{headers:{'Cache-Control':'private, no-store'}});}

 try{return Response.json(await applyApprovedRepair({context,patchSha256:input.patch_sha256,rpc:async(name:string,args:Record<string,unknown>)=>db.rpc(name,args)}),{headers:{'Cache-Control':'private, no-store'}});}catch{throw new HttpError(409,'repair_application_failed_retry_same_patch');}
 },true);}
