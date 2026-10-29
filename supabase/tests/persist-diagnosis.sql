begin;
do $$
declare v_owner uuid:='00000000-0000-4000-8000-000000000001'; v_run uuid:='00000000-0000-4000-8000-000000000050'; reservation uuid; first_result jsonb; again jsonb; denied boolean:=false;
begin
 if to_regprocedure('public.persist_diagnosis(uuid,uuid,text,text,text,jsonb,jsonb,uuid,jsonb)') is null then raise exception 'RED: persistence function missing';end if;
 insert into public.runs(id,user_id,journey_id,access_kind,status,evidence_status,deadline_at,spec) values(v_run,v_owner,'fernway-passenger','owner','completed','complete',now(),jsonb_build_object('app_hash',repeat('a',64)));
 reservation:=(public.reserve_hosted(1000000,v_run)->>'id')::uuid;perform public.settle_hosted(reservation,0);
 first_result:=public.persist_diagnosis(v_owner,v_run,'muse-spark-1.3',repeat('b',64),repeat('c',64),'{"verdict":"no_barrier","abstention_reason":null,"findings":[]}','{"input_tokens":1,"output_tokens":1}',reservation,'[]');
 again:=public.persist_diagnosis(v_owner,v_run,'muse-spark-1.3',repeat('b',64),repeat('c',64),'{"verdict":"no_barrier","abstention_reason":null,"findings":[]}','{"input_tokens":1,"output_tokens":1}',reservation,'[]');
 if first_result->>'diagnosis_id' is null or first_result->>'diagnosis_id'<>again->>'diagnosis_id' then raise exception 'persistence idempotency';end if;
 if (select count(*) from public.diagnoses where diagnoses.run_id=v_run)<>1 then raise exception 'duplicate diagnosis';end if;
 begin perform public.persist_diagnosis('00000000-0000-4000-8000-000000000002',v_run,'muse-spark-1.3',repeat('d',64),repeat('e',64),'{}','{}',reservation,'[]');exception when check_violation then denied:=true;end;
 if not denied then raise exception 'cross-user persistence accepted';end if;
 if has_function_privilege('authenticated','public.persist_diagnosis(uuid,uuid,text,text,text,jsonb,jsonb,uuid,jsonb)','execute') then raise exception 'browser mutation granted';end if;
end $$;
select 'PASS atomic diagnosis persistence, idempotency, owner restriction and browser denial' as result;
rollback;
