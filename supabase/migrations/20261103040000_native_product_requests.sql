-- Inactive orchestration records only. No workflow, approval, budget or native gate is enabled.
create table public.native_product_requests(
 product_run_id uuid primary key references public.runs,user_id uuid not null,
 request_sha256 text not null check(request_sha256 ~ '^[a-f0-9]{64}$'),request jsonb not null,
 spec_text text not null,plan_text text not null,fixture_text text not null,
 state text not null default 'PREPARED' check(state in ('PREPARED','DISPATCH_INTENT','DISPATCH_UNKNOWN','DISPATCH_ACCEPTED','RUN_BOUND')),
 github_run_id text unique check(github_run_id ~ '^[1-9][0-9]{0,19}$'),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(octet_length(spec_text) between 1 and 100000 and octet_length(plan_text) between 1 and 100000 and octet_length(fixture_text) between 1 and 100000),
 check(request->>'request_sha256'=request_sha256),check(request->>'execution_authorized'='false'),
 check((state in ('DISPATCH_ACCEPTED','RUN_BOUND'))=(github_run_id is not null)));
alter table public.native_product_requests enable row level security;
revoke all on public.native_product_requests from public,anon,authenticated;
grant select on public.native_product_requests to authenticated;
create policy owned_native_request on public.native_product_requests for select to authenticated using(user_id=(select auth.uid()));
grant select,insert,update on public.native_product_requests to service_role;
create function public.guard_native_product_request() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise check_violation using message='immutable native request';end if;
 if new.product_run_id is distinct from old.product_run_id or new.user_id is distinct from old.user_id or new.request_sha256 is distinct from old.request_sha256 or new.request is distinct from old.request
 or new.spec_text is distinct from old.spec_text or new.plan_text is distinct from old.plan_text or new.fixture_text is distinct from old.fixture_text or new.created_at is distinct from old.created_at
 or (old.github_run_id is not null and new.github_run_id is distinct from old.github_run_id) then raise check_violation using message='immutable native request binding';end if;
 if new.state is distinct from old.state and (old.state,new.state) not in (('PREPARED','DISPATCH_INTENT'),('DISPATCH_INTENT','DISPATCH_UNKNOWN'),('DISPATCH_INTENT','DISPATCH_ACCEPTED'),('DISPATCH_UNKNOWN','DISPATCH_ACCEPTED'),('DISPATCH_ACCEPTED','RUN_BOUND')) then raise check_violation using message='illegal native request transition';end if;
 return new;
end $$;
revoke all on function public.guard_native_product_request() from public,anon,authenticated;
create trigger immutable_native_product_request before update or delete on public.native_product_requests for each row execute function public.guard_native_product_request();

create function public.prepare_native_product_request(p_user uuid,p_request jsonb,p_canonical text,p_spec text,p_plan text,p_fixture text) returns jsonb language plpgsql set search_path='' as $$
declare r public.runs;v public.journey_versions;n public.native_product_requests;page jsonb;ph text;
begin
 if p_user is null or p_request->>'schema' is distinct from 'tabwise-native-product-request/1' or p_request->'execution_authorized' is distinct from 'false'::jsonb
 or p_request->>'workflow' is distinct from '.github/workflows/tabwise-r2.yml' or (p_request->>'user_id')::uuid is distinct from p_user
 or octet_length(p_canonical)>100000 or p_canonical::jsonb is distinct from (p_request-'request_sha256')
 or encode(sha256(convert_to(p_canonical,'UTF8')),'hex') is distinct from p_request->>'request_sha256'
 or coalesce(p_request->>'revision','')!~'^[a-f0-9]{40}$' or coalesce(p_request->>'actor','')='' or length(p_request->>'actor')>128
 or coalesce(p_request->>'plan_path','')!~'^fixtures/r2/plans/[a-zA-Z0-9_-]+[.]json$'
 or exists(select from unnest(array['spec_sha256','plan_sha256','plan_bytes_sha256','fixture_sha256','r2_source_sha256','qualification_sha256']) k where coalesce(p_request->>k,'')!~'^[a-f0-9]{64}$')
 then raise check_violation using message='invalid native request digest';end if;
 select * into r from public.runs where id=(p_request->>'product_run_id')::uuid and user_id=p_user for update;
 if not found then raise check_violation using message='owned admitted run required';end if;
 select x into page from jsonb_array_elements(p_plan::jsonb->'pages') x where x->>'id'=p_request->>'page_id';
 if coalesce(r.spec->>'variant','') not in ('healthy','broken') or page->>'query' is distinct from '?flow='||replace(r.journey_id,'fernway-','')||'&variant='||(r.spec->>'variant') then raise check_violation using message='native query binding mismatch';end if;
 select * into n from public.native_product_requests where product_run_id=r.id;
 if found then
  if n.request is distinct from p_request or n.spec_text is distinct from p_spec or n.plan_text is distinct from p_plan or n.fixture_text is distinct from p_fixture then raise check_violation using message='native request idempotency conflict';end if;
  return to_jsonb(n)||jsonb_build_object('replayed',true);
 end if;
 select * into v from public.journey_versions where id=r.journey_version_id and user_id=p_user;
 if r.status<>'admitted' or v.id is null or r.kind<>'baseline' or coalesce(r.spec->>'variant','') not in ('healthy','broken') or p_request->>'journey_version_id' is distinct from v.id::text
 or r.spec is distinct from p_spec::jsonb or v.steps is distinct from r.spec->'steps'
 or r.spec->>'run_id' is distinct from r.id::text or r.spec->>'journey_id' is distinct from v.journey_id
 or encode(sha256(convert_to(p_spec,'UTF8')),'hex') is distinct from p_request->>'spec_sha256'
 or (r.spec_sha256 is not null and r.spec_sha256 is distinct from p_request->>'spec_sha256') then raise check_violation using message='native stored spec/version mismatch';end if;
 select x into page from jsonb_array_elements(p_plan::jsonb->'pages') x where x->>'id'=p_request->>'page_id';
 ph=encode(sha256(convert_to(replace(p_fixture,E'\r\n',E'\n'),'UTF8')),'hex');
 if page is null or page->>'fixture_sha256' is distinct from ph or r.spec->>'app_hash' is distinct from ph or p_request->>'fixture_sha256' is distinct from ph
 or encode(sha256(convert_to(p_plan,'UTF8')),'hex') is distinct from p_request->>'plan_bytes_sha256'
 or encode(sha256(convert_to(replace(p_plan,E'\r\n',E'\n'),'UTF8')),'hex') is distinct from p_request->>'plan_sha256'
 or jsonb_array_length(page->'task') is distinct from jsonb_array_length(r.spec->'steps')
 or exists(select from jsonb_array_elements(page->'task') with ordinality t(x,n) where t.x->>'press' is distinct from r.spec->'steps'->(t.n::int-1)->>'key' or t.x->>'press'='type')
 or page->>'query' is distinct from '?flow='||replace(v.journey_id,'fernway-','')||'&variant='||(r.spec->>'variant')
 then raise check_violation using message='native plan/source binding mismatch';end if;
 insert into public.native_product_requests(product_run_id,user_id,request_sha256,request,spec_text,plan_text,fixture_text) values(r.id,p_user,p_request->>'request_sha256',p_request,p_spec,p_plan,p_fixture) returning * into n;
 insert into public.audit_log(actor,action,subject,detail) values(p_user::text,'native_request_prepared',r.id::text,jsonb_build_object('request_sha256',n.request_sha256,'execution_authorized',false));
 return to_jsonb(n)||jsonb_build_object('replayed',false);
end $$;
revoke all on function public.prepare_native_product_request(uuid,jsonb,text,text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_native_product_request(uuid,jsonb,text,text,text,text) to service_role;

create function public.transition_native_product_request(p_user uuid,p_run uuid,p_request_sha text,p_action text,p_gh_run_id text default null) returns jsonb language plpgsql set search_path='' as $$
declare n public.native_product_requests;next_state text;
begin
 select * into n from public.native_product_requests where product_run_id=p_run and user_id=p_user for update;
 if not found or n.request_sha256 is distinct from p_request_sha then raise check_violation using message='native request ownership/digest mismatch';end if;
 if p_action='bound' then
  if n.github_run_id is null or n.github_run_id is distinct from p_gh_run_id or n.state not in ('DISPATCH_ACCEPTED','RUN_BOUND') then raise check_violation using message='native bound execution conflict';end if;
  if n.state='RUN_BOUND' then return to_jsonb(n)||jsonb_build_object('replayed',true);end if;
  next_state='RUN_BOUND';
 elsif p_action='accepted' then
  if p_gh_run_id is null or p_gh_run_id!~'^[1-9][0-9]{0,19}$' then raise check_violation using message='native execution ID required';end if;
  if n.github_run_id is not null then
   if n.github_run_id<>p_gh_run_id then raise check_violation using message='native execution conflict';end if;
   return to_jsonb(n)||jsonb_build_object('replayed',true);
  end if;
  next_state='DISPATCH_ACCEPTED';
 elsif p_action='intent' and p_gh_run_id is null then next_state='DISPATCH_INTENT';
 elsif p_action='unknown' and p_gh_run_id is null then next_state='DISPATCH_UNKNOWN';
 else raise check_violation using message='unsupported native request transition';end if;
 if (n.state,next_state) not in (('PREPARED','DISPATCH_INTENT'),('DISPATCH_INTENT','DISPATCH_UNKNOWN'),('DISPATCH_INTENT','DISPATCH_ACCEPTED'),('DISPATCH_UNKNOWN','DISPATCH_ACCEPTED'),('DISPATCH_ACCEPTED','RUN_BOUND')) then raise check_violation using message='illegal native request transition';end if;
 update public.native_product_requests set state=next_state,github_run_id=p_gh_run_id,updated_at=clock_timestamp() where product_run_id=p_run returning * into n;
 insert into public.audit_log(actor,action,subject,detail) values(p_user::text,'native_request_transition',p_run::text,jsonb_build_object('state',n.state,'github_run_id',n.github_run_id,'execution_authorized',false));
 return to_jsonb(n)||jsonb_build_object('replayed',false);
end $$;
revoke all on function public.transition_native_product_request(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.transition_native_product_request(uuid,uuid,text,text,text) to service_role;
