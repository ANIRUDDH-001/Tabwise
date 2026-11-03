import {recordNativeDispatch} from './native-request.mjs';
// Missing/ambiguous state never selects a producer. No inference from status/title.
export function producerLane({run,record,error,native,nativeError}){
 if(error||nativeError||!record||record.product_run_id!==run.id||record.user_id!==run.user_id)return 'blocked';
 if(record.producer==='native-r2')return 'native-r2';
 return record.producer==='legacy'&&!native?'legacy':'blocked';
}
export async function dispatchNativeProduct({configuration:c,userId,runId,requestSha256,store,send}){
 if(c?.enabled!==true||c.sender_enabled!==true||c.policy?.enabled!==true||c.status?.enabled!==true||c.status.verdict!=='PASS')throw Error('native sender disabled');
 const row=await store.read(userId,runId),r=row?.request,b=c.binding;
 if(!r||row.user_id!==userId||r.request_sha256!==requestSha256||r.product_run_id!==runId||r.execution_authorized!==false||r.workflow!=='.github/workflows/tabwise-r2.yml'||!b||b.purpose!=='r2-execution'||b.workflow!==r.workflow||b.revision!==r.revision||c.deployment_sha!==r.revision||b.actor!==r.actor||b.plan_sha256!==r.plan_sha256||b.reviewed_sha256!==r.r2_source_sha256||b.qualification_sha256!==r.qualification_sha256||c.status.plan_sha256!==r.plan_sha256||c.status.reviewed_sha256!==r.r2_source_sha256||c.status.qualification_sha256!==r.qualification_sha256||c.status.owner_approval_ref!==b.owner_approval_ref||c.status.review_ref!==b.review_ref||c.status.actor!==r.actor||!c.status.reviewer||c.status.reviewer===r.actor||!/^D-[0-9]+$/.test(b.owner_approval_ref)||!(Date.parse(b.expires_at)>Date.now()))throw Error('native dispatch approval/source binding');
 return recordNativeDispatch({userId,runId,requestSha256,store,send:()=>send('/actions/workflows/tabwise-r2.yml/dispatches',{ref:'main',inputs:{approved_revision:r.revision,owner_approval:b.owner_approval_ref,plan_path:r.plan_path,plan_sha256:r.plan_sha256}})});
}
