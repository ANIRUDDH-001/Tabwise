import {sha256} from '../../packages/contracts/index.mjs';
// Explicit owner input only. A saved check is neither dispatch authority nor an observed result.
export function prepareOracleRegistration({userId,run,patch,finding,input}){
 if(!userId||run?.user_id!==userId||patch?.run_id!==run?.id||patch.status!=='approved'||patch.reviewed_by!==userId||run.status!=='completed'||run.evidence_status!=='complete')throw Error('owned approved baseline required');
 if(!input||Object.keys(input).sort().join(',')!=='base_sha256,kind,patch_sha256,review_ref,step'||!['focus','validation','status'].includes(input.kind)||input.step!==finding?.step||!Number.isSafeInteger(input.step)||input.step<1||input.step>25||typeof input.review_ref!=='string'||!input.review_ref.trim()||input.review_ref.length>512||input.review_ref!==input.review_ref.trim()||input.base_sha256!==run.spec?.app_hash||input.patch_sha256!==sha256(patch.diff))throw Error('explicit source-bound check required');
 return {p_user:userId,p_patch:patch.id,p_kind:input.kind,p_step:input.step,p_review_ref:input.review_ref};
}
