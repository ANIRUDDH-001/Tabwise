-- A successful raw/separate-runner replay is persisted only by the trusted
-- candidate ingester. This function cannot activate production evidence/flags.
alter table public.candidate_native_runs add column readback_sha256 text check(readback_sha256 ~ '^[a-f0-9]{64}$');
create function public.finish_candidate_native_evidence(p_user uuid,p_run uuid,p_request_sha text,p_gh_run_id text,p_readback jsonb,p_sha text) returns jsonb language plpgsql set search_path='' as $$
declare r public.candidate_native_runs;
begin
 select * into r from public.candidate_native_runs where product_run_id=p_run and user_id=p_user for update;
 if not found or r.request->>'request_sha256' is distinct from p_request_sha or r.github_run_id is distinct from p_gh_run_id or r.state not in ('RUN_BOUND','EVIDENCE_READY') then raise check_violation using message='owned bound candidate required';end if;
 if coalesce(p_readback->>'schema'<>'tabwise-candidate-stored-evidence/1' or p_readback->>'classification'<>'NONPRODUCTION_UNQUALIFIED'
 or p_readback->>'production_qualified'<>'false' or p_readback->>'native_interaction_pass'<>'true' or p_readback->>'product_run_id'<>p_run::text or p_readback->>'request_sha256'<>p_request_sha
 or p_readback->>'github_run_id'<>p_gh_run_id or p_readback->>'revision'<>r.request->>'revision'
 or not(p_readback->>'run_manifest_sha256' ~ '^[a-f0-9]{64}$') or jsonb_typeof(p_readback->'rows')<>'array' or jsonb_array_length(p_readback->'rows')<1 or jsonb_array_length(p_readback->'rows')>1000
 or octet_length(p_readback::text)>2000000 or p_readback->'runtime'->>'schema'<>'tabwise-native-runtime/2'
 or not(p_readback->'archives'->'native'->>'sha256' ~ '^[a-f0-9]{64}$') or not(p_readback->'archives'->'readback'->>'sha256' ~ '^[a-f0-9]{64}$')
 or not(p_sha ~ '^[a-f0-9]{64}$'),true) then raise check_violation using message='candidate verified readback required';end if;
 if r.state='EVIDENCE_READY' then
  if r.readback=p_readback and r.readback_sha256=p_sha then return to_jsonb(r);end if;
  raise check_violation using message='immutable candidate readback conflict';
 end if;
 update public.candidate_native_runs set state='EVIDENCE_READY',readback=p_readback,readback_sha256=p_sha,artifact_id=p_readback->'archives'->'native'->>'id',updated_at=now() where product_run_id=p_run returning * into r;return to_jsonb(r);
end $$;
revoke all on function public.finish_candidate_native_evidence(uuid,uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.finish_candidate_native_evidence(uuid,uuid,text,text,jsonb,text) to service_role;
