-- Dedicated Tabwise project only. Persistence does not enable inference or dispatch.
alter table public.findings add column diagnosis_id uuid references public.diagnoses(id);
create index findings_diagnosis on public.findings(diagnosis_id);

create function public.persist_diagnosis(
 p_user uuid,p_run uuid,p_model text,p_input_sha text,p_prompt_sha text,
 p_output jsonb,p_usage jsonb,p_reservation uuid,p_findings jsonb
) returns jsonb language plpgsql set search_path='' as $$
declare d public.diagnoses; r public.runs; reservation public.budget_reservations; entry jsonb; patch jsonb; finding_id uuid; finding_ids uuid[]:='{}'; patch_ids uuid[]:='{}'; patch_id uuid;
begin
 if p_model<>'muse-spark-1.3' or p_input_sha !~ '^[a-f0-9]{64}$' or p_prompt_sha !~ '^[a-f0-9]{64}$' or p_input_sha is null or p_prompt_sha is null then raise check_violation using message='invalid model provenance';end if;
 select * into r from public.runs where id=p_run and user_id=p_user;
 if not found or r.status<>'completed' or r.evidence_status<>'complete' then raise check_violation using message='owned qualified run required';end if;
 select * into reservation from public.budget_reservations where id=p_reservation and run_id=p_run;
 if not found or reservation.state<>'settled' or reservation.settled_nano is null then raise check_violation using message='settled reservation required';end if;
 if jsonb_typeof(p_output)<>'object' or coalesce(p_output->>'verdict','') not in ('barrier_found','no_barrier','insufficient_evidence') or jsonb_typeof(p_output->'findings')<>'array' or jsonb_typeof(p_findings)<>'array' or jsonb_array_length(p_findings)>25 or jsonb_array_length(p_findings)<>jsonb_array_length(p_output->'findings') then raise check_violation using message='invalid diagnosis payload';end if;
 perform pg_advisory_xact_lock(hashtext('tabwise-diagnosis:'||p_input_sha||p_prompt_sha));
 select * into d from public.diagnoses where input_sha256=p_input_sha and model=p_model and prompt_sha256=p_prompt_sha;
 if found then
  if d.run_id<>p_run then raise check_violation using message='diagnosis identity mismatch';end if;
  return jsonb_build_object('diagnosis_id',d.id,'cached',true);
 end if;
 if exists(select from public.diagnoses where reservation_id=p_reservation) then raise check_violation using message='reservation already associated with another diagnosis';end if;
 insert into public.diagnoses(run_id,model,mode,prompt_sha256,input_sha256,output,usage,cost_nano,reservation_id)
 values(p_run,p_model,'standard',p_prompt_sha,p_input_sha,p_output,p_usage,reservation.settled_nano,p_reservation) returning * into d;
 for entry in select value from jsonb_array_elements(p_findings) loop
  insert into public.findings(run_id,diagnosis_id,source,step,title,mechanism,evidence_refs,location,confidence)
  values(p_run,d.id,'spark',(entry->>'step')::integer,entry->>'title',entry->>'mechanism',array(select jsonb_array_elements_text(entry->'evidence_refs')),entry->'location',entry->>'confidence') returning id into finding_id;
  finding_ids:=array_append(finding_ids,finding_id);
  patch:=entry->'patch_contract';
  if patch is not null and patch<>'null'::jsonb then
   if coalesce(patch->>'version','')<>'0.1.0' or coalesce(patch->>'run_id','')<>p_run::text or patch->>'base_sha256' is distinct from r.spec->>'app_hash' or coalesce(patch->'files','null'::jsonb)<>'["index.html"]'::jsonb or octet_length(patch->>'diff')>16000 or (patch->>'patch_sha256' is null or patch->>'patch_sha256' !~ '^[a-f0-9]{64}$') or entry->'patch_validation'->>'ok' is distinct from 'true' then raise check_violation using message='unvalidated patch contract';end if;
   insert into public.patches(finding_id,run_id,diff,files,validator)
   values(finding_id,p_run,patch->>'diff',array['index.html'],jsonb_build_object('ok',true,'contract',patch,'checks',entry->'patch_validation'->'checks','evidence_class','MACHINE','independence','L3')) returning id into patch_id;
   patch_ids:=array_append(patch_ids,patch_id);
  end if;
 end loop;
 insert into public.audit_log(actor,action,subject,detail) values(p_user::text,'diagnosis_stored',d.id::text,jsonb_build_object('run_id',p_run,'reservation_id',p_reservation,'cost_nano',reservation.settled_nano,'verdict',p_output->>'verdict'));
 return jsonb_build_object('diagnosis_id',d.id,'finding_ids',finding_ids,'patch_ids',patch_ids,'cached',false);
end $$;
revoke all on function public.persist_diagnosis(uuid,uuid,text,text,text,jsonb,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.persist_diagnosis(uuid,uuid,text,text,text,jsonb,jsonb,uuid,jsonb) to service_role;
