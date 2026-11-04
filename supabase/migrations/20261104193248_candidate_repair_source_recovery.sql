-- Recover the same immutable repair even after a browser loses its request key.
create unique index candidate_repair_source_once on public.candidate_native_runs(user_id,(repair->>'baseline_run_id'),(repair->>'patch_sha256')) where repair is not null;
create or replace function public.create_candidate_repair_run(p_user uuid,p_baseline uuid,p_key text,p_review jsonb,p_source text,p_patch text) returns jsonb language plpgsql set search_path='' as $$
declare b public.candidate_native_runs;r public.candidate_native_runs;rid uuid:=gen_random_uuid();repair jsonb;
begin
 perform pg_advisory_xact_lock(781429);
 if coalesce(p_user<>'6198bfc5-5937-46d9-8eac-9b7599cbee52'::uuid or length(p_key) not between 1 and 128 or length(p_source)>100000 or length(p_patch)>12000
 or encode(sha256(convert_to(p_source,'UTF8')),'hex')<>'1860345c688f2adfe7241b97f05ba32fe345f08b0594cff8476d7b6e70e484ce'
 or encode(sha256(convert_to(p_patch,'UTF8')),'hex')<>'015d122118b5306e9528048f83abf5f293cc5603422b6182bce06e06d743f739'
 or p_review->>'decision'<>'approved' or p_review->>'decision_text'<>'Approve this exact focus-restoration patch'
 or p_review->>'reviewed_by'<>p_user::text or p_review->>'base_sha256'<>'5ad4631558cdcc557770ae864957ffc167546cd0af58bd11258808e1c0e523be'
 or p_review->>'patch_sha256'<>'015d122118b5306e9528048f83abf5f293cc5603422b6182bce06e06d743f739'
 or p_review->>'source_sha256'<>'1860345c688f2adfe7241b97f05ba32fe345f08b0594cff8476d7b6e70e484ce',true) then raise check_violation using message='exact actual reviewed candidate repair required';end if;
 select * into b from public.candidate_native_runs where product_run_id=p_baseline and user_id=p_user;
 if not found or b.state<>'EVIDENCE_READY' or b.repair is not null or b.spec->>'variant'<>'broken' or b.spec->>'app_hash'<>'5ad4631558cdcc557770ae864957ffc167546cd0af58bd11258808e1c0e523be' or coalesce(b.readback->>'native_interaction_pass','false')<>'true' then raise check_violation using message='owned stored genuine candidate baseline required';end if;
 repair:=jsonb_build_object('baseline_run_id',p_baseline,'base_sha256',b.spec->>'app_hash','patch_sha256',p_review->>'patch_sha256','source_sha256',p_review->>'source_sha256','source',p_source,'diff',p_patch,'review',p_review);
 select * into r from public.candidate_native_runs where user_id=p_user and idempotency_key=p_key;
 if found then if r.repair is distinct from repair then raise check_violation using message='candidate repair key/source conflict';end if;return to_jsonb(r);end if;
 select * into r from public.candidate_native_runs c where c.user_id=p_user and c.repair->>'baseline_run_id'=p_baseline::text and c.repair->>'patch_sha256'=p_review->>'patch_sha256';
 if found then if r.repair is distinct from repair then raise check_violation using message='candidate repair source conflict';end if;return to_jsonb(r);end if;
 if exists(select from public.candidate_native_runs where state not in ('EVIDENCE_READY','FAILED')) then raise check_violation using message='candidate already active';end if;
 if (select count(*) from public.candidate_native_runs where created_at>=date_trunc('day',now()))>=8 then raise check_violation using message='candidate daily ceiling';end if;
 insert into public.candidate_native_runs(product_run_id,user_id,journey_version_id,idempotency_key,spec,repair)
 values(rid,p_user,b.journey_version_id,p_key,b.spec||jsonb_build_object('run_id',rid,'variant','patched','app_hash',p_review->>'source_sha256','patch_ref',p_review->>'patch_sha256'),repair) returning * into r;
 return to_jsonb(r);
end $$;
