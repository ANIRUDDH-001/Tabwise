import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {r2ChildEnv} from '../scripts/tabwise/r2-run.mjs';
import {R2_FILES} from '../scripts/tabwise/r2-policy.mjs';
import {loadAdmissionPolicy, createRemoteTransport, validateAdmissionPolicy} from '../scripts/tabwise/r2-admission-transport.mjs';
const entry=readFileSync(new URL('../scripts/tabwise-r2.mjs',import.meta.url),'utf8');
test('W5 checked-in transport disabled, no endpoint/key/authorization configured',()=>{
 const policy=JSON.parse(readFileSync(new URL('../scripts/tabwise/r2-admission-policy.json',import.meta.url)));
 assert.equal(policy.enabled,false);assert.throws(()=>loadAdmissionPolicy(),/BLOCK|disabled/);
});
test('W5 source binds all runtime admission dependencies and SQL authority',()=>{
 for(const f of ['scripts/tabwise/r2-admission.mjs','scripts/tabwise/r2-admission-transport.mjs','scripts/tabwise/r2-admission-policy.json','supabase/proposals/r2-w5-admission.sql'])assert.ok(R2_FILES.includes(f),f);
});
test('W5 production page admission precedes runtime import and coordinator admission precedes launches',()=>{
 const page=entry.slice(entry.indexOf('async function runPage'),entry.indexOf('async function runAll'));
 const admission=page.indexOf('await requestPageAdmission('),load=page.indexOf("await import('./tabwise/r2-loader.mjs')");
 assert.ok(admission>=0&&load>admission,'W5 admission must precede R2 runtime import');
 const run=entry.slice(entry.indexOf('async function runAll'),entry.indexOf('async function verifyRun'));
 assert.ok(run.indexOf('await createCoordinator(')>=0);assert.ok(run.indexOf('await createCoordinator(')<run.indexOf('await runR2Pages('));
 assert.match(entry,/verifyAdmissionRecord\(/);assert.match(entry,/coordinator\.grant\(/);
});
test('W5 coordinator credentials never enter page environment',()=>{
 const env=r2ChildEnv({TABWISE_W5_AUTH_TOKEN:'synthetic-not-a-credential',TABWISE_R2_AUTH_TOKEN:'synthetic',SUPABASE_SERVICE_ROLE_KEY:'synthetic',NODE_OPTIONS:'bad',GITHUB_RUN_ID:'123'});
 assert.deepEqual({...env},{GITHUB_RUN_ID:'123'});
});
test('W5 transport refuses redirects, HTTP error, invalid or oversized response without retry',async()=>{
 for(const response of [new Response('{}',{status:503,headers:{'content-type':'application/json'}}),new Response('not JSON',{headers:{'content-type':'application/json'}}),new Response('x'.repeat(70000),{headers:{'content-type':'application/json'}})]){
  let calls=0;const transport=createRemoteTransport({origin:'https://owner-app.example',token:'synthetic',fetchImpl:async(_url,options)=>{calls++;assert.equal(options.redirect,'error');return response;}});
  await assert.rejects(transport({action:'read'}));assert.equal(calls,1);
 }
 assert.throws(()=>createRemoteTransport({origin:'http://evil.example',token:'x'}));
});

test('W5 Next.js transport requires an explicitly reviewed canonical HTTPS owner origin and fixed API path',async()=>{
 const key=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'});
 const p={schema:'tabwise-r2-admission-policy/1',enabled:true,authority_origin:'https://owner-app.example',receipt_public_key:key,authorization_id:'auth-1',expires_at:'2099-01-01T00:00:00.000Z'};
 assert.doesNotThrow(()=>validateAdmissionPolicy(p));
 for(const origin of [null,'','http://owner-app.example','https://owner-app.example/','https://owner-app.example/api/r2/admission','https://owner-app.example?x=1','https://owner-app.example#x','https://user:pass@owner-app.example','https://owner-app.example:444','https://127.0.0.1','https://localhost','https://ueobjrtvsgvkigmjxkks.supabase.co','https://owner-app.example@evil.example','https://OWNER-APP.example','https://owner-app.example:443']){
  assert.throws(()=>validateAdmissionPolicy({...p,authority_origin:origin}));
  assert.throws(()=>createRemoteTransport({origin,token:'synthetic'}));
 }
 for(const value of [{...p,enabled:false},{...p,authority_url:'https://owner-app.example/api/r2/admission'},{...p,expires_at:'2099-02-31T00:00:00.000Z'},{...p,receipt_public_key:'invalid'}])assert.throws(()=>validateAdmissionPolicy(value));
 let calls=0;
 const transport=createRemoteTransport({origin:p.authority_origin,token:'synthetic',fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://owner-app.example/api/r2/admission');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,'Bearer synthetic');
  return new Response('{"fresh":false}',{headers:{'content-type':'application/json'}});
 }});
 assert.deepEqual(await transport({action:'read'}),{fresh:false});assert.equal(calls,1);
 const policy=JSON.parse(readFileSync(new URL('../scripts/tabwise/r2-admission-policy.json',import.meta.url)));
 assert.equal(policy.authority_origin,null);assert.equal(policy.receipt_public_key,null);assert.equal(policy.authorization_id,null);assert.equal(policy.enabled,false);assert.equal('authority_url' in policy,false);
});
