-- Read-only production assertions. No fixture inserts, permission changes or execution.
begin read only;
do $$declare t text;p record;begin
 foreach t in array array['repair_applications','repair_reruns','repair_oracles','repair_verdicts','native_product_requests','run_producers','native_worker_claims','native_ingestions'] loop
  if not exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t and c.relrowsecurity) then raise exception 'missing table or RLS: %',t;end if;
  if has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE') then raise exception 'browser grants: %',t;end if;
  if not has_table_privilege('service_role','public.'||t,'SELECT') then raise exception 'service read absent: %',t;end if;
 end loop;
 for p in select fn.* from pg_proc fn join pg_namespace n on n.oid=fn.pronamespace where n.nspname='public' loop
  if p.prosecdef then raise exception 'unexpected security definer: %',p.proname;end if;
  if not ('search_path=""'=any(coalesce(p.proconfig,'{}'))) then raise exception 'unsafe search path: %',p.proname;end if;
  if has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') then raise exception 'browser function execute: %',p.proname;end if;
 end loop;
 if exists(select verify_run_id from public.verifications where verify_run_id is not null group by verify_run_id having count(*)>1) then raise exception 'duplicate verification';end if;
 if exists(select from public.system_flags where diagnosis_mode<>'off' or worker_review_verdict<>'PENDING' or actions_policy_cleared) then raise exception 'preview gates changed';end if;
end$$;
select 'PASS schema/permission/gate assertions' as result;
rollback;
