-- Authenticated request-bound claims only, behind disabled recovery policy. No native permission.
create function public.recover_native_worker(p_user uuid,p_run uuid,p_request_sha text,p_gh_run_id text,p_nonce uuid,p_jti_sha text) returns jsonb language plpgsql set search_path='' as $$
declare n public.native_product_requests;
begin
 select * into n from public.native_product_requests where product_run_id=p_run and user_id=p_user for update;
 if not found or n.request_sha256 is distinct from p_request_sha or n.dispatch_nonce is distinct from p_nonce or n.claim_expires_at is null or n.claim_expires_at<=clock_timestamp() or coalesce(p_gh_run_id,'')!~'^[1-9][0-9]{0,19}$' or coalesce(p_jti_sha,'')!~'^[a-f0-9]{64}$' then raise check_violation using message='native recovery binding refused';end if;
 if not exists(select from public.run_producers where product_run_id=p_run and user_id=p_user and producer='native-r2') then raise check_violation using message='native producer required';end if;
 if n.github_run_id is null and n.state in ('DISPATCH_INTENT','DISPATCH_UNKNOWN') then perform public.transition_native_product_request(p_user,p_run,p_request_sha,'accepted',p_gh_run_id);
 elsif n.github_run_id is distinct from p_gh_run_id or n.state not in ('DISPATCH_ACCEPTED','RUN_BOUND') then raise check_violation using message='native recovery execution conflict';end if;
 return public.bind_native_worker(p_user,p_run,p_request_sha,p_gh_run_id,p_nonce,p_jti_sha);
end $$;
revoke all on function public.recover_native_worker(uuid,uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.recover_native_worker(uuid,uuid,text,text,uuid,text) to service_role;
