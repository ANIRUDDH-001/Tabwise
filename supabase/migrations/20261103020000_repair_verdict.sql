create table public.repair_oracles(
 patch_id uuid primary key references public.patches,user_id uuid not null,baseline_run_id uuid not null references public.runs,
 base_sha256 text not null check(base_sha256 ~ '^[a-f0-9]{64}$'),kind text not null check(kind in ('validation','status','focus')),
 step integer not null check(step between 1 and 25),reviewed_by uuid not null,review_ref text not null check(length(review_ref) between 1 and 512),
 check(user_id=reviewed_by));
alter table public.repair_oracles enable row level security;
revoke all on public.repair_oracles from public,anon,authenticated;
grant select,insert on public.repair_oracles to service_role;
create trigger immutable_repair_oracle before update or delete on public.repair_oracles for each row execute function public.immutable_record();
create function public.register_repair_oracle(p_user uuid,p_patch uuid,p_kind text,p_step integer,p_review_ref text) returns jsonb language plpgsql set search_path='' as $$
declare p public.patches;b public.runs;o public.repair_oracles;
begin
 perform pg_advisory_xact_lock(781428);
 select * into p from public.patches where id=p_patch and status='approved' and reviewed_by=p_user for share;
 if not found or p_user is null then raise check_violation using message='approved owned patch required';end if;
 select * into b from public.runs where id=p.run_id and user_id=p_user and status='completed' and evidence_status='complete' for share;
 if not found or not exists(select from public.findings where id=p.finding_id and run_id=b.id and step=p_step) then raise check_violation using message='oracle source/finding binding';end if;
 select * into o from public.repair_oracles where patch_id=p.id;
 if found then
  if o.user_id is distinct from p_user or o.kind is distinct from p_kind or o.step is distinct from p_step or o.review_ref is distinct from p_review_ref then raise check_violation using message='oracle replay conflict';end if;
  return to_jsonb(o);
 end if;
 perform vr.id from public.repair_reruns rr join public.runs vr on vr.id=rr.verify_run_id where rr.application_id in(select id from public.repair_applications where patch_id=p.id) for share of vr;
 if exists(select from public.repair_reruns rr join public.runs vr on vr.id=rr.verify_run_id where rr.application_id in(select id from public.repair_applications where patch_id=p.id) and vr.status<>'admitted') then raise check_violation using message='oracle must be registered before rerun dispatch';end if;
 insert into public.repair_oracles values(p.id,p_user,b.id,b.spec->>'app_hash',p_kind,p_step,p_user,p_review_ref) returning * into o;
 insert into public.audit_log(actor,action,subject,detail) values(p_user::text,'repair_oracle_registered',p.id::text,to_jsonb(o));
 return to_jsonb(o);
end $$;
revoke all on function public.register_repair_oracle(uuid,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.register_repair_oracle(uuid,uuid,text,integer,text) to service_role;
create unique index one_repair_verification on public.verifications(verify_run_id) where verify_run_id is not null;
create table public.repair_verdicts(
 verify_run_id uuid primary key references public.repair_reruns(verify_run_id),
 user_id uuid not null, result jsonb not null, created_at timestamptz not null default now());
alter table public.repair_verdicts enable row level security;
revoke all on public.repair_verdicts from public,anon,authenticated;
grant select,insert on public.repair_verdicts to service_role;
create trigger immutable_repair_verdict before update or delete on public.repair_verdicts for each row execute function public.immutable_record();
create function public.freeze_repair_projection() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select from public.repair_verdicts where verify_run_id=old.verify_run_id) then raise check_violation using message='immutable repair verdict projection';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger immutable_repair_projection before update or delete on public.verifications for each row execute function public.freeze_repair_projection();
create function public.persist_repair_verdict(p_user uuid,p_run uuid,p_result jsonb) returns jsonb language plpgsql set search_path='' as $$
declare b public.repair_reruns;a public.repair_applications;r public.runs;base public.runs;prior public.repair_verdicts;f public.system_flags;o public.repair_oracles;
begin
 perform pg_advisory_xact_lock(781428);
 select * into b from public.repair_reruns where verify_run_id=p_run and user_id=p_user;
 if not found or p_user is null then raise check_violation using message='owned repair required';end if;
 select * into r from public.runs where id=p_run and user_id=p_user for share;
 select * into base from public.runs where id=b.baseline_run_id and user_id=p_user for share;
 select * into a from public.repair_applications where id=b.application_id and user_id=p_user;
 if r.status is distinct from 'completed' or base.status is distinct from 'completed' or r.evidence_status is distinct from 'complete' or base.evidence_status is distinct from 'complete' then raise check_violation using message='complete repair evidence required';end if;
 if p_result->>'schema' is distinct from 'tabwise-r3-verdict/1' or p_result->>'run_id' is distinct from p_run::text or p_result->>'baseline_run_id' is distinct from b.baseline_run_id::text or p_result->>'application_id' is distinct from a.id::text or p_result->>'patch_id' is distinct from a.patch_id::text or p_result->>'source_sha256' is distinct from a.source_sha256 or p_result->>'patch_sha256' is distinct from a.patch_sha256 or r.spec->>'app_hash' is distinct from a.source_sha256 or r.spec->>'patch_ref' is distinct from a.patch_sha256 or p_result->>'evidence_class' is distinct from 'MACHINE' or p_result->>'independence' is distinct from 'L3' or p_result->>'verdict' is null or p_result->>'verdict' not in ('FIXED','NOT_FIXED','REGRESSED','INCONCLUSIVE') then raise check_violation using message='repair verdict binding';end if;
 if p_result->>'verdict'<>'INCONCLUSIVE' and (p_result->'checks'->>'evidence_complete' is distinct from 'true' or coalesce(p_result->'checks'->>'symptom_gone','missing') not in ('true','false') or coalesce(p_result->'checks'->>'other_steps_preserved','missing') not in ('true','false')) then raise check_violation using message='incomplete verdict checks';end if;
 if p_result->>'verdict'='FIXED' and (p_result->'checks'->>'symptom_gone' is distinct from 'true' or p_result->'checks'->>'other_steps_preserved' is distinct from 'true') or p_result->>'verdict'='NOT_FIXED' and (p_result->'checks'->>'symptom_gone' is distinct from 'false' or p_result->'checks'->>'other_steps_preserved' is distinct from 'true') or p_result->>'verdict'='REGRESSED' and p_result->'checks'->>'other_steps_preserved' is distinct from 'false' then raise check_violation using message='contradictory verdict checks';end if;
 select * into o from public.repair_oracles where patch_id=a.patch_id and user_id=p_user;
 if not found or o.base_sha256 is distinct from a.base_sha256 or o.baseline_run_id is distinct from base.id or to_jsonb(o) is distinct from p_result->'oracle' then raise check_violation using message='reviewed oracle binding';end if;
 select * into prior from public.repair_verdicts where verify_run_id=p_run;
 if found then
  if prior.user_id is distinct from p_user or prior.result is distinct from p_result then raise check_violation using message='repair verdict replay conflict';end if;
  return jsonb_build_object('run_id',p_run,'replayed',true);
 end if;
 select * into f from public.system_flags where singleton for share;
 if f.worker_review_verdict is distinct from 'PASS' or f.qualification_ref is null then raise check_violation using message='repair verdict qualification pending';end if;
 if not exists(select from public.artifacts where run_id=base.id and path='evidence.json' and sha256=p_result->>'baseline_evidence_sha256') or not exists(select from public.artifacts where run_id=r.id and path='evidence.json' and sha256=p_result->>'rerun_evidence_sha256') then raise check_violation using message='repair evidence binding';end if;
 if (select count(*) from public.verifications where verify_run_id=p_run and baseline_run_id=base.id and patch_id=a.patch_id)<>1 then raise check_violation using message='repair verification cardinality';end if;
 update public.verifications set verdict=p_result->>'verdict',checks=p_result->'checks' where verify_run_id=p_run;
 insert into public.repair_verdicts values(p_run,p_user,p_result,now());
 insert into public.audit_log(actor,action,subject,detail) values(p_user::text,'repair_verdict_recorded',p_run::text,p_result);
 return jsonb_build_object('run_id',p_run,'replayed',false);
end $$;
revoke all on function public.persist_repair_verdict(uuid,uuid,jsonb),public.freeze_repair_projection() from public,anon,authenticated;
grant execute on function public.persist_repair_verdict(uuid,uuid,jsonb) to service_role;
