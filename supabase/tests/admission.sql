-- Dedicated Tabwise project only; all test data and flag changes roll back.
begin;
do $$
declare a jsonb; b jsonb; o jsonb; rid uuid; denied boolean := false;
begin
  if to_regprocedure('public.admit_run(uuid,text,text,text)') is null then raise exception 'RED: admission function missing'; end if;
  insert into public.operators(user_id, github_id) values ('00000000-0000-4000-8000-000000000099','test-owner');
  update public.system_flags set dispatch_mode='public',worker_review_verdict='PASS',actions_policy_cleared=true,policy_ref='synthetic-policy',worker_review_ref='synthetic-review',public_daily_dispatch_limit=5;
  insert into public.capacity_snapshots(db_bytes,storage_bytes,gh_rate_remaining,est_egress_bytes) values (0,0,5000,0);
  a:= public.admit_run('00000000-0000-4000-8000-000000000001','public','fernway-passenger','test-a');
  if a->>'status' <> 'admitted' then raise exception 'first public admission: %',a; end if;
  b:= public.admit_run('00000000-0000-4000-8000-000000000002','public','fernway-passenger','test-b');
  if b->>'reason' <> 'no_public_slot' then raise exception 'public slot not bounded: %',b; end if;
  if b <> public.admit_run('00000000-0000-4000-8000-000000000002','public','fernway-passenger','test-b') then raise exception 'rejection idempotency'; end if;
  o:= public.admit_run('00000000-0000-4000-8000-000000000099','owner','fernway-seat','test-owner');
  if o->>'status' <> 'admitted' then raise exception 'reserved owner slot: %',o; end if;
  if a <> public.admit_run('00000000-0000-4000-8000-000000000001','public','fernway-passenger','test-a') then raise exception 'success idempotency'; end if;
  rid := (a->>'run_id')::uuid;
  begin perform public.run_transition(rid,'admitted','completed',null); exception when check_violation then denied:=true; end;
  if not denied then raise exception 'illegal transition accepted'; end if;
  update public.runs set deadline_at=now()-interval '1 second' where id=rid;
  perform public.admit_run('00000000-0000-4000-8000-000000000003','public','fernway-passenger','timeout-check');
  if (select status from public.runs where id=rid) <> 'timed_out' then raise exception 'lazy timeout missing'; end if;
  update public.system_flags set public_daily_dispatch_limit=0;
  b:=public.admit_run('00000000-0000-4000-8000-000000000004','public','fernway-search','lowered-limit');
  if b->>'reason' <> 'global_daily' then raise exception 'dynamic limit: %',b; end if;
  perform public.kill_switch('test');
  if exists(select from public.system_flags where dispatch_mode<>'off' or diagnosis_mode<>'off') then raise exception 'kill switch'; end if;
  if has_function_privilege('anon','public.admit_run(uuid,text,text,text)','execute') or has_function_privilege('authenticated','public.admit_run(uuid,text,text,text)','execute') then raise exception 'RPC exposed to browser'; end if;
  if exists(select from pg_tables where schemaname='public' and not rowsecurity) then raise exception 'RLS disabled'; end if;
end $$;
select 'PASS admission, idempotency, reserved slot, transitions, lazy timeout, dynamic limits, kill switch, RPC permissions, RLS' as result;
rollback;
