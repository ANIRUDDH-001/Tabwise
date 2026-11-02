alter table public.repair_applications add column base_source text;
alter table public.repair_applications add constraint repair_base_bytes check(base_source is null or (octet_length(base_source)<=1000000 and encode(sha256(convert_to(base_source,'UTF8')),'hex')=base_sha256));
create or replace function public.materialize_repair(p_user uuid,p_patch uuid,p_patch_sha text,p_base text,p_source text,p_source_sha text)
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
 insert into public.repair_applications(patch_id,user_id,run_id,base_sha256,patch_sha256,source_sha256,source,base_source)
 values(p.id,p_user,r.id,current_hash,p_patch_sha,p_source_sha,p_source,p_base) returning * into a;
 insert into public.audit_log(actor,action,subject,detail) values(p_user::text,'repair_materialized',a.id::text,jsonb_build_object('patch_id',p.id,'base_sha256',current_hash,'patch_sha256',p_patch_sha,'source_sha256',p_source_sha,'dispatch',false));
 return jsonb_build_object('application_id',a.id,'status','materialized','replayed',false);
end $$;
create table public.repair_reruns(
 verify_run_id uuid primary key references public.runs,application_id uuid not null references public.repair_applications,
 baseline_run_id uuid not null references public.runs,source_sha256 text not null,patch_sha256 text not null,
 user_id uuid not null,request_key text not null,version_id uuid not null references public.journey_versions,
 unique(user_id,request_key),check(verify_run_id<>baseline_run_id));
alter table public.repair_reruns enable row level security;
revoke all on public.repair_reruns from public,anon,authenticated;
grant select,insert on public.repair_reruns to service_role;
create trigger immutable_repair_rerun before update or delete on public.repair_reruns for each row execute function public.immutable_record();
create function public.admit_repair(p_user uuid,p_version uuid,p_patch uuid,p_key text) returns jsonb language plpgsql set search_path='' as $$
declare a public.repair_applications; p public.patches; b public.runs; v public.journey_versions; prior public.repair_reruns; result jsonb; rid uuid; current_hash text;
begin
 if p_user is null or p_key is null or length(p_key) not between 1 and 128 then raise check_violation using message='invalid repair admission';end if;
 perform pg_advisory_xact_lock(781426);
 select * into prior from public.repair_reruns where user_id=p_user and request_key=p_key;
 if found then
  if prior.version_id is distinct from p_version or not exists(select from public.repair_applications where id=prior.application_id and patch_id=p_patch) then raise check_violation using message='repair idempotency conflict';end if;
  return jsonb_build_object('run_id',prior.verify_run_id,'status',(select status from public.runs where id=prior.verify_run_id),'replayed',true);
 end if;
 select * into p from public.patches where id=p_patch for share;
 if not found or p.status<>'approved' or p.reviewed_by is distinct from p_user then raise check_violation using message='approved owned repair required';end if;
 select * into a from public.repair_applications where patch_id=p.id and user_id=p_user;
 select * into b from public.runs where id=p.run_id and user_id=p_user for share;
 select * into v from public.journey_versions where id=p_version and user_id=p_user;
 if a.id is null or a.base_source is null or b.id is null or v.id is null or b.status<>'completed' or b.evidence_status<>'complete' or v.journey_id is distinct from b.journey_id or v.steps is distinct from b.spec->'steps'
  or a.base_sha256 is distinct from b.spec->>'app_hash' or a.patch_sha256 is distinct from encode(sha256(convert_to(p.diff,'UTF8')),'hex') then raise check_violation using message='repair source or journey mismatch';end if;
 select base_sha256 into current_hash from public.apps where id='fernway' for share;
 if current_hash is distinct from a.base_sha256 then raise check_violation using message='stale repair source';end if;
 -- Keep existing admission capacity, owner, review and dispatch switches authoritative.
 if exists(select from public.admission_requests ar where ar.user_id=p_user and ar.key='r3:'||encode(sha256(convert_to(p_key,'UTF8')),'hex') and ar.result->>'run_id' is not null) then raise check_violation using message='repair admission key already used';end if;
 result:=public.admit_version(p_user,p_version,'r3:'||encode(sha256(convert_to(p_key,'UTF8')),'hex'));
 if result->>'run_id' is null then return result;end if;
 rid:=(result->>'run_id')::uuid;
 -- A cached admission without this immutable binding must never be repurposed.
 if exists(select from public.repair_reruns where verify_run_id=rid) or (select kind from public.runs where id=rid)<>'baseline' then raise check_violation using message='repair admission conflict';end if;
 update public.runs set kind='verify',spec=jsonb_build_object('version','0.1.0','run_id',rid,'journey_id',b.journey_id,'app_hash',a.source_sha256,'variant','patched','patch_ref',a.patch_sha256,'steps',v.steps) where id=rid and status='admitted';
 if not found then raise check_violation using message='repair admission not writable';end if;
 insert into public.repair_reruns values(rid,a.id,b.id,a.source_sha256,a.patch_sha256,p_user,p_key,v.id);
 insert into public.verifications(patch_id,baseline_run_id,verify_run_id) values(p.id,b.id,rid);
 insert into public.audit_log(actor,action,subject,detail) values(p_user::text,'repair_rerun_admitted',rid::text,jsonb_build_object('application_id',a.id,'source_sha256',a.source_sha256,'patch_sha256',a.patch_sha256));
 return result;
end $$;
revoke all on function public.admit_repair(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admit_repair(uuid,uuid,uuid,text) to service_role;
