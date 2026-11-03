// Service boundary used by the Next.js route and offline service tests. No issuance endpoint.
import {createPublicKey} from 'node:crypto';
import {canonical,validateBinding,createPostgresAuthority,publicText} from '../../../scripts/tabwise/r2-admission.mjs';
import {RETIRED_APPROVALS} from '../../../src/r2/approval-constants.mjs';
import {CallerError,verifyExecutionCaller,uniqueJson} from './r2-caller.mjs';
class Refused extends Error {constructor(status,reason){super(reason);this.status=status;this.reason=reason;}}
const reject=(status,reason)=>{throw new Refused(status,reason);};
const same=(a,b)=>canonical(a)===canonical(b);
function bindings(q,c){
 if(!q||!['consume','read'].includes(q.action)||Object.keys(q).sort().join(',')!==(q.action==='consume'?'action,binding,consumer,coordinator_key,id':'action,binding,consumer,id'))reject(400,'invalid_admission_request');
 const b=validateBinding(q.binding),s=c.status;
 if(s?.enabled!==true||s.verdict!=='PASS')reject(503,'r2_admission_disabled');
 if(!/^[a-f0-9]{40}$/.test(c.deployment_sha??'')||q.id!==c.authorization_id||b.revision!==c.deployment_sha||b.expires_at!==c.expires_at||b.purpose!=='r2-execution'||b.workflow!=='.github/workflows/tabwise-r2.yml')reject(403,'r2_binding_refused');
 if(typeof s.reviewer!=='string'||!s.reviewer||s.reviewer===s.actor||RETIRED_APPROVALS.includes(b.owner_approval_ref))reject(403,'r2_binding_refused');
 if(b.actor!==s.actor||b.owner_approval_ref!==s.owner_approval_ref||b.review_ref!==s.review_ref||!same(b.reviewed_files,c.reviewed_files)||!same(b.reviewed_files,s.reviewed_files)||b.reviewed_sha256!==c.reviewed_sha256||b.reviewed_sha256!==s.reviewed_sha256||b.qualification_sha256!==c.qualification_sha256||b.qualification_sha256!==s.qualification_sha256||b.plan_sha256!==s.plan_sha256)reject(403,'r2_binding_refused');
 if(!/^[1-9][0-9]{0,19}$/.test(q.consumer?.run_id??'')||q.consumer?.attempt!==1)reject(403,'r2_binding_refused');
 return b;
}
async function readBody(request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??'')||Number(request.headers.get('content-length')??0)>65536)reject(400,'invalid_admission_request');
 const reader=request.body?.getReader();if(!reader)reject(400,'invalid_admission_request');let n=0;const chunks=[];let timer;
 try{
  const timeout=new Promise((_,no)=>{timer=setTimeout(()=>no(Error('body deadline')),5000);});
  for(;;){const {done,value}=await Promise.race([reader.read(),timeout]);if(done)break;n+=value.length;if(n>65536)reject(413,'admission_request_too_large');chunks.push(Buffer.from(value));}
  return uniqueJson(Buffer.concat(chunks).toString('utf8'));
 }finally{clearTimeout(timer);reader.cancel().catch(()=>{});}
}
export function createAdmissionHandler({configuration,keys,client,signingKey}){
 return async request=>{
  try{
   let c;try{c=await configuration();}catch{reject(503,'r2_admission_disabled');}
   if(c?.policy?.enabled!==true||c.status?.enabled!==true||c.status?.verdict!=='PASS')reject(503,'r2_admission_disabled');
   if(request.method!=='POST')reject(405,'method_not_allowed');
   // This is a server execution endpoint, not the cookie-authenticated product UI write API.
   if(request.headers.has('origin')||request.headers.has('cookie'))reject(403,'server_execution_caller_required');
   const auth=request.headers.get('authorization');if(!auth?.startsWith('Bearer ')||auth.length>16400)reject(401,'execution_caller_refused');
   const q=await readBody(request),b=bindings(q,c);
   let jwks;try{jwks=await keys();}catch{reject(503,'execution_identity_unavailable');}
   const principal=verifyExecutionCaller(auth.slice(7),{jwks,configuration:c,binding:b,consumer:q.consumer});
   // These factories must not read authority secrets or construct a DB client before caller verification.
   let privateKey,backend;try{privateKey=await signingKey();if(publicText(createPublicKey(privateKey))!==c.receipt_public_key)throw Error('mismatch');}catch{reject(503,'receipt_key_unavailable');}
   try{backend=await client();}catch{reject(503,'admission_authority_unavailable');}
   const authority=createPostgresAuthority({client:backend,signingKey:privateKey,authenticate:async()=>principal});
   let result;try{result=await authority(q);}catch{reject(503,'admission_outcome_uncertain');}
   return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
   const status=error instanceof Refused?error.status:error instanceof CallerError?401:400;
   const reason=error instanceof Refused?error.reason:error instanceof CallerError?'execution_caller_refused':'invalid_admission_request';
   return Response.json({reason},{status,headers:{'Cache-Control':'private, no-store'}});
  }
 };
}
