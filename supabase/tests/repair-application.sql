begin;
do $$
declare owner_id uuid:='00000000-0000-4000-8000-000000000001'; run_id uuid:='00000000-0000-4000-8000-000000000070'; pid uuid; ph text:=encode(sha256(convert_to('synthetic diff','UTF8')),'hex'); bh text:=encode(sha256(convert_to('base','UTF8')),'hex'); sh text:=encode(sha256(convert_to('candidate','UTF8')),'hex'); a jsonb; b jsonb; denied boolean;
begin
 update public.apps set base_sha256=bh where id='fernway';
 insert into public.runs(id,user_id,journey_id,access_kind,status,evidence_status,deadline_at,spec) values(run_id,owner_id,'fernway-passenger','owner','completed','complete',now(),jsonb_build_object('app_hash',bh));
 insert into public.patches(run_id,diff,files,validator) values(run_id,'synthetic diff',array['index.html'],jsonb_build_object('ok',true,'contract',jsonb_build_object('run_id',run_id,'base_sha256',bh,'patch_sha256',ph))) returning id into pid;
 denied:=false;begin perform public.materialize_repair(owner_id,pid,ph,'base','candidate',sh);exception when check_violation then denied:=true;end;if not denied then raise exception 'unapproved accepted';end if;
 perform public.review_patch(owner_id,pid,'approved',ph);
 denied:=false;begin perform public.materialize_repair('00000000-0000-4000-8000-000000000002',pid,ph,'base','candidate',sh);exception when check_violation then denied:=true;end;if not denied then raise exception 'foreign accepted';end if;
 denied:=false;begin perform public.materialize_repair(owner_id,pid,ph,'stale','candidate',sh);exception when check_violation then denied:=true;end;if not denied then raise exception 'stale accepted';end if;
 -- Force a transaction failure after insertion: rollback must retain neither candidate nor audit.
 begin
  a:=public.materialize_repair(owner_id,pid,ph,'base','candidate',sh);
  raise exception 'simulated lost transaction' using errcode='P0002';
 exception when no_data_found then null;end;
 if exists(select from public.repair_applications where patch_id=pid) or exists(select from public.audit_log where action='repair_materialized' and detail->>'patch_id'=pid::text) then raise exception 'rollback left partial writes';end if;
 a:=public.materialize_repair(owner_id,pid,ph,'base','candidate',sh);
 update public.apps set base_sha256=repeat('0',64) where id='fernway';
 b:=public.materialize_repair(owner_id,pid,ph,'base','candidate',sh);
 if a->>'application_id' is distinct from b->>'application_id' or b->>'replayed'<>'true' then raise exception 'recovery not idempotent';end if;
 if (select count(*) from public.audit_log where action='repair_materialized' and detail->>'patch_id'=pid::text)<>1 then raise exception 'duplicate audit';end if;
 denied:=false;begin update public.repair_applications set source='changed' where patch_id=pid;exception when check_violation then denied:=true;end;if not denied then raise exception 'candidate mutable';end if;
 denied:=false;begin delete from public.audit_log where action='repair_materialized';exception when check_violation then denied:=true;end;if not denied then raise exception 'audit mutable';end if;
 denied:=false;begin perform public.materialize_repair(owner_id,pid,ph,'base','other',encode(sha256(convert_to('other','UTF8')),'hex'));exception when check_violation then denied:=true;end;if not denied then raise exception 'replay conflict accepted';end if;
 if has_function_privilege('authenticated','public.materialize_repair(uuid,uuid,text,text,text,text)','execute') or has_table_privilege('anon','public.repair_applications','select') then raise exception 'browser privilege';end if;
 if exists(select from public.verifications where patch_id=pid) then raise exception 'unexpected verification';end if;
end $$;
select 'PASS approval, ownership, stale source, rollback, recovery, immutable candidate/audit, replay conflict, private privileges and no verification' as result;
rollback;
