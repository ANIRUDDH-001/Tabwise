// Transport adapter only. Binding never grants input; the existing W5/native gates remain mandatory.
import {validateProductDelivery} from './product-delivery.mjs';
import {verifyNativePlanAdmission} from './native-plan.mjs';
import {parseUniqueJson} from './strict-json.mjs';
export async function requestNativePlanAdmission({origin,delivery,githubRunId,authority,receipt,getIDToken,fetchImpl=fetch}){
 const d=validateProductDelivery(delivery),r=d.request,target=new URL(origin);
 if(target.protocol!=='https:'||target.origin!==origin||target.username||target.password||!/^[1-9][0-9]{0,19}$/.test(githubRunId??''))throw Error('exact admission transport required');
 const endpoint=origin+'/api/r2/product-admission',jwt=await getIDToken(endpoint),signal=AbortSignal.timeout(5000);
 if(typeof jwt!=='string'||!jwt||jwt.length>16384||/[\x00-\x20\x7f]/.test(jwt))throw Error('execution credential required');
 const response=await fetchImpl(endpoint,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal,headers:{authorization:'Bearer '+jwt,'content-type':'application/json'},body:JSON.stringify({product_run_id:r.product_run_id,request_sha256:r.request_sha256,github_run_id:githubRunId,receipt})});
 if(!response.ok||response.redirected||!response.body||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))throw Error('request admission unavailable');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>65536)throw Error('request admission response cap');chunks.push(Buffer.from(v.value));}}finally{reader.cancel().catch(()=>{});}
 const result=parseUniqueJson(Buffer.concat(chunks).toString('utf8'));
 if(Object.keys(result).sort().join(',')!=='input_authorized,native_qualified,request_receipt'||result.input_authorized!==false||result.native_qualified!==false)throw Error('request admission response mismatch');
 verifyNativePlanAdmission({delivery:d,githubRunId,authority,receipt,requestReceipt:result.request_receipt});
 return {requestReceipt:result.request_receipt,input_authorized:false,native_qualified:false};
}
export async function claimNativeProduct({origin,request,nonce,githubRunId,getIDToken,fetchImpl=fetch}){
 if(!/^https:\/\/[^/]+$/.test(origin??'')||!request||request.workflow!=='.github/workflows/tabwise-r2.yml'||request.execution_authorized!==false||!/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(nonce??'')||!/^[a-f0-9]{64}$/.test(request.request_sha256??'')||!/^[1-9][0-9]{0,19}$/.test(githubRunId??''))throw Error('exact native claim metadata required');
 const target=new URL(origin);if(target.protocol!=='https:'||target.origin!==origin||target.username||target.password)throw Error('exact native claim origin required');
 const endpoint=origin+'/api/r2/product-binding',audience=endpoint+'?request_sha256='+request.request_sha256+'&nonce='+nonce;
 const jwt=await getIDToken(audience);
 const response=await fetchImpl(endpoint,{method:'POST',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(5000),headers:{authorization:'Bearer '+jwt,'content-type':'application/json'},body:JSON.stringify({product_run_id:request.product_run_id,request_sha256:request.request_sha256,github_run_id:githubRunId,nonce})});
 if(response.status===425)return {bound:false,association_pending:true,input_authorized:false};
 if(!response.ok)throw Error('native product binding refused');const value=await response.json();
 if(value.state!=='RUN_BOUND'||value.request_sha256!==request.request_sha256||value.github_run_id!==githubRunId||value.native_qualified!==false||value.can_dispatch!==false)throw Error('native binding response mismatch');
 return {bound:true,association_pending:false,input_authorized:false};
}
