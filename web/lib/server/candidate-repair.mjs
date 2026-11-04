import {candidateRunStore,candidateRunView} from './candidate-run.mjs';
import {prepareCandidateRequest,sourceDigest} from '../../../diagnostics/r2-candidate/policy.mjs';
import {repairContext,materializeReviewedCandidate,OWNER,BASE_SHA} from '../../../diagnostics/r2-candidate/repair.mjs';
export async function candidateRepairContext({db,userId,baselineId,sourceRoot}){
 const baseline=await candidateRunStore(db).read(userId,baselineId);
 if(userId!==OWNER||baseline?.state!=='EVIDENCE_READY'||baseline.repair||baseline.spec?.variant!=='broken'||baseline.spec?.app_hash!==BASE_SHA||baseline.readback?.native_interaction_pass!==true)throw Error('owned stored candidate baseline required');
 return {baseline,context:repairContext(sourceRoot)};
}
export async function prepareOwnedCandidateRepair({db,userId,baselineId,key,sourceRoot,revision}){
 if(typeof key!=='string'||key.length<1||key.length>128)throw Error('candidate repair idempotency key required');
 const {context}=await candidateRepairContext({db,userId,baselineId,sourceRoot}),applied=materializeReviewedCandidate(context);
 const {data:row,error}=await db.rpc('create_candidate_repair_run',{p_user:userId,p_baseline:baselineId,p_key:key,p_review:context.review,p_source:applied.source,p_patch:context.patch});
 if(error||!row)throw Error('candidate repair persistence refused');
 if(row.request)return candidateRunView(row);
 const specText=JSON.stringify(row.spec),request=prepareCandidateRequest({userId,run:{id:row.product_run_id,user_id:userId,journey_version_id:row.journey_version_id,status:'admitted',spec:row.spec},specBytes:Buffer.from(specText),fixture:Buffer.from(applied.source),revision,sourceDigest:sourceDigest(sourceRoot),sourceRoot});
 return candidateRunView(await candidateRunStore(db).prepare(userId,row.product_run_id,request,specText));
}
