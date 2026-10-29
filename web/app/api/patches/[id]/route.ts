import {endpoint,body} from '../../../../lib/server/http';
import {requireUser} from '../../../../lib/server/supabase';
import {HttpError} from '../../../../lib/server/core.mjs';
import {ownedPatchReview} from '../../../../lib/server/patch-review';
import {preparePatchReview} from '../../../../../src/repair/review.mjs';

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return endpoint(request,async()=>{
 const user=await requireUser(),{id}=await params,{context,finding,check}=await ownedPatchReview(id,user.id),patch=context.patch;
 return Response.json({patch_id:patch.id,run_id:patch.run_id,status:patch.status,diff:patch.diff,files:patch.files,finding,rationale:patch.validator.contract?.rationale,expected_speech_after:patch.validator.contract?.expected_speech_after??[],base_sha256:patch.validator.contract?.base_sha256,patch_sha256:patch.validator.contract?.patch_sha256,reviewed_at:patch.reviewed_at,validation:{ok:check.ok,errors:check.errors},dispatch:false,verdict:null},{headers:{'Cache-Control':'private, no-store'}});
 });}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return endpoint(request,async()=>{
 const user=await requireUser(),{id}=await params,decision=await body(request,2000),{db,context}=await ownedPatchReview(id,user.id);
 const checked=preparePatchReview({...context,decision});if(!checked.ok)throw new HttpError(409,'patch_review_validation_failed');
 const {data,error}=await db.rpc('review_patch',{p_user:user.id,p_patch:id,p_decision:checked.decision,p_patch_sha:checked.patch_sha256});
 if(error||!data)throw new HttpError(409,'patch_review_conflict');
 return Response.json(data,{headers:{'Cache-Control':'private, no-store'}});
 },true);}
