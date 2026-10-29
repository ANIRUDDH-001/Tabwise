create function public.admit_version(p_user uuid,p_version uuid,p_key text) returns jsonb language plpgsql set search_path='' as $$
declare v public.journey_versions; a public.apps; result jsonb; kind text; rid uuid;
begin
 perform pg_advisory_xact_lock(781426);
 select * into v from public.journey_versions where id=p_version and user_id=p_user;
 if not found then return jsonb_build_object('reason','journey_version_not_found','http_status',404); end if;
 select apps.* into a from public.apps join public.journeys j on j.app_id=apps.id where j.id=v.journey_id;
 if a.base_sha256 is null then return jsonb_build_object('reason','app_not_pinned','http_status',409); end if;
 kind:=case when exists(select from public.operators where user_id=p_user) then 'owner' else 'public' end;
 result:=public.admit_run(p_user,kind,v.journey_id,p_key);
 if result->>'run_id' is not null then
  rid:=(result->>'run_id')::uuid;
  update public.runs set journey_version_id=v.id,spec=jsonb_build_object('version','0.1.0','run_id',rid,'journey_id',v.journey_id,'app_hash',a.base_sha256,'variant','broken','steps',v.steps) where id=rid and journey_version_id is null;
 end if;
 return result;
end $$;
revoke all on function public.admit_version(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admit_version(uuid,uuid,text) to service_role;
