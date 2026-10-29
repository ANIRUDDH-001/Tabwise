-- Applies only to dedicated project ueobjrtvsgvkigmjxkks. No execution or inference is enabled.
create table public.operators(user_id uuid primary key, github_id text not null unique);
create table public.projects(id uuid primary key default gen_random_uuid(), owner_id uuid, name text not null, visibility text not null default 'private' check(visibility in ('private','demo')));
create table public.apps(id text primary key check(id='fernway'), project_id uuid references public.projects, base_sha256 text check(base_sha256 ~ '^[a-f0-9]{64}$'), files jsonb not null default '{}');
create table public.journeys(id text primary key check(id in ('fernway-passenger','fernway-seat','fernway-search')), app_id text not null references public.apps, name text not null, supported boolean not null default false);
create table public.journey_versions(id uuid primary key default gen_random_uuid(), journey_id text not null references public.journeys, user_id uuid not null, n integer not null check(n>0), steps jsonb not null, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), created_at timestamptz not null default now(), unique(journey_id,user_id,n));
create table public.system_flags(
 singleton boolean primary key default true check(singleton),
 dispatch_mode text not null default 'owner_only' check(dispatch_mode in ('off','owner_only','public')),
 diagnosis_mode text not null default 'off' check(diagnosis_mode in ('off','owner','public')),
 public_daily_dispatch_limit integer not null default 5 check(public_daily_dispatch_limit between 0 and 5),
 public_daily_diagnosis_limit integer not null default 10 check(public_daily_diagnosis_limit between 0 and 10),
 worker_review_verdict text not null default 'PENDING',worker_review_ref text,actions_policy_cleared boolean not null default false,policy_ref text,qualification_ref text,public_diagnosis_approval_ref text,
 approved_worker_shas text[] not null default '{}',consecutive_public_infra_failures integer not null default 0,
 note text,updated_at timestamptz not null default now(),
 check(dispatch_mode<>'public' or (worker_review_verdict='PASS' and worker_review_ref is not null and actions_policy_cleared and policy_ref is not null)),
 check(diagnosis_mode='off' or qualification_ref is not null),
 check(diagnosis_mode<>'public' or public_diagnosis_approval_ref is not null));
insert into public.system_flags(singleton) values(true);
create table public.runs(id uuid primary key default gen_random_uuid(), user_id uuid not null, journey_id text not null references public.journeys, journey_version_id uuid references public.journey_versions,
 access_kind text not null check(access_kind in ('public','owner')),kind text not null default 'baseline' check(kind in ('baseline','verify')),
 status text not null check(status in ('admitted','dispatching','dispatched','running','uploading','ingesting','completed','failed','cancelled','timed_out')),
 reason text,spec_sha256 text check(spec_sha256 ~ '^[a-f0-9]{64}$'),spec jsonb,gh_run_id text,gh_head_sha text,profile text not null default 'A15' check(profile='A15'),evidence_status text not null default 'incomplete' check(evidence_status in ('complete','incomplete')),
 lease_until timestamptz,deadline_at timestamptz not null,created_at timestamptz not null default now(),started_at timestamptz,finished_at timestamptz);
create index runs_active on public.runs(status,created_at);
create index runs_user_day on public.runs(user_id,created_at);
create table public.admission_requests(user_id uuid not null,key text not null check(length(key) between 1 and 128),result jsonb not null,created_at timestamptz not null default now(),primary key(user_id,key));
create table public.run_stages(run_id uuid references public.runs,stage text,status text not null,started_at timestamptz,finished_at timestamptz,primary key(run_id,stage));
create table public.artifacts(run_id uuid references public.runs,path text,sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),bytes bigint not null check(bytes between 0 and 4000000),kind text not null,expires_at timestamptz default now()+interval '14 days',primary key(run_id,path));
create table public.findings(id uuid primary key default gen_random_uuid(),run_id uuid not null references public.runs,source text not null check(source in ('signal','spark')),step integer not null,title text not null,mechanism text,evidence_refs text[] not null,location jsonb,confidence text);
create table public.diagnoses(id uuid primary key default gen_random_uuid(),run_id uuid not null references public.runs,model text not null,mode text not null,prompt_sha256 text not null,input_sha256 text not null,output jsonb not null,usage jsonb,cost_nano bigint,reservation_id uuid,created_at timestamptz not null default now(),unique(input_sha256,model,prompt_sha256));
create table public.patches(id uuid primary key default gen_random_uuid(),finding_id uuid references public.findings,run_id uuid not null references public.runs,diff text not null,files text[] not null,validator jsonb not null,status text not null default 'proposed' check(status in ('proposed','approved','rejected')),reviewed_by uuid,reviewed_at timestamptz);
create table public.verifications(id uuid primary key default gen_random_uuid(),patch_id uuid not null references public.patches,baseline_run_id uuid not null references public.runs,verify_run_id uuid references public.runs,verdict text check(verdict in ('FIXED','NOT_FIXED','REGRESSED','INCONCLUSIVE')),checks jsonb,check(baseline_run_id<>verify_run_id));
create table public.reports(slug text primary key,snapshot jsonb not null,sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),created_by uuid not null,created_at timestamptz not null default now());
create table public.capacity_snapshots(at timestamptz primary key default clock_timestamp(),db_bytes bigint not null check(db_bytes>=0),storage_bytes bigint not null check(storage_bytes>=0),gh_rate_remaining integer not null check(gh_rate_remaining>=0),est_egress_bytes bigint not null check(est_egress_bytes>=0));
create table public.audit_log(id bigint generated always as identity primary key,actor text not null,action text not null,subject text,at timestamptz not null default now(),detail jsonb not null default '{}');
create table public.hosted_budget(singleton boolean primary key default true check(singleton),ceiling_nano bigint not null default 40000000000 check(ceiling_nano between 0 and 40000000000),spent_nano bigint not null default 0 check(spent_nano>=0),reserved_nano bigint not null default 0 check(reserved_nano>=0),check(spent_nano+reserved_nano<=ceiling_nano));
insert into public.hosted_budget(singleton) values(true);
create table public.budget_reservations(id uuid primary key default gen_random_uuid(),run_id uuid references public.runs,worst_nano bigint not null check(worst_nano between 1 and 100000000),settled_nano bigint,state text not null default 'open' check(state in ('open','settled')),created_at timestamptz not null default now(),settled_at timestamptz,check(settled_nano between 0 and worst_nano));

-- Owned sample definitions are disabled for admission until the authored app is pinned.
insert into public.projects(name,visibility) values('Tabwise demo','demo');
insert into public.apps(id,project_id) select 'fernway',id from public.projects where name='Tabwise demo';
insert into public.journeys(id,app_id,name,supported) values('fernway-passenger','fernway','Passenger details',true),('fernway-seat','fernway','Seat selection',true),('fernway-search','fernway','Search updates',true);

create function public.run_transition(p_id uuid,p_from text,p_to text,p_reason text default null) returns void language plpgsql set search_path='' as $$
declare changed integer;
begin
 if not ((p_from,p_to) in (('admitted','dispatching'),('dispatching','dispatched'),('dispatched','running'),('running','uploading'),('uploading','ingesting'),('ingesting','completed')) or (p_from in ('admitted','dispatching','dispatched','running','uploading','ingesting') and p_to in ('failed','cancelled','timed_out'))) then raise check_violation using message='illegal run transition'; end if;
 update public.runs set status=p_to,reason=p_reason,started_at=case when p_to='running' then now() else started_at end,finished_at=case when p_to in ('completed','failed','cancelled','timed_out') then now() else null end,
 deadline_at=case when p_to='dispatched' then now()+interval '10 minutes' when p_to='running' then now()+interval '30 minutes' else deadline_at end where id=p_id and status=p_from;
 get diagnostics changed=row_count;
 if changed<>1 then raise check_violation using message='stale run transition'; end if;
 insert into public.audit_log(actor,action,subject,detail) values('server','run_transition',p_id::text,jsonb_build_object('from',p_from,'to',p_to,'reason',p_reason));
end $$;

create function public.kill_switch(p_reason text) returns void language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(781426);
 update public.system_flags set dispatch_mode='off',diagnosis_mode='off',note=p_reason,updated_at=now();
 insert into public.audit_log(actor,action,detail) values('server','kill_switch',jsonb_build_object('reason',p_reason));
end $$;

create function public.admit_run(p_user uuid,p_access_kind text,p_journey_id text,p_key text) returns jsonb language plpgsql set search_path='' as $$
declare f public.system_flags; c public.capacity_snapshots; r public.runs; result jsonb; reason text; n integer; today timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
begin
 if p_user is null or p_access_kind not in ('public','owner') or p_access_kind is null or p_key is null or length(p_key) not between 1 and 128 then raise check_violation using message='invalid admission arguments'; end if;
 perform pg_advisory_xact_lock(781426);
 select a.result into result from public.admission_requests a where a.user_id=p_user and a.key=p_key;
 if found then return result; end if;
 for r in select * from public.runs where status in ('admitted','dispatching','dispatched','running','uploading','ingesting') and deadline_at<now() for update loop perform public.run_transition(r.id,r.status,'timed_out','deadline_exceeded'); end loop;
 select * into f from public.system_flags where singleton for update;
 select * into c from public.capacity_snapshots order by at desc limit 1;
 if f.dispatch_mode='public' and (c.at is null or c.at<now()-interval '10 minutes' or c.db_bytes>=250000000 or c.storage_bytes>=400000000 or c.est_egress_bytes>=2500000000 or c.gh_rate_remaining<1000 or f.consecutive_public_infra_failures>=2) then
  update public.system_flags set dispatch_mode='owner_only',note='automatic capacity downgrade',updated_at=now(); f.dispatch_mode:='owner_only';
  insert into public.audit_log(actor,action) values('server','automatic_downgrade');
 end if;
 if f.dispatch_mode='off' then reason:='dispatch_off';
 elsif p_access_kind='owner' and not exists(select from public.operators where user_id=p_user) then reason:='owner_only';
 elsif p_access_kind='public' and f.dispatch_mode<>'public' then reason:='owner_only';
 elsif f.worker_review_verdict<>'PASS' or f.worker_review_ref is null then reason:='worker_review_pending';
 elsif not exists(select from public.journeys where id=p_journey_id and supported) then reason:='unsupported_journey';
 elsif exists(select from public.runs where user_id=p_user and status not in ('completed','failed','cancelled','timed_out')) then reason:='user_active';
 elsif p_access_kind='public' and (select count(*) from public.runs where user_id=p_user and access_kind='public' and created_at>=today)>=2 then reason:='user_daily';
 elsif p_access_kind='public' and (select count(*) from public.runs where access_kind='public' and created_at>=today)>=f.public_daily_dispatch_limit then reason:='global_daily';
 elsif p_access_kind='public' and exists(select from public.runs where access_kind='public' and status not in ('completed','failed','cancelled','timed_out')) then reason:='no_public_slot';
 elsif (select count(*) from public.runs where status not in ('completed','failed','cancelled','timed_out'))>=2 then reason:='global_limit';
 elsif c.at is null or c.at<now()-interval '10 minutes' then reason:='capacity_stale';
 elsif c.db_bytes>=350000000 then reason:='capacity_db';
 elsif c.storage_bytes>=600000000 then reason:='capacity_storage';
 elsif c.est_egress_bytes>=3500000000 then reason:='capacity_egress';
 elsif c.gh_rate_remaining<1000 then reason:='capacity_github'; end if;
 if reason is null then
  insert into public.runs(user_id,journey_id,access_kind,status,deadline_at) values(p_user,p_journey_id,p_access_kind,'admitted',now()+interval '10 minutes') returning * into r;
  result:=jsonb_build_object('run_id',r.id,'status','admitted');
 else result:=jsonb_build_object('reason',reason,'http_status',429); end if;
 insert into public.admission_requests(user_id,key,result) values(p_user,p_key,result);
 insert into public.audit_log(actor,action,subject,detail) values(p_user::text,'admission',p_journey_id,result);
 return result;
end $$;

create function public.reserve_hosted(p_worst bigint,p_run uuid default null) returns jsonb language plpgsql set search_path='' as $$
declare b public.hosted_budget; rid uuid;
begin
 if p_worst is null or p_worst<1 or p_worst>100000000 then return jsonb_build_object('reason','per_call_cap'); end if;
 select * into b from public.hosted_budget where singleton for update;
 if b.spent_nano+b.reserved_nano+p_worst>b.ceiling_nano then return jsonb_build_object('reason','budget_cap'); end if;
 insert into public.budget_reservations(worst_nano,run_id) values(p_worst,p_run) returning id into rid;
 update public.hosted_budget set reserved_nano=reserved_nano+p_worst where singleton;
 return jsonb_build_object('id',rid,'reserved_nano',p_worst);
end $$;

create function public.settle_hosted(p_id uuid,p_actual bigint) returns jsonb language plpgsql set search_path='' as $$
declare r public.budget_reservations;
begin
 perform 1 from public.hosted_budget where singleton for update;
 select * into r from public.budget_reservations where id=p_id for update;
 if not found or r.state<>'open' then return jsonb_build_object('reason','not_open'); end if;
 if p_actual is null or p_actual<0 then return jsonb_build_object('reason','missing_usage'); end if;
 if p_actual>r.worst_nano then
  insert into public.audit_log(actor,action,subject,detail) values('broker','budget_alarm',p_id::text,jsonb_build_object('actual',p_actual,'reserved',r.worst_nano));
  update public.system_flags set diagnosis_mode='off',note='budget bound exceeded';
  return jsonb_build_object('reason','above_reservation');
 end if;
 update public.budget_reservations set state='settled',settled_nano=p_actual,settled_at=now() where id=p_id;
 update public.hosted_budget set reserved_nano=reserved_nano-r.worst_nano,spent_nano=spent_nano+p_actual where singleton;
 return jsonb_build_object('settled_nano',p_actual);
end $$;

-- Default deny all browser writes; service-role routes validate ownership before RPC.
do $$ declare t text; begin
 for t in select tablename from pg_tables where schemaname='public' loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on sequence public.audit_log_id_seq to service_role;
grant select on public.projects,public.apps,public.journeys,public.journey_versions,public.runs,public.run_stages,public.artifacts,public.findings,public.diagnoses,public.patches,public.verifications,public.reports to anon,authenticated;
create policy project_read on public.projects for select to anon,authenticated using(visibility='demo' or owner_id=(select auth.uid()));
create policy app_read on public.apps for select to anon,authenticated using(exists(select from public.projects p where p.id=project_id));
create policy journey_read on public.journeys for select to anon,authenticated using(exists(select from public.apps a where a.id=app_id));
create policy version_read on public.journey_versions for select to authenticated using(user_id=(select auth.uid()));
create policy run_read on public.runs for select to authenticated using(user_id=(select auth.uid()));
do $$ declare t text; begin
 for t in select unnest(array['run_stages','artifacts','findings','diagnoses','patches']) loop
  execute format('create policy owned_read on public.%I for select to authenticated using (exists(select from public.runs r where r.id=run_id and r.user_id=(select auth.uid())))',t);
 end loop;
end $$;
create policy verification_read on public.verifications for select to authenticated using(exists(select from public.runs r where r.id=baseline_run_id and r.user_id=(select auth.uid())));
create policy report_read on public.reports for select to anon,authenticated using(true);
revoke all on function public.admit_run(uuid,text,text,text),public.run_transition(uuid,text,text,text),public.kill_switch(text),public.reserve_hosted(bigint,uuid),public.settle_hosted(uuid,bigint) from public,anon,authenticated;
grant execute on function public.admit_run(uuid,text,text,text),public.run_transition(uuid,text,text,text),public.kill_switch(text),public.reserve_hosted(bigint,uuid),public.settle_hosted(uuid,bigint) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('tabwise-evidence','tabwise-evidence',false,4000000,array['application/json','application/x-ndjson','image/webp','text/plain']);
-- No client Storage policies: signed URLs are minted only by ownership-checked routes.
