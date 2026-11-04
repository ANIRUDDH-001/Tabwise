import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID,randomInt} from 'node:crypto';
import {prepareOwnedCandidateRepair} from '../lib/server/candidate-repair.mjs';
import {repairContext,OWNER,BASE_SHA,REPAIRED_SHA} from '../../diagnostics/r2-candidate/repair.mjs';
const quote=v=>v===null?'null':"'"+String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")+"'";
const field=k=>k.startsWith('repair->>')?"repair->>"+quote(k.slice(9)):k;
// Send source bytes over UTF-8 stdin, avoiding Windows command-line code-page conversion.
const sql=s=>execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-h','127.0.0.1','-p','55442','-U','g2test','-d','g2local','-At','-q','-v','ON_ERROR_STOP=1','-f','-'],{input:Buffer.from(s,'utf8'),encoding:'utf8',env:{...process.env,PGCLIENTENCODING:'UTF8'},windowsHide:true,timeout:10000}).trim();
test('real SQL candidate repair retains actual reviewed bytes and rejects foreign, swapped and duplicate sources',{skip:process.env.TABWISE_CANDIDATE_LOCAL_DB!=='g2local'},async()=>{
 const version=randomUUID(),baseline=randomUUID(),steps=['Tab','Enter','Tab','Tab','Enter'].map((key,n)=>({step:n+1,key,text:null,checkpoint:true})),spec={version:'0.1.0',run_id:baseline,journey_id:'fernway-seat',variant:'broken',app_hash:BASE_SHA,steps};
 sql(`insert into public.journey_versions(id,journey_id,user_id,n,steps,sha256) values(${quote(version)},'fernway-seat',${quote(OWNER)},${randomInt(10000,99999)},${quote(steps)},${quote('b'.repeat(64))});insert into public.candidate_native_runs(product_run_id,user_id,journey_version_id,idempotency_key,spec,state,readback) values(${quote(baseline)},${quote(OWNER)},${quote(version)},${quote(randomUUID())},${quote(spec)},'EVIDENCE_READY','{"native_interaction_pass":true}');`);
 // The row above is explicitly synthetic SQL setup; not genuine evidence.
 const db={rpc:async(name,args)=>{try{return {data:JSON.parse(sql(`set role service_role;select public.${name}(${Object.entries(args).map(([k,v])=>k+'=>'+quote(v)).join(',')})`))};}catch(error){return {error};}},from:()=>{const filters={},b={select:()=>b,eq:(k,v)=>{filters[k]=v;return b;},maybeSingle:async()=>({data:JSON.parse(sql(`set role service_role;select coalesce((select to_jsonb(c) from public.candidate_native_runs c where ${Object.entries(filters).map(([k,v])=>field(k)+'='+quote(v)).join(' and ')}),'null'::jsonb)`))})};return b;}};
 const args={db,userId:OWNER,baselineId:baseline,key:randomUUID(),sourceRoot:process.cwd(),revision:'a'.repeat(40)},view=await prepareOwnedCandidateRepair(args);
 assert.equal(view.state,'PREPARED');assert.equal(view.repair.baseline_run_id,baseline);assert.equal(view.repair.source_sha256,REPAIRED_SHA);
 assert.equal((await prepareOwnedCandidateRepair(args)).product_run_id,view.product_run_id);
 assert.equal((await prepareOwnedCandidateRepair({...args,key:randomUUID()})).product_run_id,view.product_run_id,'new browser key must recover the same source');
 await assert.rejects(()=>prepareOwnedCandidateRepair({...args,userId:randomUUID()}));
 assert.throws(()=>sql(`update public.candidate_native_runs set repair='{}' where product_run_id=${quote(view.product_run_id)}`));
 const c=repairContext(),call={p_user:OWNER,p_baseline:baseline,p_key:args.key,p_review:{...c.review,decision:'rejected'},p_source:c.base,p_patch:c.patch};
 assert.ok((await db.rpc('create_candidate_repair_run',call)).error);
 sql(`select public.transition_candidate_native_run(${quote(OWNER)},${quote(view.product_run_id)},(select request->>'request_sha256' from public.candidate_native_runs where product_run_id=${quote(view.product_run_id)}),'failed',null);`);
});
