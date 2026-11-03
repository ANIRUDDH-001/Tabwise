import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const db=process.env.TABWISE_R3_RERUN_DB,enabled=/^r3continue[0-9]*$/.test(db??'');
function sql(text){return new Promise((resolve,reject)=>{const p=spawn(process.env.TABWISE_R3_PSQL??'psql',['-X','-h','127.0.0.1','-p','55439','-U','r3test','-d',db,'-v','ON_ERROR_STOP=1','-At','-c',text],{windowsHide:true,env:{...process.env,PGPASSWORD:''}});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',c=>c?reject(Error(err)):resolve(out.trim()));});}
const owner='00000000-0000-4000-8000-000000000001',baseline='00000000-0000-4000-8000-000000000090',version='00000000-0000-4000-8000-000000000091',patch='00000000-0000-4000-8000-000000000092';
test('real concurrent rerun admission keeps gates, exact hashes, immutable binding, replay and ownership',{skip:!enabled},async()=>{
 await sql(`insert into public.operators values('${owner}','offline-r3');
 update public.apps set base_sha256=encode(sha256(convert_to('base','UTF8')),'hex') where id='fernway';
 insert into public.journey_versions(id,journey_id,user_id,n,steps,sha256) values('${version}','fernway-passenger','${owner}',1,'[{"step":1,"key":"Tab","text":null,"checkpoint":true}]',repeat('a',64));
 insert into public.runs(id,user_id,journey_id,journey_version_id,access_kind,status,evidence_status,deadline_at,spec) select '${baseline}','${owner}','fernway-passenger','${version}','owner','completed','complete',now(),jsonb_build_object('app_hash',encode(sha256(convert_to('base','UTF8')),'hex'),'steps',steps) from public.journey_versions where id='${version}';
 insert into public.findings(id,run_id,source,step,title,evidence_refs) values('00000000-0000-4000-8000-000000000093','${baseline}','spark',1,'Synthetic database oracle fixture',array['synthetic:1']);
 insert into public.patches(id,run_id,finding_id,diff,files,validator) values('${patch}','${baseline}','00000000-0000-4000-8000-000000000093','diff',array['index.html'],jsonb_build_object('ok',true,'contract',jsonb_build_object('run_id','${baseline}','base_sha256',encode(sha256(convert_to('base','UTF8')),'hex'),'patch_sha256',encode(sha256(convert_to('diff','UTF8')),'hex'))));
 select public.review_patch('${owner}','${patch}','approved',encode(sha256(convert_to('diff','UTF8')),'hex'));
 select public.materialize_repair('${owner}','${patch}',encode(sha256(convert_to('diff','UTF8')),'hex'),'base','candidate',encode(sha256(convert_to('candidate','UTF8')),'hex'));`);
 const call=key=>`select public.admit_repair('${owner}','${version}','${patch}','${key}')`;
 assert.equal(JSON.parse(await sql(call('no-oracle'))).reason,'repair_oracle_required');
 assert.equal(await sql(`select count(*) from public.admission_requests where user_id='${owner}'`),'0');
 await sql(`select public.register_repair_oracle('${owner}','${patch}','validation',1,'Synthetic pre-admission review');`);
 assert.equal(JSON.parse(await sql(call('gate-off'))).reason,'worker_review_pending');
 await sql(`update public.system_flags set worker_review_verdict='PASS',worker_review_ref='synthetic-local-only';insert into public.capacity_snapshots(db_bytes,storage_bytes,gh_rate_remaining,est_egress_bytes) values(0,0,5000,0);`);
 await sql(`update public.apps set base_sha256=repeat('0',64) where id='fernway'`);
 await assert.rejects(()=>sql(call('stale-source')),/stale/);
 await sql(`update public.apps set base_sha256=encode(sha256(convert_to('base','UTF8')),'hex') where id='fernway'`);
 const results=await Promise.all([sql(call('concurrent')),sql(call('concurrent'))]);const a=results.map(JSON.parse);assert.equal(a[0].run_id,a[1].run_id);assert.ok(a[0].run_id);assert.equal(a.filter(v=>v.replayed===true).length,1);
 assert.equal(await sql(`select count(*) from public.repair_reruns where verify_run_id='${a[0].run_id}'`),'1');
 const spec=JSON.parse(await sql(`select spec from public.runs where id='${a[0].run_id}'`));assert.equal(spec.variant,'patched');
 assert.equal(await sql(`select (r.spec->>'app_hash'=a.source_sha256 and r.spec->>'patch_ref'=a.patch_sha256 and r.kind='verify') from public.runs r join public.repair_reruns b on b.verify_run_id=r.id join public.repair_applications a on a.id=b.application_id where r.id='${a[0].run_id}'`),'t');
 await assert.rejects(()=>sql(`select public.admit_repair('00000000-0000-4000-8000-000000000099','${version}','${patch}','foreign')`),/owned/);
 await assert.rejects(()=>sql(`select public.admit_repair('${owner}','00000000-0000-4000-8000-000000000099','${patch}','concurrent')`),/idempotency/);
 await assert.rejects(()=>sql(`update public.repair_reruns set source_sha256=repeat('0',64) where verify_run_id='${a[0].run_id}'`),/immutable/);
 assert.equal(await sql(`select has_function_privilege('authenticated','public.admit_repair(uuid,uuid,uuid,text)','execute')`),'f');
 assert.equal(await sql(`select base_source from public.repair_applications where patch_id='${patch}'`),'base');
});

test('oracle admission/dispatch gate covers concurrent registration, legacy replay and rejection',{skip:!enabled},async()=>{
 const o='00000000-0000-4000-8000-000000000104',b='00000000-0000-4000-8000-000000000105',p='00000000-0000-4000-8000-000000000106',v='00000000-0000-4000-8000-000000000108',f='00000000-0000-4000-8000-000000000109',legacy='00000000-0000-4000-8000-000000000111',rejected='00000000-0000-4000-8000-000000000112';
 await sql(`insert into public.operators values('${o}','bounded-oracle-fixture');
 insert into public.journey_versions(id,journey_id,user_id,n,steps,sha256) values('${v}','fernway-passenger','${o}',1,'[{"step":1,"key":"Tab","text":null,"checkpoint":true}]',repeat('a',64));
 insert into public.runs(id,user_id,journey_id,journey_version_id,access_kind,status,evidence_status,deadline_at,spec) select '${b}','${o}','fernway-passenger','${v}','owner','completed','complete',now(),jsonb_build_object('app_hash',encode(sha256(convert_to('base','UTF8')),'hex'),'steps',steps) from public.journey_versions where id='${v}';
 insert into public.findings(id,run_id,source,step,title,evidence_refs) values('${f}','${b}','spark',1,'Synthetic bounded oracle fixture',array['synthetic:1']);
 insert into public.patches(id,run_id,finding_id,diff,files,validator) values('${p}','${b}','${f}','diff',array['index.html'],jsonb_build_object('ok',true,'contract',jsonb_build_object('run_id','${b}','base_sha256',encode(sha256(convert_to('base','UTF8')),'hex'),'patch_sha256',encode(sha256(convert_to('diff','UTF8')),'hex'))));
 select public.review_patch('${o}','${p}','approved',encode(sha256(convert_to('diff','UTF8')),'hex'));
 select public.materialize_repair('${o}','${p}',encode(sha256(convert_to('diff','UTF8')),'hex'),'base','candidate',encode(sha256(convert_to('candidate','UTF8')),'hex'));
 insert into public.patches(id,run_id,diff,files,validator,status,reviewed_by) values('${rejected}','${b}','wrong',array['index.html'],'{}','rejected','${o}');`);
 const admit=key=>`select public.admit_repair('${o}','${v}','${p}','${key}')`;
 const absent=await Promise.all([sql(admit('missing-a')),sql(admit('missing-b'))]);assert.ok(absent.map(JSON.parse).every(x=>x.reason==='repair_oracle_required'));
 assert.equal(await sql(`select count(*) from public.runs where user_id='${o}' and kind='verify'`),'0');
 assert.equal(await sql(`select count(*) from public.admission_requests where user_id='${o}'`),'0');
 await assert.rejects(()=>sql(`select public.admit_repair('${o}','${v}','${rejected}','rejected')`),/approved owned/);
 await assert.rejects(()=>sql(`select public.register_repair_oracle('00000000-0000-4000-8000-000000000099','${p}','validation',1,'Synthetic review')`),/owned/);
 await assert.rejects(()=>sql(`select public.register_repair_oracle('${o}','${p}','validation',2,'Synthetic wrong step')`),/finding/);
 // Even malformed service-inserted oracle records cannot satisfy the immutable owner/source/step tuple.
 for(const [oracleOwner,oracleBase,oracleHash,oracleStep] of [
  ['00000000-0000-4000-8000-000000000099',b,`encode(sha256(convert_to('base','UTF8')),'hex')`,1],
  [o,'00000000-0000-4000-8000-000000000090',`encode(sha256(convert_to('base','UTF8')),'hex')`,1],
  [o,b,`repeat('0',64)`,1],[o,b,`encode(sha256(convert_to('base','UTF8')),'hex')`,2]
 ]){
  await sql(`begin;insert into public.repair_oracles values('${p}','${oracleOwner}','${oracleBase}',${oracleHash},'validation',${oracleStep},'${oracleOwner}','Synthetic invalid tuple');
   do $probe$ begin
    if public.admit_repair('${o}','${v}','${p}','invalid-tuple')->>'reason' is distinct from 'repair_oracle_required' then raise exception 'mismatched oracle admitted';end if;
    if exists(select from public.runs where user_id='${o}' and kind='verify') then raise exception 'oracle refusal created a run';end if;
   end $probe$;rollback;`);
 }
 // A historical admitted row must be unable to bypass the new admission check by replay/claim.
 await sql(`begin;insert into public.runs(id,user_id,journey_id,kind,access_kind,status,deadline_at,spec) values('${legacy}','${o}','fernway-passenger','verify','owner','admitted',now()+interval '10 minutes',jsonb_build_object('app_hash',encode(sha256(convert_to('candidate','UTF8')),'hex'),'patch_ref',encode(sha256(convert_to('diff','UTF8')),'hex')));
 insert into public.repair_reruns select '${legacy}',id,'${b}',source_sha256,patch_sha256,'${o}','legacy','${v}' from public.repair_applications where patch_id='${p}';
 do $probe$ declare refused boolean:=false;begin
  begin perform public.run_transition('${legacy}','admitted','dispatching',null);exception when check_violation then refused:=true;end;
  if not refused then raise exception 'oracle-free legacy dispatch accepted';end if;
  if (select status from public.runs where id='${legacy}')<>'admitted' then raise exception 'refused claim changed status';end if;
 end $probe$;rollback;`);
 const registration=`select public.register_repair_oracle('${o}','${p}','validation',1,'Synthetic bounded review')`;
 const race=await Promise.all([sql(registration),sql(admit('registration-race'))]);
 const raced=JSON.parse(race[1]);assert.ok(raced.run_id||raced.reason==='repair_oracle_required');
 const accepted=JSON.parse(await sql(admit('registration-race')));assert.ok(accepted.run_id);
 assert.equal(await sql(`select count(*) from public.repair_reruns where user_id='${o}' and request_key='registration-race'`),'1');
 await sql(`select public.run_transition('${accepted.run_id}','admitted','dispatching',null)`);
 await sql(registration);
 assert.equal(await sql(`select count(*) from public.audit_log where action='repair_oracle_registered' and subject='${p}'`),'1');
 await assert.rejects(()=>sql(`update public.repair_oracles set step=2 where patch_id='${p}'`),/immutable/);
 await assert.rejects(()=>sql(`select public.register_repair_oracle('${o}','${p}','focus',1,'Synthetic conflicting review')`),/conflict/);
 await sql(`update public.apps set base_sha256=repeat('0',64) where id='fernway';update public.system_flags set worker_review_verdict='BLOCK'`);
 const replay=JSON.parse(await sql(admit('registration-race')));assert.equal(replay.run_id,accepted.run_id);assert.equal(replay.replayed,true);
 await assert.rejects(()=>sql(`select public.run_transition('${accepted.run_id}','dispatching','dispatched',null)`),/oracle|binding/);
 await sql(`select public.run_transition('${accepted.run_id}','dispatching','cancelled','synthetic-cleanup');update public.apps set base_sha256=encode(sha256(convert_to('base','UTF8')),'hex') where id='fernway'`);
});
