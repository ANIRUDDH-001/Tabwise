// Transport adapter only. Binding never grants input; the existing W5/native gates remain mandatory.
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
