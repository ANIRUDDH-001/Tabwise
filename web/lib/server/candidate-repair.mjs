import {candidateRunStore,candidateRunView} from './candidate-run.mjs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {repairContext,materializeReviewedCandidate,OWNER,BASE_SHA} from '../../../diagnostics/r2-candidate/repair.mjs';
export async function candidateRepairContext({db,userId,baselineId,sourceRoot,sourceContext}){
 const baseline=await candidateRunStore(db).read(userId,baselineId);
 if(userId!==OWNER||baseline?.state!=='EVIDENCE_READY'||baseline.repair||baseline.spec?.variant!=='broken'||baseline.spec?.app_hash!==BASE_SHA||baseline.readback?.native_interaction_pass!==true)throw Error('owned stored candidate baseline required');
 const context=sourceContext??repairContext(sourceRoot);materializeReviewedCandidate(context);return {baseline,context};
}
export async function existingCandidateRepair({db,userId,baselineId,review}){
 const {data,error}=await db.from('candidate_native_runs').select('*').eq('user_id',userId).eq('repair->>baseline_run_id',baselineId).eq('repair->>patch_sha256',review.patch_sha256).maybeSingle();
 if(error)throw Error('candidate repair recovery unavailable');
 if(data&&(data.user_id!==userId||data.repair?.baseline_run_id!==baselineId||data.repair?.patch_sha256!==review.patch_sha256||data.repair?.source_sha256!==review.source_sha256))throw Error('candidate repair recovery identity mismatch');
 return data;
}
export async function prepareOwnedCandidateRepair({db,userId,baselineId,key,sourceRoot,sourceContext,revision}){
 if(typeof key!=='string'||key.length<1||key.length>128)throw Error('candidate repair idempotency key required');
 const {context}=await candidateRepairContext({db,userId,baselineId,sourceRoot,sourceContext}),applied=materializeReviewedCandidate(context);
 const existing=await existingCandidateRepair({db,userId,baselineId,review:context.review});
 if(existing?.request||existing?.state==='EVIDENCE_READY')return candidateRunView(existing);
 if(!sourceRoot)throw Error('exact execution source package required before new repair allocation');
 const {prepareCandidateRequest,sourceDigest}=await import(/* webpackIgnore: true */ pathToFileURL(resolve(sourceRoot,'diagnostics/r2-candidate/policy.mjs')).href);
 const {data:row,error}=await db.rpc('create_candidate_repair_run',{p_user:userId,p_baseline:baselineId,p_key:key,p_review:context.review,p_source:applied.source,p_patch:context.patch});
 if(error||!row)throw Error('candidate repair persistence refused');
 if(row.request)return candidateRunView(row);
 const specText=JSON.stringify(row.spec),request=prepareCandidateRequest({userId,run:{id:row.product_run_id,user_id:userId,journey_version_id:row.journey_version_id,status:'admitted',spec:row.spec},specBytes:Buffer.from(specText),fixture:Buffer.from(applied.source),revision,sourceDigest:sourceDigest(sourceRoot),sourceRoot});
 return candidateRunView(await candidateRunStore(db).prepare(userId,row.product_run_id,request,specText));
}
