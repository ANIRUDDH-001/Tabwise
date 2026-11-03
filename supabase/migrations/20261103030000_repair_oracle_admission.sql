-- Registration precedes admission; replay recovery and every existing execution gate remain authoritative.
create or replace function public.admit_repair(p_user uuid,p_version uuid,p_patch uuid,p_key text) returns jsonb language plpgsql set search_path='' as $$
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
 -- No run, cached admission, quota use or dispatch may be created before explicit owner check registration.
 if not exists(select from public.repair_oracles o join public.findings f on f.id=p.finding_id
  where o.patch_id=p.id and o.user_id=p_user and o.reviewed_by=p_user and o.baseline_run_id=b.id
  and o.base_sha256=a.base_sha256 and f.run_id=b.id and f.step=o.step) then
  return jsonb_build_object('reason','repair_oracle_required','http_status',409);
 end if;
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

-- Defense at the shared dispatch claim: historical/replayed admitted rows cannot bypass oracle admission.
create function public.guard_repair_dispatch() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status not in ('dispatching','dispatched','running','uploading','ingesting') then return new;end if;
 if new.kind<>'verify' and coalesce(new.spec->>'variant','')<>'patched' and not exists(select from public.repair_reruns where verify_run_id=new.id) then return new;end if;
 perform base_sha256 from public.apps where id='fernway' for share;
 if new.kind<>'verify' or not exists(
  select from public.repair_reruns rr
  join public.repair_applications a on a.id=rr.application_id
  join public.patches p on p.id=a.patch_id
  join public.runs baseline on baseline.id=rr.baseline_run_id
  join public.findings finding on finding.id=p.finding_id
  join public.repair_oracles o on o.patch_id=p.id
  join public.apps app on app.id='fernway'
  where rr.verify_run_id=new.id and rr.user_id=new.user_id and a.user_id=new.user_id
   and baseline.user_id=new.user_id and baseline.status='completed' and baseline.evidence_status='complete'
   and a.run_id=baseline.id and p.run_id=baseline.id and finding.run_id=baseline.id
   and p.status='approved' and p.reviewed_by=new.user_id
   and o.user_id=new.user_id and o.reviewed_by=new.user_id and o.baseline_run_id=baseline.id
   and o.base_sha256=a.base_sha256 and o.step=finding.step
   and baseline.spec->>'app_hash'=a.base_sha256 and app.base_sha256=a.base_sha256
   and rr.source_sha256=a.source_sha256 and rr.patch_sha256=a.patch_sha256
   and new.spec->>'app_hash'=a.source_sha256 and new.spec->>'patch_ref'=a.patch_sha256
 ) then raise check_violation using message='repair dispatch oracle/source binding required';end if;
 return new;
end $$;
create trigger repair_dispatch_oracle before insert or update of status,kind,spec on public.runs for each row execute function public.guard_repair_dispatch();
revoke all on function public.guard_repair_dispatch() from public,anon,authenticated;
