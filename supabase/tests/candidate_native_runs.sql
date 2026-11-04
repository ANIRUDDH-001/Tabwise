-- Isolated transaction: no native execution, external artifact or production flag.
begin;
insert into public.journey_versions(id,journey_id,user_id,n,steps,sha256) values
 ('c0000000-0000-4000-8000-000000000001','fernway-seat','c0000000-0000-4000-8000-000000000002',991,
 '[{"step":1,"key":"Tab","text":null,"checkpoint":true},{"step":2,"key":"Enter","text":null,"checkpoint":true},{"step":3,"key":"Tab","text":null,"checkpoint":true},{"step":4,"key":"Tab","text":null,"checkpoint":true},{"step":5,"key":"Enter","text":null,"checkpoint":true}]','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
do $$ declare r jsonb; denied boolean:=false; rid uuid; before_flags jsonb; begin
 select to_jsonb(f) into before_flags from public.system_flags f;
 begin perform public.create_candidate_native_run('c0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000001','test');exception when check_violation then denied:=true;end;
 if not denied then raise exception 'foreign owner accepted';end if;
 r:=public.create_candidate_native_run('c0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','test');rid:=(r->>'product_run_id')::uuid;
 if r->>'classification'<>'NONPRODUCTION_UNQUALIFIED' or (r->>'production_qualified')::boolean or r->>'state'<>'SAVED' then raise exception 'candidate class/state';end if;
 if (public.create_candidate_native_run('c0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','test')->>'product_run_id')::uuid<>rid then raise exception 'idempotency changed run';end if;
 denied:=false;begin perform public.transition_candidate_native_run('c0000000-0000-4000-8000-000000000002',rid,repeat('a',64),'intent',null);exception when check_violation then denied:=true;end;
 if not denied then raise exception 'unprepared dispatch accepted';end if;
 denied:=false;begin update public.candidate_native_runs set user_id='c0000000-0000-4000-8000-000000000003' where product_run_id=rid;exception when check_violation then denied:=true;end;
 if not denied then raise exception 'owner changed';end if;
 if (select to_jsonb(f) from public.system_flags f)<>before_flags then raise exception 'production flags changed';end if;
 if has_table_privilege('anon','public.candidate_native_runs','INSERT') or has_table_privilege('authenticated','public.candidate_native_runs','UPDATE') or has_function_privilege('anon','public.create_candidate_native_run(uuid,uuid,text)','EXECUTE') then raise exception 'candidate write privileges leaked';end if;
end $$;
rollback;
