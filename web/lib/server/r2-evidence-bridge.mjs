// W5 permission does not establish product-native evidence.
import {readQualifiedR2ProductEvidence,openQualifiedR2ProductEvidence} from '../../../src/r2/product-bridge.mjs';
import {validateR2ProductArtifact} from '../../../packages/contracts/r2-product.mjs';
import {authorizeRun} from './core.mjs';
import {storeArtifactSet} from './artifact-store.mjs';
export function prepareR2BridgeIngest({handle,user,run,workerReview}){
 const errors=[];let data;try{authorizeRun(user,run);if(workerReview!=='PASS')throw Error('product_worker_review_pending');data=readQualifiedR2ProductEvidence(handle);const i=data.manifest.r2_identity;
  if(run.id!==i.product_run_id||run.spec?.run_id!==run.id||run.spec?.journey_id!==i.journey_id||run.spec?.app_hash!==i.app_hash||run.spec_sha256!==i.spec_sha256||String(run.gh_run_id)!==i.github_run_id||run.gh_head_sha!==i.revision||!['ingesting','completed'].includes(run.status))throw Error('product run/source/worker binding');
  const c=validateR2ProductArtifact(data.manifest,data.files);if(!c.ok)throw Error(c.errors.join('; '));if(data.evidence.provenance!=='observed-nvda'||data.evidence.evidence_status!=='complete')throw Error('native evidence required');
 }catch(e){errors.push(e.message);}
 return {ok:errors.length===0,errors,classification:errors.length?'INCONCLUSIVE':'COMPLETE_OBSERVATION',manifest:errors.length?null:data.manifest,evidence:errors.length?null:data.evidence,files:errors.length?null:data.files};
}
export async function ingestR2Bridge({input,user,run,workerReview,store,record,cleanup,recordCleanup}){
 const h=openQualifiedR2ProductEvidence(input),c=prepareR2BridgeIngest({handle:h,user,run,workerReview});if(!c.ok)throw Error('R2 product ingestion refused: '+c.errors.join('; '));
 await storeArtifactSet({prefix:run.id,manifestBytes:Buffer.from(JSON.stringify(c.manifest)),manifest:c.manifest,files:c.files,store,record:()=>record(c.manifest),cleanup,recordCleanup});return {complete:true,manifest:c.manifest,evidence:c.evidence};
}
