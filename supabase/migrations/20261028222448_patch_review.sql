-- Human decision only. No dispatch, verification, inference or allocation activation.
create function public.review_patch(p_user uuid,p_patch uuid,p_decision text,p_patch_sha text)
returns jsonb language plpgsql set search_path='' as $$
declare p public.patches; r public.runs; current_hash text;
begin
 if p_user is null or p_decision is null or p_decision not in ('approved','rejected') or p_patch_sha is null or p_patch_sha !~ '^[a-f0-9]{64}$' then raise check_violation using message='invalid review decision';end if;
 select * into p from public.patches where id=p_patch for update;
 if not found then raise check_violation using message='patch not found';end if;
 select * into r from public.runs where id=p.run_id and user_id=p_user;
 if not found or r.status<>'completed' or r.evidence_status<>'complete' then raise check_violation using message='owned qualified baseline required';end if;
 select base_sha256 into current_hash from public.apps where id='fernway';
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
