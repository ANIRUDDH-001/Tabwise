-- Explicit provenance only; no retrospective legacy inference, no execution clearance.
create table public.run_producers(product_run_id uuid primary key references public.runs,user_id uuid not null,producer text not null check(producer in ('native-r2','legacy')),created_at timestamptz not null default now());
alter table public.run_producers enable row level security;
revoke all on public.run_producers from public,anon,authenticated;
grant select on public.run_producers to authenticated;
create policy owned_run_producer on public.run_producers for select to authenticated using(user_id=(select auth.uid()));
grant select,insert on public.run_producers to service_role;
create trigger immutable_run_producer before update or delete on public.run_producers for each row execute function public.immutable_record();
create function public.register_run_producer(p_user uuid,p_run uuid,p_producer text) returns jsonb language plpgsql set search_path='' as $$
declare r public.runs;n public.run_producers;
begin
 select * into r from public.runs where id=p_run and user_id=p_user for update;
 if not found then raise check_violation using message='owned run required';end if;
 select * into n from public.run_producers where product_run_id=p_run;
 if found then
  if n.user_id<>p_user or n.producer<>p_producer then raise check_violation using message='run producer conflict';end if;
  return to_jsonb(n);
 end if;
 if r.status<>'admitted' or r.gh_run_id is not null or p_producer not in ('native-r2','legacy') or (p_producer='native-r2' and r.kind<>'baseline') or (p_producer='legacy' and r.kind<>'verify') then raise check_violation using message='new admitted producer required';end if;
 insert into public.run_producers(product_run_id,user_id,producer) values(p_run,p_user,p_producer) returning * into n;
 return to_jsonb(n);
end $$;
revoke all on function public.register_run_producer(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.register_run_producer(uuid,uuid,text) to service_role;

alter table public.native_product_requests add column dispatch_nonce uuid,add column claim_expires_at timestamptz;
create function public.guard_native_dispatch_nonce() returns trigger language plpgsql set search_path='' as $$
begin
 if old.state='PREPARED' and new.state='DISPATCH_INTENT' then new.dispatch_nonce=gen_random_uuid();new.claim_expires_at=clock_timestamp()+interval '10 minutes';
 elsif new.dispatch_nonce is distinct from old.dispatch_nonce or new.claim_expires_at is distinct from old.claim_expires_at then raise check_violation using message='immutable dispatch nonce';end if;
 return new;
end $$;
revoke all on function public.guard_native_dispatch_nonce() from public,anon,authenticated;
create trigger native_dispatch_nonce before update on public.native_product_requests for each row execute function public.guard_native_dispatch_nonce();
create table public.native_worker_claims(product_run_id uuid primary key references public.native_product_requests,user_id uuid not null,github_run_id text unique not null,nonce uuid not null,request_sha256 text not null,token_jti_sha256 text unique not null,created_at timestamptz not null default now());
alter table public.native_worker_claims enable row level security;
revoke all on public.native_worker_claims from public,anon,authenticated;
grant select on public.native_worker_claims to authenticated;
create policy owned_native_claim on public.native_worker_claims for select to authenticated using(user_id=(select auth.uid()));
grant select,insert on public.native_worker_claims to service_role;
create trigger immutable_native_claim before update or delete on public.native_worker_claims for each row execute function public.immutable_record();
create function public.bind_native_worker(p_user uuid,p_run uuid,p_request_sha text,p_gh_run_id text,p_nonce uuid,p_jti_sha text) returns jsonb language plpgsql set search_path='' as $$
declare n public.native_product_requests;c public.native_worker_claims;
begin
 select * into n from public.native_product_requests where product_run_id=p_run and user_id=p_user for update;
 if not found or n.request_sha256 is distinct from p_request_sha or n.github_run_id is distinct from p_gh_run_id or n.dispatch_nonce is distinct from p_nonce or n.claim_expires_at is null or n.claim_expires_at<=clock_timestamp() or n.state not in ('DISPATCH_ACCEPTED','RUN_BOUND') or coalesce(p_jti_sha,'')!~'^[a-f0-9]{64}$' then raise check_violation using message='native claim binding refused';end if;
 select * into c from public.native_worker_claims where product_run_id=p_run;
 if found then
  if c.github_run_id<>p_gh_run_id or c.nonce<>p_nonce or c.request_sha256<>p_request_sha then raise check_violation using message='native claim conflict';end if;
 else insert into public.native_worker_claims(product_run_id,user_id,github_run_id,nonce,request_sha256,token_jti_sha256) values(p_run,p_user,p_gh_run_id,p_nonce,p_request_sha,p_jti_sha);end if;
 update public.runs set gh_run_id=p_gh_run_id,gh_head_sha=n.request->>'revision',spec_sha256=n.request->>'spec_sha256',status=case when status='admitted' then 'dispatched' else status end where id=p_run and user_id=p_user and status not in ('completed','failed','cancelled','timed_out');
 if not found then raise check_violation using message='active owned run required';end if;
 return public.transition_native_product_request(p_user,p_run,p_request_sha,'bound',p_gh_run_id);
end $$;
revoke all on function public.bind_native_worker(uuid,uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.bind_native_worker(uuid,uuid,text,text,uuid,text) to service_role;

create table public.native_ingestions(product_run_id uuid primary key references public.native_product_requests,user_id uuid not null,ingest_sha256 text not null check(ingest_sha256~'^[a-f0-9]{64}$'),state text not null check(state in ('STAGING','COMPLETE')),created_at timestamptz not null default now());
alter table public.native_ingestions enable row level security;
revoke all on public.native_ingestions from public,anon,authenticated;
grant select on public.native_ingestions to authenticated;
create policy owned_native_ingestion on public.native_ingestions for select to authenticated using(user_id=(select auth.uid()));
grant select,insert,update on public.native_ingestions to service_role;
create function public.guard_native_ingestion() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or new.product_run_id is distinct from old.product_run_id or new.user_id is distinct from old.user_id or new.ingest_sha256 is distinct from old.ingest_sha256 or new.created_at is distinct from old.created_at or old.state='COMPLETE' or new.state<>'COMPLETE' then raise check_violation using message='immutable native ingestion';end if;
 return new;
end $$;
revoke all on function public.guard_native_ingestion() from public,anon,authenticated;
create trigger native_ingestion_identity before update or delete on public.native_ingestions for each row execute function public.guard_native_ingestion();
create function public.reserve_native_ingestion(p_user uuid,p_run uuid,p_sha text) returns jsonb language plpgsql set search_path='' as $$
declare n public.native_product_requests;i public.native_ingestions;
begin
 select * into n from public.native_product_requests where product_run_id=p_run and user_id=p_user for update;
 if not found or n.state<>'RUN_BOUND' then raise check_violation using message='owned bound request required';end if;
 select * into i from public.native_ingestions where product_run_id=p_run;
 if found then
  if i.user_id<>p_user or i.ingest_sha256<>p_sha then raise check_violation using message='native ingestion conflict';end if;
  return to_jsonb(i)||jsonb_build_object('fresh',false);
 end if;
 if not exists(select from public.runs where id=p_run and user_id=p_user and status in ('dispatched','running','uploading','ingesting')) then raise check_violation using message='active native ingestion required';end if;
 insert into public.native_ingestions values(p_run,p_user,p_sha,'STAGING',now()) returning * into i;
 update public.runs set status='ingesting' where id=p_run;
 return to_jsonb(i)||jsonb_build_object('fresh',true);
end $$;
revoke all on function public.reserve_native_ingestion(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_native_ingestion(uuid,uuid,text) to service_role;
create function public.finish_native_ingestion(p_user uuid,p_run uuid,p_sha text) returns jsonb language plpgsql set search_path='' as $$
declare i public.native_ingestions;
begin
 select * into i from public.native_ingestions where product_run_id=p_run and user_id=p_user for update;
 if not found or i.ingest_sha256 is distinct from p_sha then raise check_violation using message='owned native ingestion required';end if;
 if i.state='COMPLETE' then return to_jsonb(i);end if;
 if not exists(select from public.runs where id=p_run and user_id=p_user and status='ingesting') then raise check_violation using message='native ingestion custody lost';end if;
 update public.native_ingestions set state='COMPLETE' where product_run_id=p_run returning * into i;
 update public.runs set status='completed',evidence_status='complete',finished_at=clock_timestamp() where id=p_run and user_id=p_user and status='ingesting';
 return to_jsonb(i);
end $$;
revoke all on function public.finish_native_ingestion(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_native_ingestion(uuid,uuid,text) to service_role;
