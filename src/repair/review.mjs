import {sha256,validateContract} from '../../packages/contracts/index.mjs';
import {validatePatchProposal} from './patch.mjs';

// A saved human decision is not permission to dispatch and never establishes a verdict.
export function preparePatchReview({userId,run,patch,source,currentBaseSha256,knownEvidenceRefs,decision}){
 const errors=[];
 if(!userId||run?.user_id!==userId||patch?.run_id!==run?.id)errors.push('patch_not_found');
 if(run?.status!=='completed'||run?.evidence_status!=='complete')errors.push('qualified_baseline_required');
 if(!decision||Object.keys(decision).sort().join(',')!=='decision,patch_sha256'||!['approved','rejected'].includes(decision.decision))errors.push('invalid_review_decision');
 const contract=patch?.validator?.contract;
 if(patch?.validator?.ok!==true||!validateContract('patch',contract).ok||contract?.run_id!==run?.id||contract?.diff!==patch?.diff||sha256(patch?.diff??'')!==contract?.patch_sha256||decision?.patch_sha256!==contract?.patch_sha256)errors.push('patch_integrity');
 if(contract?.base_sha256!==run?.spec?.app_hash||currentBaseSha256!==run?.spec?.app_hash)errors.push('stale_patch_source');
 if(!errors.length){
  const checked=validatePatchProposal({runId:run.id,source,baseSha256:run.spec.app_hash,evidenceRefs:contract.evidence_refs,knownEvidenceRefs,proposal:{diff:patch.diff,rationale:contract.rationale,expected_speech_after:contract.expected_speech_after}});
  if(!checked.ok)errors.push(...checked.errors);
 }
 return {ok:errors.length===0,errors,decision:errors.length?null:decision.decision,patch_sha256:errors.length?null:contract.patch_sha256,dispatch:false,verdict:null};
}
