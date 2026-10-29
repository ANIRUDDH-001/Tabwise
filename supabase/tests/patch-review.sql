begin;
do $$
declare owner_id uuid:='00000000-0000-4000-8000-000000000001'; run_id uuid:='00000000-0000-4000-8000-000000000060'; v_patch uuid; patch_hash text:=encode(sha256(convert_to('synthetic diff','UTF8')),'hex'); result jsonb; denied boolean;
begin
 if to_regprocedure('public.review_patch(uuid,uuid,text,text)') is null then raise exception 'RED: patch review function missing';end if;
 insert into public.runs(id,user_id,journey_id,access_kind,status,evidence_status,deadline_at,spec)
 values(run_id,owner_id,'fernway-passenger','owner','completed','complete',now(),jsonb_build_object('app_hash',(select base_sha256 from public.apps where id='fernway')));
 insert into public.patches(run_id,diff,files,validator)
 values(run_id,'synthetic diff',array['index.html'],jsonb_build_object('ok',true,'contract',jsonb_build_object('run_id',run_id,'base_sha256',(select base_sha256 from public.apps where id='fernway'),'patch_sha256',patch_hash))) returning id into v_patch;
 denied:=false;begin perform public.review_patch('00000000-0000-4000-8000-000000000002',v_patch,'approved',patch_hash);exception when check_violation then denied:=true;end;if not denied then raise exception 'cross-user decision accepted';end if;
 denied:=false;begin perform public.review_patch(owner_id,v_patch,'approved',repeat('0',64));exception when check_violation then denied:=true;end;if not denied then raise exception 'stale hash accepted';end if;
 result:=public.review_patch(owner_id,v_patch,'approved',patch_hash);if result->>'status'<>'approved' then raise exception 'approval not saved';end if;
 result:=public.review_patch(owner_id,v_patch,'approved',patch_hash);if result->>'replayed'<>'true' then raise exception 'approval not idempotent';end if;
 denied:=false;begin perform public.review_patch(owner_id,v_patch,'rejected',patch_hash);exception when check_violation then denied:=true;end;if not denied then raise exception 'opposite review overwrote approval';end if;
 if (select reviewed_by from public.patches where id=v_patch) is distinct from owner_id or (select reviewed_at from public.patches where id=v_patch) is null then raise exception 'review provenance missing';end if;
 if exists(select from public.verifications where verifications.patch_id=v_patch) then raise exception 'review dispatched or created a verification';end if;
 if has_function_privilege('authenticated','public.review_patch(uuid,uuid,text,text)','execute') or has_function_privilege('anon','public.review_patch(uuid,uuid,text,text)','execute') then raise exception 'browser RPC permission';end if;
end $$;
select 'PASS explicit digest-bound owner review, idempotency, conflict and browser denial; no verification created' as result;
rollback;
