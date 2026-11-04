// Generated test-only keys and stored rows; no execution or qualification authority.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {input} from './helpers/native-request-correction.mjs';
import {buildNativeRequestContext} from '../lib/server/native-request-context.mjs';
import {prepareNativeProductRequest} from '../../src/r2/product-dispatch.mjs';
import {canonical,publicText} from '../../scripts/tabwise/r2-admission.mjs';
import * as issuer from '../lib/server/native-plan-admission.mjs';
import {materializeNativePlan} from '../../src/r2/native-plan.mjs';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {configuration,claims,token,jwks} from './helpers/r2-bridge-fixture.mjs';
import * as worker from '../../src/r2/product-worker.mjs';

function fixture(){
 const a=input(),ctx={...buildNativeRequestContext(a),run:a.run,userId:a.run.user_id},request=prepareNativeProductRequest(ctx);
 const row={user_id:request.user_id,product_run_id:request.product_run_id,request_sha256:request.request_sha256,state:'RUN_BOUND',github_run_id:'123',request,spec_text:ctx.specBytes.toString(),plan_text:ctx.planBytes.toString(),fixture_text:ctx.fixture.toString()};
 const keys=generateKeyPairSync('ed25519'),coordinator=generateKeyPairSync('ed25519'),now=Date.now();
 const binding={purpose:'r2-execution',repository:'ANIRUDDH-001/Tabwise',workflow:request.workflow,revision:request.revision,actor:request.actor,owner_approval_ref:'D-999',review_ref:'isolated-test-only',reviewed_files:['src/r2/native-plan.mjs'],reviewed_sha256:request.r2_source_sha256,qualification_sha256:request.qualification_sha256,plan_sha256:request.plan_sha256,fixtures:[{id:request.page_id,sha256:request.fixture_sha256}],permitted_attempt:1,expires_at:new Date(now+60000).toISOString()};
 const principal={repository:binding.repository,workflow:binding.workflow,revision:binding.revision,actor:binding.actor,run_id:'123',attempt:1};
 const authority={id:'test-only',binding,consumer:{run_id:'123',attempt:1},publicKey:publicText(keys.publicKey),now};
 const payload={schema:'tabwise-r2-consumption/1',authorization_id:authority.id,binding,consumer:authority.consumer,coordinator_key:publicText(coordinator.publicKey),consumed_at:new Date(now).toISOString(),consumption_id:'00000000-0000-4000-8000-000000000001'};
 return {row,principal,authority,receipt:{payload,signature:sign(null,Buffer.from(canonical(payload)),keys.privateKey).toString('base64')},signingKey:keys.privateKey};
}
test('existing W5 authority issues exact durable request admission accepted by real materializer',()=>{
 assert.equal(typeof issuer.issueNativePlanAdmission,'function','request admission issuer is missing');
 const a=fixture(),requestReceipt=issuer.issueNativePlanAdmission(a);
 const result=materializeNativePlan({...a,delivery:a.row,requestReceipt,githubRunId:'123',root:resolve('..'),outputDir:join(mkdtempSync(join(tmpdir(),'tw-issued-plan-')),'source')});
 assert.equal(result.request_sha256,a.row.request_sha256);assert.equal(result.input_authorized,false);
 assert.deepEqual(issuer.issueNativePlanAdmission(a),requestReceipt,'read-only issuance is deterministic and does not consume again');
});

test('authenticated product admission route issues only for its exact stored run; disabled and forged callers touch no secrets',async()=>{
 assert.equal(typeof issuer.createNativePlanAdmissionHandler,'function','product admission handler is missing');
 const a=fixture(),c={...configuration(a.authority.binding),enabled:true,binding:a.authority.binding,authorization_id:a.authority.id,receipt_public_key:a.authority.publicKey,audience:'https://owner-app.example/api/r2/product-admission'};
 let clients=0,secrets=0;
 const handler=issuer.createNativePlanAdmissionHandler({configuration:()=>c,keys:()=>jwks,client:()=>{clients++;return {load:async()=>a.row};},signingKey:()=>{secrets++;return a.signingKey;}});
 const req=(changes={},body={product_run_id:a.row.product_run_id,request_sha256:a.row.request_sha256,github_run_id:'123',receipt:a.receipt})=>new Request(c.audience,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token(claims({aud:c.audience,...changes}))},body:JSON.stringify(body)});
 const response=await handler(req());assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.deepEqual((await response.json()).request_receipt,issuer.issueNativePlanAdmission(a));
 clients=secrets=0;assert.equal((await handler(req({run_id:'124'}))).status,403);assert.equal(clients+secrets,0);
 c.enabled=false;assert.equal((await handler(req())).status,503);assert.equal(clients+secrets,0);c.enabled=true;
 const before=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{assert.equal((await handler(req())).status,503);assert.equal(clients+secrets,0);}finally{if(before===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=before;}
 const missing=await handler(req({}, {product_run_id:a.row.product_run_id,request_sha256:'e'.repeat(64),github_run_id:'123',receipt:a.receipt}));assert.equal(missing.status,409);
 const duplicate=new Request(c.audience,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token(claims({aud:c.audience}))},body:'{"product_run_id":"x","product_run_id":"y"}'});
 assert.equal((await handler(duplicate)).status,400);
});

test('worker obtains and independently verifies request receipt over exact authenticated transport',async()=>{
 assert.equal(typeof worker.requestNativePlanAdmission,'function','worker request admission transport is missing');
 const a=fixture(),origin='https://owner-app.example';let calls=0;
 const args={origin,delivery:a.row,githubRunId:'123',authority:a.authority,receipt:a.receipt,getIDToken:async audience=>{assert.equal(audience,origin+'/api/r2/product-admission');return 'test-only-token';},fetchImpl:async(url,options)=>{calls++;assert.equal(url,origin+'/api/r2/product-admission');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');const q=JSON.parse(options.body);assert.equal(q.request_sha256,a.row.request_sha256);assert.deepEqual(q.receipt,a.receipt);return Response.json({request_receipt:issuer.issueNativePlanAdmission(a),input_authorized:false,native_qualified:false});}};
 const result=await worker.requestNativePlanAdmission(args);assert.deepEqual(result.requestReceipt,issuer.issueNativePlanAdmission(a));assert.equal(calls,1);
 for(const change of ['foreign-origin','signature','oversized','redirect','claims-authority']){
  const bad={...args};if(change==='foreign-origin')bad.origin='https://owner-app.example/escape';
  else bad.fetchImpl=async()=>{if(change==='oversized')return new Response(' '.repeat(65537),{headers:{'content-type':'application/json'}});if(change==='redirect')return new Response(null,{status:302});const value={request_receipt:issuer.issueNativePlanAdmission(a),input_authorized:false,native_qualified:false};if(change==='signature')value.request_receipt.signature='A'.repeat(86)+'==';if(change==='claims-authority')value.input_authorized=true;return Response.json(value);};
  await assert.rejects(()=>worker.requestNativePlanAdmission(bad));
 }
});
for(const kind of ['state','user','run','request','principal','attempt','source','receipt','key','expired'])test('request issuer refuses '+kind,()=>{
 assert.equal(typeof issuer.issueNativePlanAdmission,'function','request admission issuer is missing');
 const a=fixture();
 if(kind==='state')a.row.state='DISPATCH_UNKNOWN';
 if(kind==='user')a.row.user_id='another-owner';
 if(kind==='run')a.row.github_run_id='124';
 if(kind==='request')a.row.request_sha256='e'.repeat(64);
 if(kind==='principal')a.principal.actor='another-actor';
 if(kind==='attempt')a.principal.attempt=2;
 if(kind==='source')a.authority.binding.reviewed_sha256='e'.repeat(64);
 if(kind==='receipt')a.receipt.signature='A'.repeat(86)+'==';
 if(kind==='key')a.signingKey=generateKeyPairSync('ed25519').privateKey;
 if(kind==='expired')a.authority.now=Date.now()+120000;
 assert.throws(()=>issuer.issueNativePlanAdmission(a));
});
