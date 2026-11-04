import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHostedBroker} from '../lib/server/core.mjs';
import {dispatchAdmitted} from '../lib/server/jobs.mjs';
import {reconcileRun} from '../lib/server/reconcile.mjs';
import {github} from '../lib/server/github.ts';
import {respond} from '../../src/meta/client.mjs';
import {openBroker} from '../../src/budget/broker.mjs';

const denied=e=>e.status===403&&e.reason==='preview_execution_disabled';
async function environment(value,work){
 const keys=['VERCEL_ENV','GH_PAT','MODEL_API_KEY','TABWISE_META_APPROVAL_REF','TABWISE_EXECUTION_APPROVAL_REF','TABWISE_REPAIR_EXECUTION_APPROVAL_REF'];
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 for(const k of keys)process.env[k]=k==='VERCEL_ENV'?value:'inherited-fixture-only';
 try{return await work();}finally{for(const k of keys)if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}
}
const run={id:'00000000-0000-4000-8000-000000000001',status:'admitted',spec:{version:'0.1.0',run_id:'00000000-0000-4000-8000-000000000001',journey_id:'fernway-seat',app_hash:'a'.repeat(64),variant:'broken',steps:[{step:1,key:'Tab',text:null,checkpoint:true}]}};
test('Preview inherited credentials cannot reserve through hosted or local brokers',()=>environment('preview',async()=>{
 let calls=0;const broker=createHostedBroker(async()=>{calls++;return {data:{id:'fixture'}};});
 await assert.rejects(()=>broker.reserve({model:'muse-spark-1.3',inputTokens:10,maxOutputTokens:10}),denied);assert.equal(calls,0);
 const dir=mkdtempSync(join(tmpdir(),'tw-preview-budget-')),local=openBroker({dbPath:join(dir,'budget.db'),costsPath:join(dir,'costs.jsonl')});
 try{assert.throws(()=>local.reserve({model:'muse-spark-1.3',inputTokens:10,maxOutputTokens:10}),denied);assert.equal(local.status().openReservations,0);}finally{local.close();rmSync(dir,{recursive:true,force:true});}
}));
test('Preview model transport refuses even a caller-supplied permissive broker before reservation or fetch',()=>environment('preview',async()=>{
 let reserved=0,fetched=0;await assert.rejects(()=>respond({broker:{reserve:async()=>{reserved++;return {id:'fixture'};}},model:'muse-spark-1.3',input:'eligible fixture',maxOutputTokens:10,fetchImpl:async()=>{fetched++;throw Error('must not fetch');}}),denied);
 assert.equal(reserved,0);assert.equal(fetched,0);
}));
test('Preview legacy dispatch refuses before claim/spec/transition/retry and all GitHub writes refuse before fetch',()=>environment('preview',async()=>{
 let effects=0;const effect=async()=>{effects++;return true;};
 for(let retry=0;retry<2;retry++)await assert.rejects(()=>dispatchAdmitted(run,{claim:effect,saveSpec:effect,dispatch:effect,transition:effect}),denied);
 const previous=globalThis.fetch;globalThis.fetch=async()=>{effects++;return Response.json({});};
 try{for(const path of ['/actions/workflows/tabwise-run.yml/dispatches','/actions/workflows/tabwise-r2.yml/dispatches','/actions/runs/123/rerun','/actions/runs/123/cancel'])await assert.rejects(()=>github(path,{method:'POST'}),denied);
 await assert.rejects(()=>github('/actions/artifacts/123',{method:'DELETE'}),denied);
 }finally{globalThis.fetch=previous;}
 assert.equal(effects,0);
}));
test('Preview retry/reconciliation is read-only for active, expired, unknown and completed runs',()=>environment('preview',async()=>{
 let effects=0;const api=new Proxy({},{get:()=>async()=>{effects++;throw Error('no reconciliation effect');}});
 for(const status of ['admitted','dispatching','dispatched','running','uploading','ingesting','completed'])for(const deadline_at of ['2000-01-01','2999-01-01']){
  const r={...run,status,deadline_at,gh_run_id:'123'};assert.deepEqual(await reconcileRun(r,api),r);
 }assert.equal(effects,0);
}));
test('Production broker/model and one-shot legacy dispatch keep their controlled behavior',()=>environment('production',async()=>{
 let reservations=0,fetches=0,settlements=0;const dir=mkdtempSync(join(tmpdir(),'tw-production-model-'));
 const broker=createHostedBroker(async(name)=>{if(name==='reserve_hosted'){reservations++;return {data:{id:'fake-reservation'}};}settlements++;return {data:{}};});
 try{const result=await respond({broker,model:'muse-spark-1.3',input:'fixture',maxOutputTokens:10,logDir:dir,fetchImpl:async()=>{fetches++;return Response.json({output_text:'fixture answer',usage:{input_tokens:1,output_tokens:1}});}});assert.equal(result.text,'fixture answer');}finally{rmSync(dir,{recursive:true,force:true});}
 assert.deepEqual([reservations,fetches,settlements],[1,1,1]);
 const calls=[];const result=await dispatchAdmitted(run,{claim:async()=>{calls.push('claim');return true;},saveSpec:async()=>calls.push('save'),dispatch:async()=>calls.push('dispatch'),transition:async()=>calls.push('transition')});
 assert.equal(result.status,'dispatched');assert.deepEqual(calls,['claim','save','dispatch','transition']);
}));
test('Production GitHub mutation and Preview GitHub reads use only controlled transport',async()=>{
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({fixture:true});};
 try{await environment('production',async()=>assert.equal((await github('/actions/workflows/tabwise-run.yml/dispatches',{method:'POST'})).data.fixture,true));
 await environment('preview',async()=>assert.equal((await github('/actions/runs/123')).data.fixture,true));assert.equal(calls,2);
 }finally{globalThis.fetch=previous;}
});
