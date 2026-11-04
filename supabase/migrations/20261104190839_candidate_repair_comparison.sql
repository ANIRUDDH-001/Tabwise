create table public.candidate_repair_comparisons(
 product_run_id uuid primary key references public.candidate_native_runs(product_run_id),
 user_id uuid not null,
 baseline_run_id uuid not null references public.candidate_native_runs(product_run_id),
 result jsonb not null,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now()
);
alter table public.candidate_repair_comparisons enable row level security;
revoke all on public.candidate_repair_comparisons from public,anon,authenticated,service_role;
grant select on public.candidate_repair_comparisons to authenticated;
grant select,insert on public.candidate_repair_comparisons to service_role;
create policy candidate_comparison_owned_read on public.candidate_repair_comparisons for select to authenticated using(user_id=(select auth.uid()));
create function public.finish_candidate_repair_comparison(p_user uuid,p_run uuid,p_result jsonb,p_canonical text,p_sha text) returns jsonb language plpgsql set search_path='' as $$
declare r public.candidate_native_runs;b public.candidate_native_runs;c public.candidate_repair_comparisons;
begin
 select * into r from public.candidate_native_runs where product_run_id=p_run and user_id=p_user for update;
 if not found or r.state<>'EVIDENCE_READY' or r.repair is null then raise check_violation using message='owned complete repair required';end if;
 select * into b from public.candidate_native_runs where product_run_id=(r.repair->>'baseline_run_id')::uuid and user_id=p_user;
 if not found or b.state<>'EVIDENCE_READY' or b.repair is not null then raise check_violation using message='owned complete baseline required';end if;
 if coalesce(length(p_canonical)>100000 or p_canonical::jsonb<>p_result or encode(sha256(convert_to(p_canonical,'UTF8')),'hex')<>p_sha
 or p_result->>'schema'<>'tabwise-candidate-repair-comparison/1' or p_result->>'classification'<>'NONPRODUCTION_UNQUALIFIED' or p_result->>'production_qualified'<>'false' or p_result->>'independent_qualification'<>'false'
 or p_result->>'evidence_class'<>'MACHINE' or p_result->>'independence'<>'L3'
 or p_result->>'product_run_id'<>p_run::text or p_result->>'baseline_run_id'<>b.product_run_id::text
 or p_result->>'patch_sha256'<>r.repair->>'patch_sha256' or p_result->>'base_sha256'<>b.spec->>'app_hash' or p_result->>'source_sha256'<>r.spec->>'app_hash'
 or p_result->>'baseline_readback_sha256'<>b.readback_sha256 or p_result->>'rerun_readback_sha256'<>r.readback_sha256
 or p_result->>'baseline_workflow_id'<>b.github_run_id or p_result->>'rerun_workflow_id'<>r.github_run_id
 or p_result->>'verdict' not in ('FIXED','NOT_FIXED','REGRESSED','INCONCLUSIVE')
 or (p_result->>'verdict'='FIXED' and p_result->'checks'<>'{"symptom_gone":true,"other_steps_preserved":true,"evidence_complete":true}'::jsonb),true) then raise check_violation using message='source-bound candidate comparison required';end if;
 select * into c from public.candidate_repair_comparisons where product_run_id=p_run;
 if found then if c.user_id<>p_user or c.sha256<>p_sha or c.result<>p_result then raise check_violation using message='immutable comparison conflict';end if;return to_jsonb(c);end if;
 insert into public.candidate_repair_comparisons(product_run_id,user_id,baseline_run_id,result,sha256) values(p_run,p_user,b.product_run_id,p_result,p_sha) returning * into c;
 return to_jsonb(c);
end $$;
revoke all on function public.finish_candidate_repair_comparison(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.finish_candidate_repair_comparison(uuid,uuid,jsonb,text,text) to service_role;
