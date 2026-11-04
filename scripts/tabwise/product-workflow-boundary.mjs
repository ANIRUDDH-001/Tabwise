// Trusted OIDC job only. No native imports, credentials persisted or input authority.
import {claimNativeProduct} from '../../src/r2/product-worker.mjs';import {validateProductDelivery} from '../../src/r2/product-delivery.mjs';
export async function bindProductWorkflow({origin,identity,nonce,githubRunId,getIDToken,fetchImpl}){let delivery;const fetchBound=async(...args)=>{const response=await fetchImpl(...args);if(response.ok){const body=await response.clone().json();delivery=validateProductDelivery(body.delivery);if(delivery.request.product_run_id!==identity.product_run_id||delivery.request.request_sha256!==identity.request_sha256)throw Error('workflow delivery substitution');}return response;};const result=await claimNativeProduct({origin,request:identity,nonce,githubRunId,getIDToken,fetchImpl:fetchBound});if(!result.bound)throw Error('product binding pending');return {delivery,input_authorized:false};}

import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {r2Digest} from './r2-policy.mjs';
import {qualificationDigest} from './qualification-policy.mjs';
export function verifyBoundProductDelivery({delivery,identity,github,sourceDigest,qualificationDigest:qualification}){
 const d=validateProductDelivery(delivery),r=d.request,g=github;
 if(r.product_run_id!==identity?.product_run_id||r.request_sha256!==identity.request_sha256||r.r2_source_sha256!==sourceDigest||r.qualification_sha256!==qualification||g?.revision!==r.revision||g.actor!==r.actor||g.triggeringActor!==r.actor||g.workflow!==r.workflow||g.ref!=='refs/heads/main'||g.attempt!==1||!/^[1-9][0-9]{0,19}$/.test(g.runId??''))throw Error('trusted product delivery identity mismatch');
 return d;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const e=process.env,policy=JSON.parse(readFileSync('scripts/tabwise/native-integration-policy.json','utf8')),transport=JSON.parse(readFileSync('scripts/tabwise/r2-admission-policy.json','utf8'));
 if(!policy.enabled||!policy.delivery_enabled||!policy.recovery_enabled||e.GITHUB_ACTIONS!=='true'||e.GITHUB_RUN_ATTEMPT!=='1'||e.GITHUB_REF!=='refs/heads/main'||e.GITHUB_REPOSITORY!=='ANIRUDDH-001/Tabwise'||e.GITHUB_WORKFLOW_REF!=='ANIRUDDH-001/Tabwise/.github/workflows/tabwise-r2.yml@refs/heads/main')throw Error('reviewed trusted product boundary disabled');
 const identity={workflow:'.github/workflows/tabwise-r2.yml',execution_authorized:false,product_run_id:e.PRODUCT_RUN_ID,request_sha256:e.PRODUCT_REQUEST_SHA256};
 const getIDToken=async audience=>{const url=new URL(e.ACTIONS_ID_TOKEN_REQUEST_URL);if(url.protocol!=='https:'||!url.hostname.endsWith('.actions.githubusercontent.com'))throw Error('OIDC endpoint refused');url.searchParams.set('audience',audience);const r=await fetch(url,{headers:{authorization:'Bearer '+e.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('OIDC unavailable');return (await r.json()).value;};
 const {delivery:d}=await bindProductWorkflow({origin:transport.authority_origin,identity,nonce:e.PRODUCT_NONCE,githubRunId:e.GITHUB_RUN_ID,getIDToken,fetchImpl:fetch});
 verifyBoundProductDelivery({delivery:d,identity,github:{revision:e.GITHUB_SHA,actor:e.GITHUB_ACTOR,triggeringActor:e.GITHUB_TRIGGERING_ACTOR,workflow:identity.workflow,ref:e.GITHUB_REF,attempt:Number(e.GITHUB_RUN_ATTEMPT),runId:e.GITHUB_RUN_ID},sourceDigest:r2Digest(),qualificationDigest:qualificationDigest()});
 const target=resolve(e.RUNNER_TEMP,'tabwise-product-delivery');mkdirSync(target);writeFileSync(resolve(target,'delivery.json'),JSON.stringify(d),{flag:'wx'});
}
