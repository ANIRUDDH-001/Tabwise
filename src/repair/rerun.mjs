import {assertContract,sha256} from '../../packages/contracts/index.mjs';
import {verifyRepairApplication} from './verify-application.mjs';
// Pure source consumption: no execution, qualification promotion or model predictions.
// A worker must pass its existing execution gates before loading this input.
export function consumePatchedSource({spec,application,patch,baseline,binding,baseSource}){
 assertContract('run-spec',spec);
 if(!application||!patch||!baseline||!binding)throw Error('repair rerun records required');
 if(baseline.status!=='completed'||baseline.evidence_status!=='complete'||binding.user_id!==baseline.user_id)throw Error('repair rerun qualified baseline required');
 if(spec.variant!=='patched'||spec.run_id===baseline.id||patch.status!=='approved'||patch.run_id!==baseline.id||patch.reviewed_by!==baseline.user_id||application.user_id!==baseline.user_id||application.run_id!==baseline.id||application.patch_id!==patch.id||binding.verify_run_id!==spec.run_id||binding.baseline_run_id!==baseline.id||binding.application_id!==application.id||binding.source_sha256!==application.source_sha256||binding.patch_sha256!==application.patch_sha256||spec.journey_id!==baseline.journey_id||JSON.stringify(spec.steps)!==JSON.stringify(baseline.spec.steps))throw Error('repair rerun identity mismatch');
 if(spec.patch_ref!==application.patch_sha256||spec.app_hash!==application.source_sha256||sha256(application.source)!==spec.app_hash||application.base_sha256!==baseline.spec.app_hash||application.patch_sha256!==sha256(patch.diff)||patch.validator?.ok!==true||patch.validator.contract.run_id!==baseline.id||patch.validator.contract.diff!==patch.diff||patch.validator.contract.base_sha256!==application.base_sha256)throw Error('repair rerun source binding mismatch');
 const check=verifyRepairApplication({contract:patch.validator.contract,baseSource,candidateSource:application.source});
 if(!check.ok)throw Error('repair rerun exact patch refused');
 return Object.freeze({files:Object.freeze({'index.html':application.source}),source_sha256:spec.app_hash,patch_sha256:spec.patch_ref,baseline_run_id:baseline.id,application_id:application.id,qualified:false});
}
