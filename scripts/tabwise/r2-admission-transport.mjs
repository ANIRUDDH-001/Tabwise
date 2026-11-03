// Transport contract for a future owner-controlled Next.js API route; no route is deployed here.
import {dirname,join} from 'node:path';
import {readFileSync} from 'node:fs';
import {createPublicKey} from 'node:crypto';
const ADMISSION_PATH='/api/r2/admission';
function ownerOrigin(origin){
 if(typeof origin!=='string'||origin.length>253)throw Error('BLOCK: reviewed owner origin required');
 let u;try{u=new URL(origin);}catch{throw Error('BLOCK: invalid owner origin');}
 // The exact origin lives in reviewed policy, never in a dispatch input or a redirect.
 if(u.protocol!=='https:'||u.origin!==origin||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash
  ||!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(u.hostname)
  ||/(?:^|\.)supabase\.(?:co|net)$/.test(u.hostname))throw Error('BLOCK: canonical HTTPS Next.js owner origin required');
 return origin;
}
export function validateAdmissionPolicy(p){
 if(!p||Object.getPrototypeOf(p)!==Object.prototype||p.schema!=='tabwise-r2-admission-policy/1'||p.enabled!==true)throw Error('BLOCK: W5 admission transport disabled');
 if(Object.keys(p).sort().join(',')!=='authority_origin,authorization_id,enabled,expires_at,receipt_public_key,schema'
  ||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(p.authorization_id??'')
  ||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(p.expires_at??'')||!Number.isFinite(Date.parse(p.expires_at))||new Date(p.expires_at).toISOString()!==p.expires_at
  ||typeof p.receipt_public_key!=='string'||p.receipt_public_key.length>1024||createPublicKey(p.receipt_public_key).asymmetricKeyType!=='ed25519')throw Error('BLOCK: W5 policy incomplete');
 ownerOrigin(p.authority_origin);return Object.freeze({...p});
}
export function loadAdmissionPolicy(){
 return validateAdmissionPolicy(JSON.parse(readFileSync(new URL('./r2-admission-policy.json',import.meta.url),'utf8')));
}
export function createRemoteTransport({origin,token,fetchImpl=globalThis.fetch}){
 const url=ownerOrigin(origin)+ADMISSION_PATH;
 if(typeof token!=='string'||!token||token.length>16384||/[\x00-\x20\x7f]/.test(token)||typeof fetchImpl!=='function')throw Error('BLOCK: W5 transport configuration missing');
 return async request=>{
  const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(request),redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});
  if(!response.ok||response.redirected||!response.body||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))throw Error('W5 authority unavailable or invalid response');
  const reader=response.body.getReader();let size=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536)throw Error('W5 response cap');chunks.push(Buffer.from(value));}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 };
}
export const admissionConsumer=env=>({run_id:env.GITHUB_RUN_ID,attempt:Number(env.GITHUB_RUN_ATTEMPT)});
export const admissionDirectory=(runDir,consumer)=>join(dirname(runDir),'diagnostics',`admission-${consumer.run_id}-1`);
export const createConfiguredTransport=(policy,env)=>createRemoteTransport({origin:validateAdmissionPolicy(policy).authority_origin,token:env.TABWISE_W5_AUTH_TOKEN});
