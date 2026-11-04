-- Isolated engineering candidates only. Production run/admission/budget policies
-- and evidence tables are deliberately untouched.
create table public.candidate_native_runs(
 product_run_id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 journey_version_id uuid not null references public.journey_versions(id),
 idempotency_key text not null check(length(idempotency_key) between 1 and 128),
 classification text not null default 'NONPRODUCTION_UNQUALIFIED' check(classification='NONPRODUCTION_UNQUALIFIED'),
 production_qualified boolean not null default false check(production_qualified=false),
 spec jsonb not null,
 state text not null default 'SAVED' check(state in ('SAVED','PREPARED','DISPATCH_INTENT','DISPATCH_UNKNOWN','RUN_BOUND','EVIDENCE_READY','FAILED')),
 request jsonb,
 spec_text text,
 github_run_id text unique check(github_run_id ~ '^[1-9][0-9]{0,19}$'),
 readback jsonb,
 artifact_id text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,idempotency_key)
);
alter table public.candidate_native_runs enable row level security;
revoke all on public.candidate_native_runs from public,anon,authenticated;
grant select on public.candidate_native_runs to authenticated;
grant select,insert,update on public.candidate_native_runs to service_role;
create policy candidate_owned_read on public.candidate_native_runs for select to authenticated using(user_id=(select auth.uid()));

create function public.candidate_native_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if new.product_run_id<>old.product_run_id or new.user_id<>old.user_id or new.journey_version_id<>old.journey_version_id or new.idempotency_key<>old.idempotency_key or new.spec<>old.spec or new.created_at<>old.created_at
 or (old.request is not null and (new.request is distinct from old.request or new.spec_text is distinct from old.spec_text))
 or (old.github_run_id is not null and new.github_run_id is distinct from old.github_run_id)
 or old.state in ('EVIDENCE_READY','FAILED') then raise check_violation using message='immutable candidate identity/source';end if;
 return new;
end $$;
create trigger candidate_native_immutable before update on public.candidate_native_runs for each row execute function public.candidate_native_immutable();

create function public.create_candidate_native_run(p_user uuid,p_version uuid,p_key text) returns jsonb language plpgsql set search_path='' as $$
declare v public.journey_versions; r public.candidate_native_runs; rid uuid:=gen_random_uuid(); keys jsonb;
begin
 perform pg_advisory_xact_lock(781429);
 if p_user is null or p_key is null or length(p_key) not between 1 and 128 then raise check_violation using message='candidate identity required';end if;
 select * into v from public.journey_versions where id=p_version and user_id=p_user;
 if not found or v.journey_id<>'fernway-seat' then raise check_violation using message='owned candidate version required';end if;
 select jsonb_agg(e->>'key' order by n) into keys from jsonb_array_elements(v.steps) with ordinality s(e,n);
 if keys is distinct from '["Tab","Enter","Tab","Tab","Enter"]'::jsonb or jsonb_array_length(v.steps)<>5 or exists(select from jsonb_array_elements(v.steps) with ordinality s(e,n) where (e->>'step')::int is distinct from n::int or e->'text' is distinct from 'null'::jsonb) then raise check_violation using message='fixed candidate keys required';end if;
 select * into r from public.candidate_native_runs where user_id=p_user and idempotency_key=p_key;
 if found then if r.journey_version_id<>p_version then raise check_violation using message='candidate key/version conflict';end if;return to_jsonb(r);end if;
 if exists(select from public.candidate_native_runs where state not in ('EVIDENCE_READY','FAILED')) then raise check_violation using message='candidate already active';end if;
 if (select count(*) from public.candidate_native_runs where created_at>=date_trunc('day',now()))>=8 then raise check_violation using message='candidate daily ceiling';end if;
 insert into public.candidate_native_runs(product_run_id,user_id,journey_version_id,idempotency_key,spec)
 values(rid,p_user,v.id,p_key,jsonb_build_object('version','0.1.0','run_id',rid,'journey_id','fernway-seat','app_hash','5ad4631558cdcc557770ae864957ffc167546cd0af58bd11258808e1c0e523be','variant','broken','steps',v.steps)) returning * into r;
 return to_jsonb(r);
end $$;

create function public.prepare_candidate_native_run(p_user uuid,p_run uuid,p_request jsonb,p_canonical text,p_spec text) returns jsonb language plpgsql set search_path='' as $$
declare r public.candidate_native_runs;
begin
 select * into r from public.candidate_native_runs where product_run_id=p_run and user_id=p_user for update;
 if not found then raise check_violation using message='owned candidate required';end if;
 if coalesce(length(p_spec)>60000 or length(p_canonical)>60000 or p_spec::jsonb<>r.spec or (p_canonical::jsonb)<>(p_request-'request_sha256')
 or p_request->>'request_sha256'<>encode(sha256(convert_to(p_canonical,'UTF8')),'hex')
 or p_request->>'spec_sha256'<>encode(sha256(convert_to(p_spec,'UTF8')),'hex')
 or p_request->>'schema'<>'tabwise-candidate-native-request/1' or p_request->>'classification'<>'NONPRODUCTION_UNQUALIFIED'
 or p_request->>'production_qualified'<>'false' or p_request->>'execution_authorized'<>'false'
 or p_request->>'user_id'<>p_user::text or p_request->>'product_run_id'<>p_run::text or p_request->>'journey_version_id'<>r.journey_version_id::text
 or p_request->>'repository'<>'ANIRUDDH-001/Tabwise' or p_request->>'actor'<>'ANIRUDDH-001' or p_request->>'workflow'<>'.github/workflows/tabwise-r2-native-diagnostic.yml'
 or p_request->>'ref'<>'refs/heads/feat/tabwise-r2-r7-product-completion'
 or p_request->>'fixture_sha256'<>r.spec->>'app_hash' or p_request->>'variant'<>'broken' or p_request->>'journey_id'<>'fernway-seat'
 or p_request->'actions'<>'["Tab","Enter","Tab","Tab","Enter"]'::jsonb
 or not(p_request->>'revision' ~ '^[a-f0-9]{40}$') or not(p_request->>'source_scope_sha256' ~ '^[a-f0-9]{64}$') or not(p_request->>'runtime_scope_sha256' ~ '^[a-f0-9]{64}$')
 or (select count(*) from jsonb_object_keys(p_request))<>20,true) then raise check_violation using message='candidate source/request binding';end if;
 if r.state<>'SAVED' then
  if r.request=p_request and r.spec_text=p_spec then return to_jsonb(r);end if;
  raise check_violation using message='immutable candidate request conflict';
 end if;
 update public.candidate_native_runs set request=p_request,spec_text=p_spec,state='PREPARED',updated_at=now() where product_run_id=p_run returning * into r;return to_jsonb(r);
end $$;

create function public.transition_candidate_native_run(p_user uuid,p_run uuid,p_request_sha text,p_action text,p_gh_run_id text default null) returns jsonb language plpgsql set search_path='' as $$
declare r public.candidate_native_runs; next_state text;
begin
 select * into r from public.candidate_native_runs where product_run_id=p_run and user_id=p_user for update;
 if not found or r.request is null or r.request->>'request_sha256'<>p_request_sha then raise check_violation using message='candidate request binding';end if;
 if p_action='intent' and r.state='PREPARED' and p_gh_run_id is null then next_state:='DISPATCH_INTENT';
 elsif p_action='unknown' and r.state='DISPATCH_INTENT' and p_gh_run_id is null then next_state:='DISPATCH_UNKNOWN';
 elsif p_action='accepted' and r.state in ('DISPATCH_INTENT','DISPATCH_UNKNOWN','RUN_BOUND') and p_gh_run_id ~ '^[1-9][0-9]{0,19}$' and (r.github_run_id is null or r.github_run_id=p_gh_run_id) then
  if r.state='RUN_BOUND' then return to_jsonb(r);end if;next_state:='RUN_BOUND';
 elsif p_action='failed' and r.state not in ('EVIDENCE_READY','FAILED') then next_state:='FAILED';
 else raise check_violation using message='candidate transition refused';end if;
 update public.candidate_native_runs set state=next_state,github_run_id=coalesce(r.github_run_id,p_gh_run_id),updated_at=now() where product_run_id=p_run returning * into r;return to_jsonb(r);
end $$;
revoke all on function public.candidate_native_immutable(),public.create_candidate_native_run(uuid,uuid,text),public.prepare_candidate_native_run(uuid,uuid,jsonb,text,text),public.transition_candidate_native_run(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.create_candidate_native_run(uuid,uuid,text),public.prepare_candidate_native_run(uuid,uuid,jsonb,text,text),public.transition_candidate_native_run(uuid,uuid,text,text,text) to service_role;
