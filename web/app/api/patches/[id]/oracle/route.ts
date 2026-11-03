import {endpoint,body} from '../../../../../lib/server/http';
import {requireUser} from '../../../../../lib/server/supabase';
import {HttpError} from '../../../../../lib/server/core.mjs';
import {ownedPatchReview} from '../../../../../lib/server/patch-review';
import {prepareOracleRegistration} from '../../../../../../src/repair/oracle.mjs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return endpoint(request,async()=>{
 const user=await requireUser(),{id}=await params,input=await body(request,2000),{db,context,finding,check}=await ownedPatchReview(id,user.id);
 if(!check.ok)throw new HttpError(409,'patch_review_validation_failed');
 let args;try{args=prepareOracleRegistration({...context,finding,input});}catch{throw new HttpError(409,'explicit_oracle_review_required');}
 const {data,error}=await db.rpc('register_repair_oracle',args);
 if(error||!data)throw new HttpError(409,'oracle_registration_refused');
 return Response.json({oracle:data,dispatch:false,verdict:null},{headers:{'Cache-Control':'private, no-store'}});
 },true);}
