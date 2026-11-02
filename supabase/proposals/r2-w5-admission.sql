-- UNAPPLIED W5 proposal. Private durable authority; no existing product tables changed.
-- service_role is a trusted authenticated server boundary, not a browser/worker role.
begin;
create schema tabwise_admission;
revoke all on schema tabwise_admission from public;
create function tabwise_admission.valid_binding(b jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare names text[]:=array['purpose','repository','workflow','revision','actor','owner_approval_ref','review_ref','reviewed_files','reviewed_sha256','qualification_sha256','plan_sha256','fixtures','permitted_attempt','expires_at']; f jsonb; scope jsonb;
begin
 if b is null or jsonb_typeof(b)<>'object' or not (b ?& names) or b-names<>'{}'::jsonb then return false; end if;
 if exists(select from unnest(array['purpose','repository','workflow','revision','actor','owner_approval_ref','review_ref','reviewed_sha256','qualification_sha256','plan_sha256','expires_at']) as k where jsonb_typeof(b->k)<>'string') then return false; end if;
 if b->>'purpose' not in ('r2-execution','w2a-qualification') or b->>'repository'<>'ANIRUDDH-001/Tabwise' or coalesce(b->>'workflow','') !~ '^\.github/workflows/[a-z0-9-]+\.yml$' or (b->>'purpose'='r2-execution' and b->>'workflow'<>'.github/workflows/tabwise-r2.yml') then return false; end if;
 if coalesce(b->>'revision','') !~ '^[a-f0-9]{40}$' or coalesce(b->>'actor','') !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$' or coalesce(b->>'owner_approval_ref','') !~ '^D-[0-9]+$' or jsonb_typeof(b->'review_ref')<>'string' or length(b->>'review_ref') not between 1 and 512 then return false; end if;
 if coalesce(b->>'reviewed_sha256','') !~ '^[a-f0-9]{64}$' or coalesce(b->>'qualification_sha256','') !~ '^[a-f0-9]{64}$' or coalesce(b->>'plan_sha256','') !~ '^[a-f0-9]{64}$' or b->'permitted_attempt'<>'1'::jsonb or coalesce(b->>'expires_at','') !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$' then return false; end if;
 if jsonb_typeof(b->'reviewed_files')<>'array' or jsonb_array_length(b->'reviewed_files') not between 1 and 256 then return false; end if;
 if exists(select from jsonb_array_elements(b->'reviewed_files') as x(v) where jsonb_typeof(v)<>'string' or length(v#>>'{}')>256 or (v#>>'{}') like '%..%' or (v#>>'{}') !~ '^\.?[A-Za-z0-9_/-][A-Za-z0-9_./-]*$') then return false; end if;
 select jsonb_agg(v order by v collate "C") into scope from (select distinct x.v from jsonb_array_elements_text(b->'reviewed_files') as x(v)) as ordered;
 if scope<>b->'reviewed_files' then return false; end if;
 if jsonb_typeof(b->'fixtures')<>'array' or jsonb_array_length(b->'fixtures') not between 1 and 64 then return false; end if;
 for f in select value from jsonb_array_elements(b->'fixtures') loop
  if jsonb_typeof(f)<>'object' or jsonb_typeof(f->'id')<>'string' or jsonb_typeof(f->'sha256')<>'string' or not(f ?& array['id','sha256']) or f-array['id','sha256']<>'{}'::jsonb or coalesce(f->>'id','') !~ '^[a-z][a-z0-9-]{0,63}$' or coalesce(f->>'sha256','') !~ '^[a-f0-9]{64}$' then return false; end if;
 end loop;
 if (select count(distinct value->>'id') from jsonb_array_elements(b->'fixtures'))<>jsonb_array_length(b->'fixtures') then return false; end if;
 return true;
exception when others then return false;
end $$;
create table tabwise_admission.authorizations (
 id text primary key check(id ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$'),
 binding jsonb not null check(tabwise_admission.valid_binding(binding) is true),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 receipt jsonb,
 check(binding->>'purpose' in ('w2a-qualification','r2-execution')),
 check(binding->>'repository'='ANIRUDDH-001/Tabwise'),
 check(binding->>'revision' ~ '^[a-f0-9]{40}$'),
 check(binding->'permitted_attempt'='1'::jsonb),
 check(expires_at=(binding->>'expires_at')::timestamptz)
);
alter table tabwise_admission.authorizations enable row level security;
revoke all on tabwise_admission.authorizations from public,anon,authenticated,service_role;
create function tabwise_admission.immutable_authorization() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception 'W5 authorization cannot be deleted'; end if;
 if new.id<>old.id or new.binding<>old.binding or new.expires_at<>old.expires_at or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) or (old.receipt is not null and new.receipt is distinct from old.receipt) then raise exception 'W5 authorization immutable or consumed'; end if;
 return new;
end $$;
create trigger w5_immutable before update or delete on tabwise_admission.authorizations for each row execute function tabwise_admission.immutable_authorization();
-- Issuance is separate from consumption. No HTTP issuer or owner-approval fabrication exists in W5.
-- Both the table constraint and authenticated service validate the complete binding before issuance.
create function tabwise_admission.issue(p_id text,p_binding jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_binding is null or jsonb_typeof(p_binding)<>'object' or (p_binding->>'expires_at')::timestamptz<=clock_timestamp() then raise exception 'W5 invalid issuance'; end if;
 insert into tabwise_admission.authorizations(id,binding,expires_at) values(p_id,p_binding,(p_binding->>'expires_at')::timestamptz);
end $$;
create function tabwise_admission.consume(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a tabwise_admission.authorizations; r jsonb; t timestamptz;
begin
 if p_request is null or jsonb_typeof(p_request)<>'object' or p_request->>'action'<>'consume' or p_request->'consumer' is null or jsonb_typeof(p_request->'consumer')<>'object' or (select count(*) from jsonb_object_keys(p_request->'consumer'))<>2 or coalesce(p_request->'consumer'->>'run_id','') !~ '^[1-9][0-9]{0,19}$' or p_request->'consumer'->'attempt' is distinct from '1'::jsonb or coalesce(p_request->>'coordinator_key','') not like '-----BEGIN PUBLIC KEY-----%' then raise exception 'W5 malformed consumer'; end if;
 select * into a from tabwise_admission.authorizations where id=p_request->>'id' for update;
 t:=clock_timestamp();
 if not found or a.revoked_at is not null or a.expires_at<=t or a.binding is distinct from p_request->'binding' then raise exception 'W5 authorization refused'; end if;
 if a.receipt is not null then
  if a.receipt->'consumer' is distinct from p_request->'consumer' then raise exception 'W5 consumed by another run'; end if;
  return jsonb_build_object('fresh',false,'receipt',a.receipt);
 end if;
 r:=jsonb_build_object('schema','tabwise-r2-consumption/1','authorization_id',a.id,'binding',a.binding,'consumer',p_request->'consumer','coordinator_key',p_request->>'coordinator_key','consumed_at',to_char(t at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'consumption_id',gen_random_uuid()::text);
 update tabwise_admission.authorizations set receipt=r where id=a.id;
 return jsonb_build_object('fresh',true,'receipt',r);
end $$;
create function tabwise_admission.read_receipt(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a tabwise_admission.authorizations;
begin
 select * into a from tabwise_admission.authorizations where id=p_request->>'id';
 if not found or a.revoked_at is not null or a.expires_at<=clock_timestamp() or a.receipt is null or a.binding is distinct from p_request->'binding' or a.receipt->'consumer' is distinct from p_request->'consumer' then raise exception 'W5 receipt unavailable'; end if;
 return jsonb_build_object('fresh',false,'receipt',a.receipt);
end $$;
create function tabwise_admission.revoke(p_id text) returns void language plpgsql security definer set search_path='' as $$
begin
 update tabwise_admission.authorizations set revoked_at=clock_timestamp() where id=p_id and revoked_at is null;
end $$;
revoke all on all functions in schema tabwise_admission from public,anon,authenticated,service_role;
-- Public wrappers are SECURITY INVOKER. Only the server role can enter the private operations.
grant usage on schema tabwise_admission to service_role;
grant execute on function tabwise_admission.issue(text,jsonb),tabwise_admission.consume(jsonb),tabwise_admission.read_receipt(jsonb),tabwise_admission.revoke(text) to service_role;
create function public.w5_consume(p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$select tabwise_admission.consume(p_request)$$;
create function public.w5_read_receipt(p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$select tabwise_admission.read_receipt(p_request)$$;
revoke all on function public.w5_consume(jsonb),public.w5_read_receipt(jsonb) from public,anon,authenticated;
grant execute on function public.w5_consume(jsonb),public.w5_read_receipt(jsonb) to service_role;
commit;
