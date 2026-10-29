import {encodeSpec,verifyManifest,validateContract} from '../../../packages/contracts/index.mjs';
import {verifyArtifactIdentity} from './core.mjs';
export async function dispatchAdmitted(run,{claim,saveSpec,dispatch,transition}){
 const inputs=encodeSpec(run.spec);
 if(run.id!==inputs.run_id)throw Error('stored run/spec identity mismatch');
 const claimed=await claim(run.id);if(!claimed)return {run_id:run.id,status:run.status,replayed:true};
 await saveSpec(run.id,inputs.spec_sha256);
 try{
  // One POST only. A failed response can have an unknown outcome; never duplicate a VM automatically.
  await dispatch({ref:'main',inputs});
  await transition(run.id,'dispatching','dispatched',null);
  return {run_id:run.id,status:'dispatched'};
 }catch(error){await transition(run.id,'dispatching','failed','dispatch_outcome_unknown');throw error;}
}
export function prepareIngest({run,manifest,files,expected,workerReview}){
 const errors=[];
 if(workerReview!=='PASS')errors.push('worker_review_pending');
 errors.push(...verifyArtifactIdentity(run,manifest,expected).errors,...verifyManifest(manifest,files).errors);
 let evidence;
 const record=manifest.files?.find(f=>f.kind==='evidence');
 try{evidence=JSON.parse(Buffer.from(files[record?.path]).toString('utf8'));errors.push(...validateContract('evidence-bundle',evidence).errors);}catch{errors.push('invalid evidence JSON');}
 if(evidence && (evidence.provenance!=='observed-nvda'||evidence.run_id!==expected.run_id||evidence.evidence_status!=='complete'||manifest.evidence_status!=='complete'))errors.push('incomplete or non-observed evidence');
 return {ok:errors.length===0,errors,classification:errors.length?'INCONCLUSIVE':'COMPLETE_OBSERVATION',evidence:errors.length?null:evidence};
}
