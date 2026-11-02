import {sha256} from '../../packages/contracts/index.mjs';
import {preparePatchReview} from './review.mjs';
import {applyPatch} from './apply.mjs';
// Materialize a private immutable candidate, never overwrite the shared application.
// Persistence is one transaction: a lost response is recovered by retrying the same patch.
export async function applyApprovedRepair({rpc,context,patchSha256}){
 const {patch,userId,source}=context;
 if(patch.status!=='approved'||patch.reviewed_by!==userId)throw Error('approved owner decision required');
 const check=preparePatchReview({...context,currentBaseSha256:context.run.spec.app_hash,decision:{decision:'approved',patch_sha256:patchSha256}});
 if(!check.ok)throw Error('repair validation failed: '+check.errors.join('; '));
 const candidate=applyPatch({'index.html':source},patch.diff)['index.html'];
 const {data,error}=await rpc('materialize_repair',{p_user:userId,p_patch:patch.id,p_patch_sha:patchSha256,p_base:source,p_source:candidate,p_source_sha:sha256(candidate)});
 if(error||!data?.application_id)throw Error('repair persistence failed; retry the same patch to recover');
 return {...data,schema:'tabwise-repair-application/1',patch_sha256:patchSha256,source_sha256:sha256(candidate),dispatch:false,verdict:null};
}
