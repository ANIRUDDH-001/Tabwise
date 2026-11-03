import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {createAuthority, createCoordinator, validateBinding, verifyReceipt, verifyPageGrant, verifyAdmissionRecord, requestPageAdmission, bindingFromGate, canonical, publicText} from '../scripts/tabwise/r2-admission.mjs';
const keys=generateKeyPairSync('ed25519'), publicKey=publicText(keys.publicKey);
const binding=()=>({purpose:'r2-execution',repository:'ANIRUDDH-001/Tabwise',workflow:'.github/workflows/tabwise-r2.yml',revision:'a'.repeat(40),actor:'owner',owner_approval_ref:'D-100',review_ref:'review-100',reviewed_files:['a.mjs'],reviewed_sha256:'b'.repeat(64),qualification_sha256:'c'.repeat(64),plan_sha256:'d'.repeat(64),fixtures:[{id:'p1',sha256:'e'.repeat(64)}],permitted_attempt:1,expires_at:'2099-01-01T00:00:00.000Z'});
const consumer=(id='123')=>({run_id:id,attempt:1});
// SIMULATED serialized storage only; this is not a PostgreSQL concurrency qualification.
function harness(){
 const rows=new Map();let next=Promise.resolve();let lost=false;
 const rpc=async(name,args)=>{
  const task=next.then(()=>{
   const row=rows.get(args.id);if(!row||row.revoked||Date.parse(row.binding.expires_at)<=Date.now()||canonical(row.binding)!==canonical(args.binding))throw Error('authorization refused');
   if(name==='consume'){
    if(row.receipt)return {fresh:false,receipt:row.receipt};
    row.receipt={schema:'tabwise-r2-consumption/1',authorization_id:args.id,binding:row.binding,consumer:args.consumer,coordinator_key:args.coordinator_key,consumed_at:new Date().toISOString(),consumption_id:'00000000-0000-4000-8000-000000000001'};
    if(lost)throw Error('commit response lost');return {fresh:true,receipt:row.receipt};
   }
   if(!row.receipt||canonical(row.receipt.consumer)!==canonical(args.consumer))throw Error('no matching receipt');
   return {fresh:false,receipt:row.receipt};
  });next=task.catch(()=>{});return task;
 };
 const authority=createAuthority({rpc,signingKey:keys.privateKey,authenticate:async(_request,principal)=>principal});
 const transport=async request=>authority(request,{...request.consumer,repository:request.binding.repository,workflow:request.binding.workflow,revision:request.binding.revision,actor:request.binding.actor});
 const add=(id='auth-1',b=binding())=>rows.set(id,{id:'auth-1',binding:b,revoked:false,receipt:null});add();
 return {rows,transport,add,lose:()=>{lost=true;}};
}
const open=(h,options={})=>createCoordinator({id:'auth-1',binding:binding(),consumer:consumer(),transport:h.transport,publicKey,...options});
test('W5 one consumer wins concurrent distinct executions',async()=>{
 const h=harness();const results=await Promise.allSettled([open(h),open(h,{consumer:consumer('124')})]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected').length,1);
});
test('W5 same-run replay/readback cannot create another coordinator or launch',async()=>{
 const h=harness(),c=await open(h);await assert.rejects(open(h),/consumed|fresh/);
 assert.ok(c.receipt);assert.ok(h.rows.get('auth-1').receipt);
});
test('W5 crash and uncertain committed transaction never restore authorization',async()=>{
 const h=harness();h.lose();await assert.rejects(open(h),/uncertain/);assert.ok(h.rows.get('auth-1').receipt);await assert.rejects(open(h),/consumed|fresh/);
});
test('W5 expiry, revocation, wrong binding and rerun all refuse',async()=>{
 for(const change of [b=>b.actor='other',b=>b.purpose='w2a-qualification',b=>b.revision='f'.repeat(40),b=>b.plan_sha256='f'.repeat(64),b=>b.fixtures[0].sha256='f'.repeat(64),b=>b.review_ref='different',b=>b.qualification_sha256='f'.repeat(64)]){
  const h=harness(),b=binding();change(b);await assert.rejects(open(h,{id:'auth-1',binding:b}));assert.equal(h.rows.get('auth-1').receipt,null);
 }
 const h=harness();h.rows.get('auth-1').revoked=true;await assert.rejects(open(h));
 const e=harness(),b=binding();b.expires_at='2000-01-01T00:00:00.000Z';e.add('auth-1',b);await assert.rejects(open(e,{id:'auth-1',binding:b}));
 await assert.rejects(open(harness(),{consumer:{run_id:'123',attempt:2}}));
});
test('W5 binding parser rejects malformed, inherited, duplicate scope and unknown fields',()=>{
 for(const b of [null,[],{},Object.create(binding()),{...binding(),extra:true},{...binding(),reviewed_files:['a','a']},{...binding(),fixtures:[]},{...binding(),expires_at:'tomorrow'},{...binding(),purpose:'anything'},{...binding(),permitted_attempt:2}])assert.throws(()=>validateBinding(b));
 assert.doesNotThrow(()=>validateBinding(binding()));
});
test('W5 authority requires authenticated identity and permanent database receipt',async()=>{
 const h=harness(),c=await open(h);const request={action:'read',id:'auth-1',binding:binding(),consumer:consumer()};
 const deny=createAuthority({rpc:async()=>({fresh:true,receipt:{}}),signingKey:keys.privateKey,authenticate:async()=>null});await assert.rejects(deny(request,{}));
 assert.throws(()=>verifyReceipt({...c.receipt,signature:'bad'},{id:'auth-1',binding:binding(),consumer:consumer(),publicKey}));
 const other=generateKeyPairSync('ed25519');assert.throws(()=>verifyReceipt(c.receipt,{id:'auth-1',binding:binding(),consumer:consumer(),publicKey:publicText(other.publicKey)}));
});
test('W5 child challenges bind page, nonce, child PID and coordinator PID; replay refuses',async()=>{
 const h=harness(),c=await open(h),challenge={page:'p1',nonce:'1'.repeat(64),pid:111,ppid:100};
 const grant=await c.grant(challenge,{pid:111,ppid:100,page:'p1'});
 assert.doesNotThrow(()=>verifyPageGrant(grant,{id:'auth-1',challenge,binding:binding(),consumer:consumer(),publicKey}));
 for(const altered of [{...challenge,pid:112},{...challenge,ppid:101},{...challenge,nonce:'2'.repeat(64)},{...challenge,page:'other'}])assert.throws(()=>verifyPageGrant(grant,{id:'auth-1',challenge:altered,binding:binding(),consumer:consumer(),publicKey}));
 await assert.rejects(c.grant(challenge,{pid:111,ppid:100,page:'p1'}),/used|replay/);
});
test('W5 revocation or uncertain readback between pages prevents grant',async()=>{
 const h=harness(),c=await open(h);h.rows.get('auth-1').revoked=true;
 await assert.rejects(c.grant({page:'p1',nonce:'1'.repeat(64),pid:111,ppid:100},{pid:111,ppid:100,page:'p1'}));
});
test('W5 direct-page invocation without coordinator IPC refuses before runtime',async()=>{
 await assert.rejects(requestPageAdmission({channel:{},id:'auth-1',binding:binding(),consumer:consumer(),page:'p1',publicKey}),/IPC|coordinator/);
});
test('W5 record verifier rejects missing receipt/grants, duplicates, manifest mismatch and forgery',async()=>{
 const c=await open(harness()),challenge={page:'p1',nonce:'1'.repeat(64),pid:111,ppid:100};await c.grant(challenge,{pid:111,ppid:100,page:'p1'});
 const record=c.record('f'.repeat(64));const expected={id:'auth-1',binding:binding(),consumer:consumer(),publicKey,manifest:'f'.repeat(64),pages:['p1']};
 assert.doesNotThrow(()=>verifyAdmissionRecord(record,expected));
 for(const value of [null,{...record,receipt:null},{...record,grants:[]},{...record,grants:[...record.grants,...record.grants]},{...record,run_manifest_sha256:'e'.repeat(64)},{...record,authorized:true}])assert.throws(()=>verifyAdmissionRecord(value,expected));
});
test('W5 gate binding reuses existing approval contracts rather than caller labels',()=>{
 const b=binding();const gate={head:b.revision,status:{actor:b.actor,owner_approval_ref:b.owner_approval_ref,review_ref:b.review_ref,reviewed_files:b.reviewed_files,reviewed_sha256:b.reviewed_sha256,qualification_sha256:b.qualification_sha256,plan_sha256:b.plan_sha256},plan:{pages:[{id:'p1',fixture_sha256:'e'.repeat(64)}]}};
 assert.deepEqual(bindingFromGate(gate,{expires_at:b.expires_at}),b);
});

import {spawn} from 'node:child_process';
import {once} from 'node:events';
test('W5 real Node IPC admits exactly the actual child; forged parent signature refuses',async()=>{
 for(const forged of [false,true]){
  const h=harness(),c=await open(h);
  const moduleUrl=new URL('../scripts/tabwise/r2-admission.mjs',import.meta.url).href;
  const code=`import {requestPageAdmission} from ${JSON.stringify(moduleUrl)};try{await requestPageAdmission({id:'auth-1',binding:${JSON.stringify(binding())},consumer:${JSON.stringify(consumer())},page:'p1',publicKey:${JSON.stringify(publicKey)}});process.exitCode=0;}catch{process.exitCode=2;}`;
  const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
  const timer=setTimeout(()=>child.kill(),5000);
  try{
   const closed=once(child,'close');const [request]=await once(child,'message');
   const grant=await c.grant(request.challenge,{pid:child.pid,ppid:process.pid,page:'p1'});
   if(forged)grant.grant.signature='A'.repeat(86)+'==';
   child.send(grant);const [exit]=await closed;assert.equal(exit,forged?2:0);
  }finally{clearTimeout(timer);if(child.exitCode===null)child.kill();}
 }
});

import {createPostgresAuthority} from '../scripts/tabwise/r2-admission.mjs';
test('W5 Postgres service adapter maps only consume/read RPCs and fails on database errors',async()=>{
 let called;const pair=generateKeyPairSync('ed25519');
 const request={action:'consume',id:'auth-1',binding:binding(),consumer:consumer(),coordinator_key:publicText(pair.publicKey)};
 const principal={...consumer(),repository:request.binding.repository,workflow:request.binding.workflow,revision:request.binding.revision,actor:request.binding.actor};
 const receipt={schema:'tabwise-r2-consumption/1',authorization_id:'auth-1',binding:binding(),consumer:consumer(),coordinator_key:request.coordinator_key,consumed_at:new Date().toISOString(),consumption_id:'00000000-0000-4000-8000-000000000002'};
 const authority=createPostgresAuthority({client:{rpc:async(name,args)=>{called={name,args};return {data:{fresh:true,receipt},error:null};}},signingKey:keys.privateKey,authenticate:async()=>principal});
 const result=await authority(request);assert.equal(called.name,'w5_consume');assert.deepEqual(called.args,{p_request:request});assert.equal(result.fresh,true);verifyReceipt(result.receipt,{id:'auth-1',binding:binding(),consumer:consumer(),publicKey});
 const bad=createPostgresAuthority({client:{rpc:async()=>({data:{fresh:true,receipt},error:{message:'synthetic'}})},signingKey:keys.privateKey,authenticate:async()=>principal});await assert.rejects(bad(request));
});

test('W5 receipt/grants cannot be transplanted to a changed run manifest by editing the record',async()=>{
 const c=await open(harness());await c.grant({page:'p1',nonce:'1'.repeat(64),pid:111,ppid:100},{page:'p1',pid:111,ppid:100});
 const record=c.record('f'.repeat(64));record.run_manifest_sha256='e'.repeat(64);
 assert.throws(()=>verifyAdmissionRecord(record,{id:'auth-1',binding:binding(),consumer:consumer(),publicKey,manifest:'e'.repeat(64),pages:['p1']}));
});

test('W5 verifier binds the exact authorization ID, not only an otherwise matching approval',async()=>{
 const c=await open(harness());
 assert.throws(()=>verifyReceipt(c.receipt,{id:'other-authorization',binding:binding(),consumer:consumer(),publicKey}));
});
