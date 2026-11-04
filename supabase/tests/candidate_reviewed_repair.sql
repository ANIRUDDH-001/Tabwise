-- Synthetic SQL boundary controls only; never native evidence.
begin;
do $$ begin
 if has_function_privilege('anon','public.create_candidate_repair_run(uuid,uuid,text,jsonb,text,text)','EXECUTE') or has_function_privilege('authenticated','public.create_candidate_repair_run(uuid,uuid,text,jsonb,text,text)','EXECUTE') then raise exception 'repair service boundary leaked';end if;
 if not has_function_privilege('service_role','public.create_candidate_repair_run(uuid,uuid,text,jsonb,text,text)','EXECUTE') then raise exception 'service repair unavailable';end if;
 begin perform public.create_candidate_repair_run(gen_random_uuid(),gen_random_uuid(),'wrong','{}','','');raise exception 'unknown source/review accepted';exception when check_violation then null;end;
end $$;
rollback;
