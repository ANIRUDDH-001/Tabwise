// GitHub Actions RS256 OIDC caller verifier. Never accepts identity from HTTP/body headers.
import {createPublicKey,verify} from 'node:crypto';
export class CallerError extends Error {}
const deny=()=>{throw new CallerError('execution_caller_refused');};
import {parseUniqueJson as uniqueJson} from '../../../src/r2/strict-json.mjs';
export {uniqueJson};
function decode(part){if(typeof part!=='string'||!/^[A-Za-z0-9_-]+$/.test(part))deny();const b=Buffer.from(part,'base64url');if(b.toString('base64url')!==part)deny();return b;}
export function verifyExecutionCaller(token,{jwks,configuration:c,binding:b,consumer,now=Date.now()}){
 try{
  if(typeof token!=='string'||token.length>16384)deny();const parts=token.split('.');if(parts.length!==3)deny();
  const h=uniqueJson(decode(parts[0]).toString('utf8')),p=uniqueJson(decode(parts[1]).toString('utf8'));
  if(!h||Object.keys(h).sort().join(',')!=='alg,kid,typ'||h.alg!=='RS256'||h.typ!=='JWT'||typeof h.kid!=='string'||!h.kid||h.kid.length>128)deny();
  if(!Array.isArray(jwks?.keys)||jwks.keys.length>32)deny();const found=jwks.keys.filter(k=>k.kid===h.kid);if(found.length!==1)deny();const j=found[0];
  if(j.kty!=='RSA'||j.alg!=='RS256'||j.use!=='sig'||'d' in j)deny();const key=createPublicKey({key:{kty:j.kty,n:j.n,e:j.e},format:'jwk'}),bits=key.asymmetricKeyDetails?.modulusLength;
  if(!bits||bits<2048||bits>4096||!verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),key,decode(parts[2])))deny();
  const t=Math.floor(now/1000);if(![p.iat,p.nbf,p.exp].every(Number.isSafeInteger)||p.iat>t||p.nbf>t||p.exp<=t||p.exp<=p.iat||p.exp-p.iat>600||typeof p.jti!=='string'||!p.jti||p.jti.length>256)deny();
  const policy=c.policy;
  if(policy?.enabled!==true||!['repository_id','owner_id','actor_id'].every(k=>/^[1-9][0-9]{0,19}$/.test(policy[k]??''))||typeof policy.subject!=='string'||!policy.subject||policy.subject.length>512)deny();
  const expected={iss:'https://token.actions.githubusercontent.com',aud:c.audience,sub:policy.subject,repository:'ANIRUDDH-001/Tabwise',repository_id:policy.repository_id,repository_owner_id:policy.owner_id,actor:b.actor,actor_id:policy.actor_id,ref:'refs/heads/main',ref_type:'branch',event_name:'workflow_dispatch',runner_environment:'github-hosted',sha:c.deployment_sha,workflow_sha:c.deployment_sha,workflow_ref:'ANIRUDDH-001/Tabwise/.github/workflows/tabwise-r2.yml@refs/heads/main',run_id:consumer.run_id,run_attempt:'1'};
  if(Object.entries(expected).some(([k,v])=>typeof v!=='string'||p[k]!==v)||b.purpose!=='r2-execution'||b.workflow!=='.github/workflows/tabwise-r2.yml'||b.revision!==c.deployment_sha||consumer.attempt!==1)deny();
  return {repository:p.repository,workflow:b.workflow,revision:p.sha,actor:p.actor,run_id:p.run_id,attempt:1};
 }catch(error){if(error instanceof CallerError)throw error;deny();}
}
const JWKS_URL='https://token.actions.githubusercontent.com/.well-known/jwks';
export async function githubExecutionKeys(fetchImpl=globalThis.fetch){
 const r=await fetchImpl(JWKS_URL,{redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(5000)});
 if(!r.ok||r.redirected||!r.body)throw Error('OIDC keys unavailable');const reader=r.body.getReader();let n=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>65536)throw Error('OIDC key response cap');chunks.push(Buffer.from(value));}}catch(e){await reader.cancel().catch(()=>{});throw e;}
 return uniqueJson(Buffer.concat(chunks).toString('utf8'));
}
