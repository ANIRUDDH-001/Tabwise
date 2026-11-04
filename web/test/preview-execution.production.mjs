// Actual built HTTP routes; synthetic auth/provider state. Never claims real hosted OAuth/RLS.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const out=resolve('cache/preview-safety'),base='http://localhost:31381',owner='00000000-0000-4000-8000-000000000001',version='00000000-0000-4000-8000-000000000021',completed='00000000-0000-4000-8000-000000000011',admitted='00000000-0000-4000-8000-000000000012',active='00000000-0000-4000-8000-000000000013';
await mkdir(out,{recursive:true});
const token=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:owner,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'})).toString('base64url')+'.fixture';
const cookie='sb-ueobjrtvsgvkigmjxkks-auth-token=base64-'+Buffer.from(JSON.stringify({access_token:token,refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:owner}})).toString('base64url');
for(const deployment of ['preview','production']){
 const audit=resolve(out,deployment+'-http-audit.jsonl');await writeFile(audit,'');
 const env={...process.env,VERCEL_ENV:deployment,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'https://ueobjrtvsgvkigmjxkks.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fixture-public',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',TABWISE_OAUTH_CONFIGURED:'1',GH_PAT_OWNER:'owner',GH_PAT:'inherited-fixture-token',MODEL_API_KEY:'inherited-fixture-key',TABWISE_META_APPROVAL_REF:'fixture-approval',TABWISE_EXECUTION_APPROVAL_REF:'fixture-approval',TABWISE_REPAIR_EXECUTION_APPROVAL_REF:'fixture-approval',VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),TABWISE_PREVIEW_TEST_AUDIT:audit};delete env.NODE_OPTIONS;
 const server=spawn(process.execPath,['--import',pathToFileURL(resolve('web/test/helpers/preview-execution-fetch.mjs')).href,resolve('web/node_modules/next/dist/bin/next'),'start','--hostname','localhost','--port','31381'],{cwd:resolve('web'),env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
 const call=async(path,method='GET',body)=>{const response=await fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(10000),method,headers:{cookie,origin:base,'content-type':'application/json','Idempotency-Key':'preview-safety-fixture'},...(body?{body:JSON.stringify(body)}:{})});let data;try{data=await response.json();}catch{data=null;}return {response,data};};
 try{
  let ready=false;for(let n=0;n<100;n++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready,'built server ready');
  const diagnose=await call('/api/runs/'+completed+'/diagnose','POST',{}),legacy=await call('/api/runs','POST',{journey_version_id:version,patch_id:'00000000-0000-4000-8000-000000000099'});
  if(deployment==='preview'){
   const cancelled=await call('/api/runs/'+admitted+'/cancel','POST',{});assert.equal(cancelled.response.status,403);assert.equal(cancelled.data.reason,'preview_execution_disabled');
   for(const r of [diagnose,legacy]){assert.equal(r.response.status,403);assert.equal(r.data.reason,'preview_execution_disabled');}
   const login=await call('/auth/login');assert.equal(login.response.status,303);assert.equal(new URL(login.response.headers.get('location')).hostname,'ueobjrtvsgvkigmjxkks.supabase.co');
   const journey={version:'0.1.0',journey_id:'fernway-seat',name:'Preview fixture',steps:[{step:1,key:'Tab',text:null,checkpoint:true}]};
   const saved=[];for(let i=0;i<2;i++){const s=await call('/api/journeys','POST',journey);assert.equal(s.response.status,201);saved.push(s.data);const read=await call('/api/journeys/versions/'+s.data.id);assert.equal(read.response.status,200);assert.deepEqual(read.data.steps,journey.steps);assert.equal(read.data.sha256,s.data.sha256);}
   assert.equal(saved[1].n,saved[0].n+1);assert.equal((await call('/api/journeys/versions/'+saved[0].id)).data.sha256,saved[0].sha256);
   assert.equal((await call('/api/workspace')).response.status,200);
   const live=await call('/api/runs/'+active);assert.equal(live.response.status,200);assert.equal(live.data.status,'dispatched');
   assert.equal((await call('/r/r1-diagnostic')).response.status,200,'read-only report page');
   const preparation=await call('/api/runs','POST',{journey_version_id:version});assert.equal(preparation.response.status,202,JSON.stringify(preparation.data));assert.equal(preparation.data.state,'PREPARED');assert.equal(preparation.data.can_dispatch,false);
   const persisted=await call('/api/runs/'+admitted+'/native-request');assert.equal(persisted.data.state,'PREPARED');
   for(const path of ['/api/r2/product-binding','/api/runs/'+admitted+'/native-dispatch','/api/runs/'+admitted+'/native-ingest'])assert.equal((await call(path,'POST',{})).response.status,503,'existing native gate');
  }else{
   assert.equal(diagnose.response.status,409);assert.equal(diagnose.data.reason,'qualified_evidence_required');
   assert.equal(legacy.response.status,409);assert.equal(legacy.data.reason,'production_fixture_admission_reached');
  }
  const rows=(await readFile(audit,'utf8')).split('\n').filter(Boolean).map(JSON.parse);assert.equal(rows.filter(r=>r.kind==='forbidden-external').length,0);
  assert.equal(rows.filter(r=>/reserve_|run_transition|claim_reconcile/.test(r.path)).length,0,'no budget or execution claims');
  if(deployment==='preview')assert.equal(rows.filter(r=>r.path.endsWith('/admit_repair')).length,0,'legacy refused before admission');
  await writeFile(resolve(out,deployment+'-http-result.json'),JSON.stringify({classification:'LOCAL built-route test, synthetic provider and eligible completed run; no genuine OAuth or DB isolation claim',deployment,pass:true,provider_external_attempts:0,model_reservations:0,execution_claims:0},null,2));
  console.log('PASS '+deployment+' actual built HTTP route boundaries and controlled provider assertions');
 }finally{if(server.exitCode===null&&server.signalCode===null){const closed=new Promise(r=>server.once('close',r));server.kill();await closed;}await writeFile(resolve(out,deployment+'-server.log'),logs);}
}
