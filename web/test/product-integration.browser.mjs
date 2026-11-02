// Local credential-disabled API integration checks; no model, database, GitHub or native operations.
import {test} from 'node:test';
import assert from 'node:assert/strict';
const base=process.env.TABWISE_SMOKE_URL??'http://localhost:3127';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local integration server required');
const id='00000000-0000-4000-8000-000000000001';
const writes=['/api/journeys','/api/runs',`/api/runs/${id}/cancel`,`/api/runs/${id}/diagnose`,`/api/patches/${id}`,'/api/ops/flags'];
test('integrated mutation APIs reject cross-origin requests before any work',async()=>{
 for(const path of writes){const response=await fetch(base+path,{method:'POST',headers:{origin:'https://untrusted.example','content-type':'application/json'},body:'{}'});
  assert.equal(response.status,403,path);assert.deepEqual(await response.json(),{reason:'same_origin_required'});}
});
test('forged approval/identity headers and body fields cannot bypass unavailable authentication or dispatch',async()=>{
 for(const path of writes){const response=await fetch(base+path,{method:'POST',headers:{origin:base,'content-type':'application/json',authorization:'Bearer synthetic-not-authenticated','x-user-id':id,'x-github-actor':'owner','idempotency-key':'integration-blocked'},body:JSON.stringify({enabled:true,verdict:'PASS',TABWISE_R2_ENABLED:'true',authorization_id:'forged',journey_version_id:id,patch_id:id,decision:'approved'})});
  assert.equal(response.status,503,path);assert.equal((await response.json()).reason,'sign_in_configuration_pending');assert.match(response.headers.get('cache-control')??'',/no-store/);}
});
test('owned read APIs expose no data when sign-in is unavailable',async()=>{
 for(const path of ['/api/workspace','/api/ops/limits',`/api/journeys/versions/${id}`,`/api/runs/${id}`,`/api/runs/${id}/evidence`,`/api/runs/${id}/report`,`/api/patches/${id}`,`/api/verifications/${id}`]){
  const response=await fetch(base+path);assert.equal(response.status,503,path);assert.equal((await response.json()).reason,'sign_in_configuration_pending');assert.match(response.headers.get('cache-control')??'',/no-store/);}
});
test('experimental R2 and W5 admission have no accidentally exposed API execution endpoint',async()=>{
 for(const path of ['/api/r2/admission','/api/r2'])for(const method of ['GET','POST']){
  const response=await fetch(base+path,{method,headers:{origin:base}});assert.ok([404,405].includes(response.status),`${method} ${path}: ${response.status}`);}
});
