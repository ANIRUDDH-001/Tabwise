import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {verifyExecutionCaller} from '../lib/server/r2-caller.mjs';
import {createAdmissionHandler} from '../lib/server/r2-admission.mjs';
import {createCoordinator,publicText} from '../../scripts/tabwise/r2-admission.mjs';
import {binding,consumer,configuration,claims,token,jwks,database,receiptKeys,requestBody} from './helpers/r2-bridge-fixture.mjs';
function handler(db,overrides={}){return createAdmissionHandler({configuration:()=>configuration(),keys:async()=>jwks,client:()=>db.client,signingKey:()=>receiptKeys.privateKey,...overrides});}
const req=(body,jwt=token(),headers={})=>new Request('https://owner-app.example/api/r2/admission',{method:'POST',headers:{authorization:'Bearer '+jwt,'content-type':'application/json',...headers},body:JSON.stringify(body)});
test('OIDC signature and signed execution claims produce independent principal',()=>{
 const c=verifyExecutionCaller(token(),{jwks,configuration:configuration(),binding:binding(),consumer:consumer()});
 assert.deepEqual(c,{repository:binding().repository,workflow:binding().workflow,revision:binding().revision,actor:'owner',run_id:'123',attempt:1});
});
test('OIDC rejects forged signature, algorithm, key id, issuer/audience, lifetime and every identity mismatch',()=>{
 const other=generateKeyPairSync('rsa',{modulusLength:2048});
 for(const jwt of [token(claims(),undefined,other.privateKey),token(claims(),{alg:'none',typ:'JWT',kid:'fixture-key'}),token(claims(),{alg:'RS256',typ:'JWT',kid:'missing'}),'not-a-token',...Object.entries({iss:'https://evil.example',aud:'wrong',sub:'wrong',repository:'other/repo',repository_id:'11',repository_owner_id:'21',actor:'other',actor_id:'31',ref:'refs/heads/other',ref_type:'tag',event_name:'pull_request',runner_environment:'self-hosted',sha:'f'.repeat(40),workflow_sha:'f'.repeat(40),workflow_ref:'wrong',run_id:'124',run_attempt:'2',exp:1,nbf:Math.floor(Date.now()/1000)+100,iat:Math.floor(Date.now()/1000)+100}).map(([k,v])=>token(claims({[k]:v})))])assert.throws(()=>verifyExecutionCaller(jwt,{jwks,configuration:configuration(),binding:binding(),consumer:consumer()}));
});
test('Next admission verifies before database/signing; disabled or browser calls cannot issue receipts',async()=>{
 const db=database();let secrets=0;
 const off=handler(db,{configuration:()=>{throw Error('disabled');},signingKey:()=>{secrets++;return receiptKeys.privateKey;}});
 assert.equal((await off(req({}))).status,503);assert.equal(db.calls,0);assert.equal(secrets,0);
 const live=handler(db,{signingKey:()=>{secrets++;return receiptKeys.privateKey;}});
 for(const r of [req({},'bad'),req({},token(),{origin:'https://owner-app.example'}),req({},token(),{'content-type':'text/plain'})])assert.ok((await live(r)).status>=400);
 assert.equal(db.calls,0);assert.equal(secrets,0);
});
test('Next admission binds approvals/source/plan/purpose/id to server policy, never supplied labels',async()=>{
 const db=database(),h=handler(db),key=publicText(generateKeyPairSync('ed25519').publicKey);
 const base=requestBody(key);
 for(const change of [x=>x.id='wrong',x=>x.consumer.run_id='124',x=>x.binding.purpose='w2a-qualification',x=>x.binding.owner_approval_ref='D-101',x=>x.binding.review_ref='other',x=>x.binding.reviewed_sha256='f'.repeat(64),x=>x.binding.plan_sha256='f'.repeat(64),x=>x.binding.qualification_sha256='f'.repeat(64),x=>x.binding.reviewed_files=['other.mjs'],x=>x.binding.expires_at='2098-01-01T00:00:00.000Z']){
  const b=structuredClone(base);change(b);assert.ok((await h(req(b))).status>=400);
 }
 assert.equal(db.calls,0);
});
test('Next route service -> W5 coordinator consumes once; same-run and concurrent replay cannot relaunch',async()=>{
 const db=database(),h=handler(db),transport=async body=>{const response=await h(req(body));if(!response.ok)throw Error('refused');return response.json();};
 const options={id:'auth-1',binding:binding(),consumer:consumer(),transport,publicKey:publicText(receiptKeys.publicKey)};
 const results=await Promise.allSettled([createCoordinator(options),createCoordinator(options)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);await assert.rejects(createCoordinator(options));
});
test('uncertain committed outcome is refused and remains permanently consumed',async()=>{
 const db=database();db.loseNext();const h=handler(db),transport=async body=>{const r=await h(req(body));if(!r.ok)throw Error('unknown');return r.json();},o={id:'auth-1',binding:binding(),consumer:consumer(),transport,publicKey:publicText(receiptKeys.publicKey)};
 await assert.rejects(createCoordinator(o));assert.ok(db.receipt);await assert.rejects(createCoordinator(o));assert.match((await h(req({...requestBody(publicText(receiptKeys.publicKey)),action:'read',coordinator_key:undefined}))).headers.get('cache-control'),/no-store/);
});

test('valid-body invalid callers touch no authority secrets; upstream/key/client failures return unavailable',async()=>{
 const db=database(),body=requestBody(publicText(generateKeyPairSync('ed25519').publicKey));let secrets=0;
 const live=handler(db,{signingKey:()=>{secrets++;return receiptKeys.privateKey;}});assert.equal((await live(req(body,'bad'))).status,401);assert.equal(db.calls,0);assert.equal(secrets,0);
 for(const overrides of [{keys:async()=>{throw Error('network unavailable');}},{signingKey:()=>{throw Error('missing key');}},{client:()=>{throw Error('missing backend');}}])assert.equal((await handler(db,overrides)(req(body))).status,503);
 assert.equal(db.calls,0);
});

// Preserve the capability-free CLI policy import boundary while checking the server constants.
test('server policy constants match the reviewed CLI and runtime loader rejects arbitrary paths',async()=>{
 const {reviewedR2Module}=await import('../../src/r2/node-review.mjs');
 const {RETIRED_APPROVALS}=await import('../../src/r2/approval-constants.mjs');
 assert.deepEqual(RETIRED_APPROVALS,reviewedR2Module('r2-policy.mjs').RETIRED_APPROVALS);
 assert.throws(()=>reviewedR2Module('../qualification-policy.mjs'),/unreviewed module refused/);
});
