// Explicit isolated-server preload. Every provider call is faked or refused; no hosted DB/API.
import {readFileSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const original=globalThis.fetch,owner='00000000-0000-4000-8000-000000000001',version='00000000-0000-4000-8000-000000000021';
const hash=s=>createHash('sha256').update(s).digest('hex');
const steps=[{step:1,key:'Tab',text:null,checkpoint:true}],versions=[{id:version,user_id:owner,journey_id:'fernway-seat',n:1,steps,sha256:'d'.repeat(64),created_at:'2026-11-04T00:00:00Z'}];
const runs=['11','12','13'].map((n,i)=>{const id='00000000-0000-4000-8000-0000000000'+n;return {id,user_id:owner,journey_version_id:version,journey_id:'fernway-seat',kind:'baseline',status:['completed','admitted','dispatched'][i],evidence_status:i===0?'complete':'pending',gh_run_id:i===2?'123':null,deadline_at:'2000-01-01T00:00:00Z',created_at:'2026-11-04T00:00:00Z',spec:{version:'0.1.0',run_id:id,journey_id:'fernway-seat',app_hash:hash(readFileSync('../fixtures/fernway/index.html','utf8').replaceAll('\r\n','\n')),variant:'broken',steps}};});
let native=null;
function audit(kind,path,method){appendFileSync(process.env.TABWISE_PREVIEW_TEST_AUDIT,JSON.stringify({kind,path,method})+'\n');}
globalThis.fetch=async(input,init={})=>{
 const req=new Request(input,init),url=new URL(req.url);
 if(['127.0.0.1','localhost'].includes(url.hostname))return original(input,init);
 if(url.hostname!=='ueobjrtvsgvkigmjxkks.supabase.co'){audit('forbidden-external',url.hostname,req.method);throw Error('test refuses all nonfixture providers');}
 audit('fixture',url.pathname,req.method);
 const reply=value=>Response.json(value);
 if(url.pathname==='/auth/v1/user')return reply({id:owner,aud:'authenticated',role:'authenticated',app_metadata:{provider:'github'},user_metadata:{}});
 if(url.pathname==='/rest/v1/system_flags')return reply({dispatch_mode:'public',diagnosis_mode:'public',worker_review_verdict:'PASS',worker_review_ref:'fixture-approved',actions_policy_cleared:true,qualification_ref:'fixture-qualified',approved_worker_shas:['a'.repeat(40)]});
 if(url.pathname.startsWith('/rest/v1/rpc/')){
  const name=url.pathname.split('/').at(-1),args=await req.json();
  if(name==='admit_repair')return reply({reason:'production_fixture_admission_reached',http_status:409});
  if(name==='admit_version')return reply({run_id:runs[1].id,status:'admitted'});
  if(name==='register_run_producer')return reply({product_run_id:runs[1].id,user_id:owner,producer:'native-r2'});
  if(name==='prepare_native_product_request'){native={product_run_id:runs[1].id,user_id:owner,state:'PREPARED',request_sha256:args.p_request.request_sha256,github_run_id:null};return reply(native);}
  throw Error('unexpected fixture RPC '+name);
 }
 const table=url.pathname.split('/').at(-1),single=req.headers.get('accept')?.includes('vnd.pgrst.object');
 if(table==='journey_versions'&&req.method==='POST'){const data=await req.json(),row={...data,id:'00000000-0000-4000-8000-'+String(100+versions.length).padStart(12,'0'),created_at:'2026-11-04T00:00:00Z'};versions.push(row);return reply(row);}
 let rows=table==='runs'?runs:table==='journey_versions'?versions:table==='native_product_requests'?(native?[native]:[]):table==='run_producers'?[{product_run_id:runs[2].id,user_id:owner,producer:'legacy'}]:table==='journeys'?[{id:'fernway-seat',app_id:'fernway',name:'Seat',supported:true}]:[];
 for(const [key,value] of url.searchParams)if(value.startsWith('eq.'))rows=rows.filter(row=>String(row[key])===value.slice(3));
 if(url.searchParams.get('order')?.startsWith('n.desc'))rows=[...rows].sort((a,b)=>b.n-a.n);
 if(url.searchParams.has('limit'))rows=rows.slice(0,Number(url.searchParams.get('limit')));
 return reply(single?rows[0]??null:rows);
};
