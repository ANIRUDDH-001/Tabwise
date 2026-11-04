// W5 request admission issuer. Production wiring remains disabled pending independent review.
import {createPublicKey,sign} from 'node:crypto';
import {verifyReceipt,canonical,publicText} from '../../../scripts/tabwise/r2-admission.mjs';
import {validateProductDelivery} from '../../../src/r2/product-delivery.mjs';
import {verifyExecutionCaller} from './r2-caller.mjs';
import {parseUniqueJson} from '../../../src/r2/strict-json.mjs';
import {assertExecutionAllowed} from '../../../src/deployment-execution.mjs';

export function issueNativePlanAdmission({row,principal,authority,receipt,signingKey}){
 const fail=()=>{throw Error('native request admission refused');};
 const delivery=validateProductDelivery(row),r=delivery.request;
 if(row.state!=='RUN_BOUND'||row.user_id!==r.user_id||row.product_run_id!==r.product_run_id||row.request_sha256!==r.request_sha256||row.github_run_id!==principal?.run_id)fail();
 const consumed=verifyReceipt(receipt,authority),b=consumed.binding;
 if(principal.repository!==b.repository||principal.workflow!==b.workflow||principal.revision!==b.revision||principal.actor!==b.actor||principal.attempt!==1||principal.run_id!==consumed.consumer.run_id||consumed.consumer.attempt!==1)fail();
 if(b.purpose!=='r2-execution'||b.workflow!==r.workflow||b.revision!==r.revision||b.actor!==r.actor||b.reviewed_sha256!==r.r2_source_sha256||b.qualification_sha256!==r.qualification_sha256||b.plan_sha256!==r.plan_sha256||canonical(b.fixtures)!==canonical([{id:r.page_id,sha256:r.fixture_sha256}]))fail();
 if(signingKey?.type!=='private'||signingKey.asymmetricKeyType!=='ed25519'||publicText(createPublicKey(signingKey))!==authority.publicKey)fail();
 const payload={schema:'tabwise-native-plan-admission/1',request_sha256:r.request_sha256,product_run_id:r.product_run_id,github_run_id:principal.run_id,consumption_id:consumed.consumption_id,plan_bytes_sha256:r.plan_bytes_sha256,fixture_sha256:r.fixture_sha256};
 return {payload,signature:sign(null,Buffer.from(canonical(payload)),signingKey).toString('base64')};
}

// Read-only extension of the existing W5 receipt: no consume, retry, grant or new authority.
export function createNativePlanAdmissionHandler({configuration,keys,client,signingKey}){
 return async request=>{
  const reply=(status,reason)=>Response.json({reason},{status,headers:{'Cache-Control':'private, no-store'}});
  let c;try{c=await configuration();}catch{return reply(503,'native_admission_disabled');}
  if(c?.enabled!==true||c.policy?.enabled!==true||c.status?.enabled!==true||c.status.verdict!=='PASS')return reply(503,'native_admission_disabled');
  try{assertExecutionAllowed();}catch{return reply(503,'native_admission_disabled');}
  if(request.method!=='POST'||request.headers.has('origin')||request.headers.has('cookie'))return reply(403,'server_execution_caller_required');
  const auth=request.headers.get('authorization');if(!auth?.startsWith('Bearer ')||auth.length>16400)return reply(401,'execution_caller_refused');
  let q;
  try{
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??'')||Number(request.headers.get('content-length')??0)>65536||!request.body)throw Error('body');
   const reader=request.body.getReader(),chunks=[];let size=0,timer;
   try{const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('deadline')),5000);});for(;;){const v=await Promise.race([reader.read(),deadline]);if(v.done)break;size+=v.value.length;if(size>65536)throw Error('cap');chunks.push(Buffer.from(v.value));}}finally{clearTimeout(timer);reader.cancel().catch(()=>{});}
   q=parseUniqueJson(Buffer.concat(chunks).toString('utf8'));
   if(!q||Object.keys(q).sort().join(',')!=='github_run_id,product_run_id,receipt,request_sha256'||!/^[a-f0-9-]{36}$/.test(q.product_run_id??'')||!/^[a-f0-9]{64}$/.test(q.request_sha256??'')||!/^[1-9][0-9]{0,19}$/.test(q.github_run_id??''))throw Error('shape');
  }catch{return reply(400,'invalid_admission_request');}
  let principal;
  try{principal=verifyExecutionCaller(auth.slice(7),{jwks:await keys(),configuration:c,binding:c.binding,consumer:{run_id:q.github_run_id,attempt:1}});}catch{return reply(403,'execution_caller_refused');}
  try{
   const store=await client(),row=await store.load(q.product_run_id);
   if(!row||row.product_run_id!==q.product_run_id||row.request_sha256!==q.request_sha256)return reply(409,'native_admission_conflict');
   const authority={id:c.authorization_id,binding:c.binding,consumer:{run_id:principal.run_id,attempt:1},publicKey:c.receipt_public_key};
   const key=await signingKey();
   const request_receipt=issueNativePlanAdmission({row,principal,authority,receipt:q.receipt,signingKey:key});
   return Response.json({request_receipt,input_authorized:false,native_qualified:false},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return reply(409,'native_admission_conflict');}
 };
}
