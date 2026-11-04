begin;
do $$ begin
 if has_table_privilege('authenticated','public.candidate_repair_comparisons','INSERT') or has_table_privilege('anon','public.candidate_repair_comparisons','SELECT') or has_table_privilege('service_role','public.candidate_repair_comparisons','UPDATE') then raise exception 'comparison immutable/private boundary';end if;
 if has_function_privilege('authenticated','public.finish_candidate_repair_comparison(uuid,uuid,jsonb,text,text)','EXECUTE') then raise exception 'browser comparison writer';end if;
 begin perform public.finish_candidate_repair_comparison(gen_random_uuid(),gen_random_uuid(),'{}','{}',repeat('a',64));raise exception 'unknown comparison accepted';exception when check_violation then null;end;
end $$;
rollback;
