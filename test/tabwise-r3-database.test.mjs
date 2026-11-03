// Opt-in isolated local PostgreSQL only. Never uses deployed credentials.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const enabled=process.env.TABWISE_R3_LOCAL_DB==='r3final';
function sql(text){return new Promise((resolve,reject)=>{const child=spawn(process.env.TABWISE_R3_PSQL??'psql',['-X','-h','127.0.0.1','-p','55439','-U','r3test','-d','r3final','-v','ON_ERROR_STOP=1','-At','-c',text],{windowsHide:true,env:{...process.env,PGPASSWORD:''}});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>code?reject(Error(err)):resolve(out.trim()));});}
test('actual concurrent requests serialize, recover one candidate, append one audit and freeze approval',{skip:!enabled},async()=>{
 await sql(`update public.apps set base_sha256=encode(sha256(convert_to('base','UTF8')),'hex') where id='fernway';
 insert into public.runs(id,user_id,journey_id,access_kind,status,evidence_status,deadline_at,spec) values('00000000-0000-4000-8000-000000000080','00000000-0000-4000-8000-000000000001','fernway-passenger','owner','completed','complete',now(),jsonb_build_object('app_hash',encode(sha256(convert_to('base','UTF8')),'hex')));
 insert into public.patches(id,run_id,diff,files,validator) values('00000000-0000-4000-8000-000000000081','00000000-0000-4000-8000-000000000080','diff',array['index.html'],jsonb_build_object('ok',true,'contract',jsonb_build_object('run_id','00000000-0000-4000-8000-000000000080','base_sha256',encode(sha256(convert_to('base','UTF8')),'hex'),'patch_sha256',encode(sha256(convert_to('diff','UTF8')),'hex'))));
 select public.review_patch('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000081','approved',encode(sha256(convert_to('diff','UTF8')),'hex'));`);
 const call=`select public.materialize_repair('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000081',encode(sha256(convert_to('diff','UTF8')),'hex'),'base','candidate',encode(sha256(convert_to('candidate','UTF8')),'hex'));`;
 const results=await Promise.all([sql(call),sql(call)]);const rows=results.map(JSON.parse);assert.equal(rows[0].application_id,rows[1].application_id);assert.deepEqual(rows.map(r=>r.replayed).sort(),[false,true]);
 assert.equal(await sql(`select count(*) from public.audit_log where action='repair_materialized' and detail->>'patch_id'='00000000-0000-4000-8000-000000000081'`),'1');
 await assert.rejects(()=>sql(`update public.patches set status='rejected' where id='00000000-0000-4000-8000-000000000081'`),/immutable/);
});
