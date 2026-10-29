create function public.immutable_record() returns trigger language plpgsql set search_path='' as $$
begin raise check_violation using message='immutable record; create a new version'; end $$;
create trigger immutable_report before update or delete on public.reports for each row execute function public.immutable_record();
create trigger immutable_journey_version before update or delete on public.journey_versions for each row execute function public.immutable_record();
revoke all on function public.immutable_record() from public,anon,authenticated;

create function public.reserve_diagnosis(p_user uuid,p_run uuid,p_worst bigint) returns jsonb language plpgsql set search_path='' as $$
declare f public.system_flags; r public.runs; today timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
begin
 perform pg_advisory_xact_lock(781427);
 select * into f from public.system_flags where singleton for share;
 if f.diagnosis_mode='off' or f.qualification_ref is null then return jsonb_build_object('reason','diagnosis_off'); end if;
 if f.diagnosis_mode='owner' and not exists(select from public.operators where user_id=p_user) then return jsonb_build_object('reason','owner_only'); end if;
 select * into r from public.runs where id=p_run and user_id=p_user;
 if not found or r.status<>'completed' or r.evidence_status<>'complete' then return jsonb_build_object('reason','qualified_evidence_required'); end if;
 if r.access_kind='public' then
  if (select count(*) from public.budget_reservations b join public.runs x on x.id=b.run_id where x.user_id=p_user and x.access_kind='public' and b.created_at>=today)>=3 then return jsonb_build_object('reason','user_daily'); end if;
  if (select count(*) from public.budget_reservations b join public.runs x on x.id=b.run_id where x.access_kind='public' and b.created_at>=today)>=f.public_daily_diagnosis_limit then return jsonb_build_object('reason','global_daily'); end if;
 end if;
 if (select spent_nano+reserved_nano from public.hosted_budget where singleton)>=32000000000 then return jsonb_build_object('reason','budget_headroom'); end if;
 return public.reserve_hosted(p_worst,p_run);
end $$;
revoke all on function public.reserve_diagnosis(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.reserve_diagnosis(uuid,uuid,bigint) to service_role;

create function public.claim_reconcile(p_run uuid) returns boolean language plpgsql set search_path='' as $$
declare n integer;
begin
 update public.runs set lease_until=now()+interval '10 seconds' where id=p_run and status not in ('completed','failed','cancelled','timed_out') and (lease_until is null or lease_until<=now());
 get diagnostics n=row_count;return n=1;
end $$;
revoke all on function public.claim_reconcile(uuid) from public,anon,authenticated;
grant execute on function public.claim_reconcile(uuid) to service_role;
