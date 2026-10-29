import {HttpError} from './core.mjs';
// Read-only record presentation while execution/verification release remains unqualified.
export function pendingVerificationView(value,baseline,rerun,patch){
 if(!value||value.baseline_run_id!==baseline?.id||value.patch_id!==patch?.id||patch.run_id!==baseline.id||value.verify_run_id&&(value.verify_run_id!==rerun?.id||rerun.id===baseline.id))throw new HttpError(409,'verification_source_mismatch');
 return {id:value.id,patch_id:patch.id,patch_status:patch.status,baseline_run_id:baseline.id,baseline_status:baseline.status,verify_run_id:rerun?.id??null,verify_status:rerun?.status??null,status:'pending',verdict:null,reason:'The qualified verification workflow has not been released. A stored prediction or decision does not establish that the journey is repaired.'};
}
