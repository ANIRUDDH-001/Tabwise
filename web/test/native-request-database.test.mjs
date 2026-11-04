import {test} from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {createServer} from 'node:http';
import {sha256} from '../../packages/contracts/index.mjs';import {prepareNativeProductRequest} from '../../src/r2/product-dispatch.mjs';
import {createNativeRequestHandler,nativeRequestStore,recordNativeDispatch} from '../lib/server/native-request.mjs';
import {createNativeBindingHandler} from '../lib/server/native-binding.mjs';
import {binding as baseBinding,configuration,claims,token,jwks} from './helpers/r2-bridge-fixture.mjs';
import {mkdtemp,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {writeNativeRequestPackage} from '../../src/r2/request-package.mjs';
import {stable} from '../../packages/contracts/r2-product.mjs';
const enabled=process.env.TABWISE_G2_LOCAL_DB==='g2local',owner='00000000-0000-4000-8000-000000000001',foreign='00000000-0000-4000-8000-000000000002',runId='00000000-0000-4000-8000-000000000011',version='00000000-0000-4000-8000-000000000021';
const q=v=>v===null?'null':"'"+String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")+"'";
const sql=s=>new Promise((yes,no)=>{const c=spawn('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-h','127.0.0.1','-p','55442','-U','g2test','-d','g2local','-At','-q','-v','ON_ERROR_STOP=1','-c',s],{windowsHide:true});let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',no);c.on('close',code=>code?no(Error(err)):yes(out.trim()));});
test('HTTP API + PostgreSQL: owned persistence, concurrency, unknown outcome and conflicting execution correlations',{skip:!enabled,timeout:30000},async()=>{
 const fixture=Buffer.from('<button>Go</button>'),spec={version:'0.1.0',run_id:runId,journey_id:'fernway-seat',app_hash:sha256(fixture),variant:'broken',steps:[{step:1,key:'Tab',text:null,checkpoint:true}]},run={id:runId,user_id:owner,status:'admitted',journey_version_id:version,spec};
 const context={userId:owner,run,specBytes:Buffer.from(JSON.stringify(spec)),planBytes:Buffer.from(JSON.stringify({schema:'tabwise-r2-plan/1',split:'development',spec:{ackMs:1000,observationMs:100,pollMs:10,timeoutMs:1000},handleTimeoutMs:1000,focusWaitMs:1000,pages:[{id:'p1',fixture:'fixture.html',fixture_sha256:sha256(fixture),query:'?flow=seat&variant=broken',task:[{step:'go',press:'Tab'}]}]})),fixture,pageId:'p1',planPath:'fixtures/r2/plans/product.json',revision:'a'.repeat(40),actor:'owner',r2SourceSha256:'b'.repeat(64),qualificationSha256:'c'.repeat(64)};
 await sql(`insert into public.journey_versions(id,journey_id,user_id,n,steps,sha256) values(${q(version)},'fernway-seat',${q(owner)},1,${q(spec.steps)},${q('d'.repeat(64))});insert into public.runs(id,user_id,journey_id,journey_version_id,access_kind,status,spec,deadline_at) values(${q(runId)},${q(owner)},'fernway-seat',${q(version)},'owner','admitted',${q(spec)},now()+interval '10 minutes');`);
 const rpc=async(name,args)=>{assert(['prepare_native_product_request','transition_native_product_request'].includes(name));try{return {data:JSON.parse(await sql(`set role service_role;select public.${name}(${Object.entries(args).map(([k,v])=>k+'=>'+q(v)).join(',')});`)),error:null};}catch(error){console.error('LOCAL FIXTURE RPC:',error.message);return {data:null,error};}};
 const client={rpc,read:async(user,id)=>JSON.parse(await sql(`select coalesce((select to_jsonb(n) from public.native_product_requests n where user_id=${q(user)} and product_run_id=${q(id)}),'null'::jsonb);`))};
 const store=nativeRequestStore(client),handler=createNativeRequestHandler({authenticate:async req=>req.headers.get('authorization')==='Bearer fixture-owner'?{id:owner}:req.headers.get('authorization')==='Bearer fixture-foreign'?{id:foreign}:null,ownedRun:async(user,id)=>user===owner&&id===runId?run:null,context:async()=>context,store});
 const server=createServer(async(req,res)=>{try{const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers});const r=await handler(request,runId);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text());}catch{res.writeHead(500);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const send=(user,method='POST')=>fetch(base+'/native-request',{method,headers:{authorization:'Bearer fixture-'+user,origin:base}});
  assert.equal((await send('foreign')).status,404);assert.equal((await send('nobody')).status,401);
  const responses=await Promise.all(Array.from({length:6},()=>send('owner')));for(const r of responses){assert.equal(r.status,200,await r.clone().text());const v=await r.json();assert.equal(v.state,'PREPARED');assert.equal(v.can_dispatch,false);assert.equal(v.native_qualified,false);}
  assert.equal(await sql('select count(*) from public.native_product_requests;'),'1');
  const changed={...context,revision:'e'.repeat(40)},wrong=prepareNativeProductRequest(changed);await assert.rejects(store.prepare(owner,wrong,changed),/conflict/);
  const p=prepareNativeProductRequest(context),act=(action,id=null)=>store.transition(owner,runId,p.request_sha256,action,id);
  for(const [index,query] of [undefined,'','?flow=search&variant=broken','?flow=seat&variant=healthy'].entries()){
   const id=`00000000-0000-4000-8000-${String(31+index).padStart(12,'0')}`,sp={...spec,run_id:id},c={...context,run:{...run,id,spec:sp},specBytes:Buffer.from(JSON.stringify(sp))};
   await sql(`insert into public.runs(id,user_id,journey_id,journey_version_id,access_kind,status,spec,deadline_at) values(${q(id)},${q(owner)},'fernway-seat',${q(version)},'owner','admitted',${q(sp)},now()+interval '10 minutes');`);
   const request={...prepareNativeProductRequest(c)},plan=JSON.parse(c.planBytes);if(query===undefined)delete plan.pages[0].query;else plan.pages[0].query=query;c.planBytes=Buffer.from(JSON.stringify(plan));request.plan_sha256=request.plan_bytes_sha256=sha256(c.planBytes);request.request_sha256=sha256(stable(Object.fromEntries(Object.entries(request).filter(([k])=>k!=='request_sha256'))));
   await assert.rejects(store.prepare(owner,request,c),/binding/);assert.equal(await sql(`select count(*) from public.native_product_requests where product_run_id=${q(id)};`),'0');
  }
  let sends=0;const lost=()=>recordNativeDispatch({userId:owner,runId,requestSha256:p.request_sha256,store,send:async()=>{sends++;throw Error('accepted request response lost at controlled boundary');}});
  assert.equal((await lost()).state,'DISPATCH_UNKNOWN');assert.equal((await lost()).state,'DISPATCH_UNKNOWN');assert.equal(sends,1);await assert.rejects(act('intent'),/transition/);
  await act('accepted','123');await act('accepted','123');await assert.rejects(act('accepted','124'),/conflict/);
  assert.equal((await (await send('owner','GET')).json()).state,'DISPATCH_ACCEPTED');assert.equal((await send('foreign','GET')).status,404);
  const b={...baseBinding(),fixtures:[{id:p.page_id,sha256:p.fixture_sha256}],plan_sha256:p.plan_sha256,reviewed_sha256:p.r2_source_sha256,qualification_sha256:p.qualification_sha256},bindingHandler=createNativeBindingHandler({configuration:()=>({...configuration(b),binding:b}),keys:()=>jwks,client:()=>({load:id=>client.read(owner,id),bind:(user,id,hash,gh)=>store.transition(user,id,hash,'bound',gh)})});
  const bindingRequest=jwt=>new Request('https://owner-app.example/api/r2/product-binding',{method:'POST',headers:{authorization:'Bearer '+jwt},body:JSON.stringify({product_run_id:runId,request_sha256:p.request_sha256,github_run_id:'123'})});
  assert.equal((await bindingHandler(bindingRequest(token(claims({run_id:'124'}))))).status,403);
  const bound=await bindingHandler(bindingRequest(token()));assert.equal(bound.status,200);assert.equal((await bound.json()).state,'RUN_BOUND');assert.equal((await (await send('owner','GET')).json()).native_qualified,false);
  assert.equal((await bindingHandler(bindingRequest(token()))).status,200);
  const saved=await client.read(owner,runId),dir=await mkdtemp(join(tmpdir(),'tabwise-native-delivery-')),packetContext={...context,specBytes:Buffer.from(saved.spec_text),planBytes:Buffer.from(saved.plan_text),fixture:Buffer.from(saved.fixture_text)};
  const packet=writeNativeRequestPackage({request:saved.request,context:packetContext,outputDir:join(dir,'candidate')});assert.equal(packet.execution_authorized,false);assert.equal(packet.native_qualified,false);assert.deepEqual(await readFile(join(dir,'candidate/fixture.html')),fixture);assert.throws(()=>writeNativeRequestPackage({request:saved.request,context:packetContext,outputDir:join(dir,'candidate')}));assert.throws(()=>writeNativeRequestPackage({request:saved.request,context:{...packetContext,fixture:Buffer.from('tampered')},outputDir:join(dir,'bad')}));
  const secondId='00000000-0000-4000-8000-000000000012',secondSpec={...spec,run_id:secondId},secondContext={...context,run:{...run,id:secondId,spec:secondSpec},specBytes:Buffer.from(JSON.stringify(secondSpec))};
  await sql(`insert into public.runs(id,user_id,journey_id,journey_version_id,access_kind,status,spec,deadline_at) values(${q(secondId)},${q(owner)},'fernway-seat',${q(version)},'owner','admitted',${q(secondSpec)},now()+interval '10 minutes');`);
  const second=prepareNativeProductRequest(secondContext);await store.prepare(owner,second,secondContext);await store.transition(owner,secondId,second.request_sha256,'intent');await assert.rejects(store.transition(owner,secondId,second.request_sha256,'accepted','123'),/unique|duplicate/);
  await assert.rejects(sql(`update public.native_product_requests set fixture_text='tampered' where product_run_id=${q(runId)};`),/immutable/);
  const malformed={...p,revision:'main'};await assert.rejects(store.prepare(owner,malformed,context),/digest/);
  await sql(`set role authenticated;set request.jwt.claims='{"sub":"${foreign}"}';select count(*) from public.native_product_requests;` ).then(s=>assert.equal(s.split('\n').at(-1),'0'));
  await assert.rejects(sql(`set role authenticated;select public.transition_native_product_request(${q(owner)},${q(runId)},${q(p.request_sha256)},'intent',null);`),/permission denied/);
  console.log('MEASURED owned API, six concurrent requests, immutable conflict, uncertain dispatch, no resend, RLS, RPC permissions; no native execution');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
