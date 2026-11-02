-- Private immutable source candidates. No shared app mutation and no execution permission.
create table public.repair_applications(
 id uuid primary key default gen_random_uuid(),patch_id uuid not null unique references public.patches,
 user_id uuid not null,run_id uuid not null references public.runs,
 base_sha256 text not null,patch_sha256 text not null,source_sha256 text not null,
 source text not null check(octet_length(source)<=1000000),created_at timestamptz not null default now(),
 check(base_sha256 ~ '^[a-f0-9]{64}$' and patch_sha256 ~ '^[a-f0-9]{64}$' and source_sha256 ~ '^[a-f0-9]{64}$'),
 check(encode(sha256(convert_to(source,'UTF8')),'hex')=source_sha256));
alter table public.repair_applications enable row level security;
revoke all on public.repair_applications from public,anon,authenticated;
grant select,insert on public.repair_applications to service_role;
create trigger immutable_repair_application before update or delete on public.repair_applications for each row execute function public.immutable_record();
create trigger immutable_audit_log before update or delete on public.audit_log for each row execute function public.immutable_record();
create function public.materialize_repair(p_user uuid,p_patch uuid,p_patch_sha text,p_base text,p_source text,p_source_sha text)
returns jsonb language plpgsql set search_path='' as $$
declare p public.patches; r public.runs; a public.repair_applications; current_hash text;
begin
 select * into p from public.patches where id=p_patch for update;
 if not found or p_user is null or p.status<>'approved' or p.reviewed_by is distinct from p_user then raise check_violation using message='approved owner decision required';end if;
 select * into r from public.runs where id=p.run_id and user_id=p_user for share;
 if not found or r.status<>'completed' or r.evidence_status<>'complete' then raise check_violation using message='owned qualified baseline required';end if;
 -- Recover a successful transaction even if its response was lost or the shared revision advanced.
 select * into a from public.repair_applications where patch_id=p.id;
 if found then
  if a.user_id is distinct from p_user or a.patch_sha256 is distinct from p_patch_sha or a.source_sha256 is distinct from p_source_sha or a.source is distinct from p_source then raise check_violation using message='repair replay conflict';end if;
  return jsonb_build_object('application_id',a.id,'status','materialized','replayed',true);
 end if;
 select base_sha256 into current_hash from public.apps where id='fernway' for share;
 if current_hash is distinct from r.spec->>'app_hash' or encode(sha256(convert_to(p_base,'UTF8')),'hex') is distinct from current_hash
  or p.validator->>'ok' is distinct from 'true' or p.validator->'contract'->>'base_sha256' is distinct from current_hash
  or p.validator->'contract'->>'patch_sha256' is distinct from p_patch_sha or encode(sha256(convert_to(p.diff,'UTF8')),'hex') is distinct from p_patch_sha
  or p_source is null or p_source=p_base or p_source_sha is distinct from encode(sha256(convert_to(p_source,'UTF8')),'hex')
  or p.files is distinct from array['index.html'] then raise check_violation using message='stale or invalid repair';end if;
 insert into public.repair_applications(patch_id,user_id,run_id,base_sha256,patch_sha256,source_sha256,source)
 values(p.id,p_user,r.id,current_hash,p_patch_sha,p_source_sha,p_source) returning * into a;
 insert into public.audit_log(actor,action,subject,detail) values(p_user::text,'repair_materialized',a.id::text,jsonb_build_object('patch_id',p.id,'base_sha256',current_hash,'patch_sha256',p_patch_sha,'source_sha256',p_source_sha,'dispatch',false));
 return jsonb_build_object('application_id',a.id,'status','materialized','replayed',false);
end $$;
revoke all on function public.materialize_repair(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.materialize_repair(uuid,uuid,text,text,text,text) to service_role;

-- Human decision only. No dispatch, verification, inference or allocation activation.
create or replace function public.review_patch(p_user uuid,p_patch uuid,p_decision text,p_patch_sha text)
returns jsonb language plpgsql set search_path='' as $$
declare p public.patches; r public.runs; current_hash text;
begin
 if p_user is null or p_decision is null or p_decision not in ('approved','rejected') or p_patch_sha is null or p_patch_sha !~ '^[a-f0-9]{64}$' then raise check_violation using message='invalid review decision';end if;
 select * into p from public.patches where id=p_patch for update;
 if not found then raise check_violation using message='patch not found';end if;
 select * into r from public.runs where id=p.run_id and user_id=p_user for share;
 if not found then raise check_violation using message='owned baseline required';end if;
 if p_decision='rejected' then
  if encode(sha256(convert_to(p.diff,'UTF8')),'hex') is distinct from p_patch_sha then raise check_violation using message='patch integrity';end if;
  if p.status='rejected' and p.reviewed_by=p_user then return jsonb_build_object('patch_id',p.id,'status',p.status,'replayed',true,'dispatch',false);end if;
  if p.status<>'proposed' then raise check_violation using message='review already finalized';end if;
  update public.patches set status='rejected',reviewed_by=p_user,reviewed_at=clock_timestamp() where id=p.id;
  insert into public.audit_log(actor,action,subject,detail) values(p_user::text,'patch_review',p.id::text,jsonb_build_object('decision','rejected','patch_sha256',p_patch_sha,'dispatch',false));
  return jsonb_build_object('patch_id',p.id,'status','rejected','replayed',false,'dispatch',false);
 end if;
 if r.status<>'completed' or r.evidence_status<>'complete' then raise check_violation using message='owned qualified baseline required';end if;
 select base_sha256 into current_hash from public.apps where id='fernway' for share;
 if p.validator->>'ok' is distinct from 'true' or p.validator->'contract'->>'run_id' is distinct from r.id::text
  or p.validator->'contract'->>'base_sha256' is distinct from r.spec->>'app_hash' or current_hash is distinct from r.spec->>'app_hash'
  or p.validator->'contract'->>'patch_sha256' is distinct from p_patch_sha or encode(sha256(convert_to(p.diff,'UTF8')),'hex')<>p_patch_sha
  or p.files is distinct from array['index.html'] then raise check_violation using message='stale or unvalidated patch';end if;
 if p.status=p_decision and p.reviewed_by=p_user then return jsonb_build_object('patch_id',p.id,'status',p.status,'replayed',true,'dispatch',false);end if;
 if p.status<>'proposed' then raise check_violation using message='review already finalized';end if;
 update public.patches set status=p_decision,reviewed_by=p_user,reviewed_at=clock_timestamp() where id=p.id;
 insert into public.audit_log(actor,action,subject,detail) values(p_user::text,'patch_review',p.id::text,jsonb_build_object('decision',p_decision,'patch_sha256',p_patch_sha,'base_sha256',current_hash,'dispatch',false));
 return jsonb_build_object('patch_id',p.id,'status',p_decision,'replayed',false,'dispatch',false);
end $$;
revoke all on function public.review_patch(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_patch(uuid,uuid,text,text) to service_role;

-- Proposal contents and finalized human decisions cannot be rewritten by a later service request.
create function public.immutable_patch_decision() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise check_violation using message='immutable patch';end if;
 if new.id is distinct from old.id or new.finding_id is distinct from old.finding_id or new.run_id is distinct from old.run_id or new.diff is distinct from old.diff or new.files is distinct from old.files or new.validator is distinct from old.validator
  or old.status<>'proposed' or new.status not in ('approved','rejected') or new.reviewed_by is null or new.reviewed_at is null then raise check_violation using message='immutable proposal or finalized decision';end if;
 return new;
end $$;
revoke all on function public.immutable_patch_decision() from public,anon,authenticated;
create trigger immutable_patch_decision before update or delete on public.patches for each row execute function public.immutable_patch_decision();
create trigger immutable_diagnosis before update or delete on public.diagnoses for each row execute function public.immutable_record();
create trigger immutable_finding before update or delete on public.findings for each row execute function public.immutable_record();
