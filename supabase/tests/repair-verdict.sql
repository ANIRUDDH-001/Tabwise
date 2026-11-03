begin;
-- Synthetic persistence-contract records only; no native evidence or repair success claim.
do $$
declare o uuid:='00000000-0000-4000-8000-000000000001';
b uuid:='00000000-0000-4000-8000-000000000060';v uuid:='00000000-0000-4000-8000-000000000061';p uuid:='00000000-0000-4000-8000-000000000062';a uuid:='00000000-0000-4000-8000-000000000063';j uuid:='00000000-0000-4000-8000-000000000064';r jsonb;first_result jsonb;denied boolean;
begin
 insert into public.journey_versions(id,journey_id,user_id,n,steps,sha256) values(j,'fernway-passenger',o,99,'[]',repeat('a',64));
 insert into public.runs(id,user_id,journey_id,access_kind,status,evidence_status,deadline_at,spec,kind) values(b,o,'fernway-passenger','owner','completed','complete',now(),jsonb_build_object('app_hash',repeat('a',64)),'baseline'),(v,o,'fernway-passenger','owner','admitted','complete',now(),jsonb_build_object('app_hash',encode(sha256(convert_to('candidate','UTF8')),'hex'),'patch_ref',encode(sha256(convert_to('diff','UTF8')),'hex')),'verify');
 insert into public.findings(id,run_id,source,step,title,evidence_refs) values('00000000-0000-4000-8000-000000000065',b,'spark',1,'Synthetic SQL fixture',array['synthetic:1']);
 insert into public.patches(id,run_id,finding_id,diff,files,validator,status,reviewed_by) values(p,b,'00000000-0000-4000-8000-000000000065','diff',array['index.html'],'{}','approved',o);
 insert into public.repair_applications(id,patch_id,user_id,run_id,base_sha256,patch_sha256,source_sha256,source) values(a,p,o,b,repeat('a',64),encode(sha256(convert_to('diff','UTF8')),'hex'),encode(sha256(convert_to('candidate','UTF8')),'hex'),'candidate');
 insert into public.repair_reruns values(v,a,b,encode(sha256(convert_to('candidate','UTF8')),'hex'),encode(sha256(convert_to('diff','UTF8')),'hex'),o,'verdict-test',j);
 insert into public.verifications(patch_id,baseline_run_id,verify_run_id) values(p,b,v);
 denied:=false;begin perform public.register_repair_oracle('00000000-0000-4000-8000-000000000002',p,'validation',1,'synthetic-contract-only');exception when check_violation then denied:=true;end;if not denied then raise exception 'foreign oracle accepted';end if;
 perform public.register_repair_oracle(o,p,'validation',1,'synthetic-contract-only');
 perform public.register_repair_oracle(o,p,'validation',1,'synthetic-contract-only');
 denied:=false;begin perform public.register_repair_oracle(o,p,'focus',1,'synthetic-contract-only');exception when check_violation then denied:=true;end;if not denied then raise exception 'oracle replay conflict accepted';end if;
 update public.runs set status='completed' where id=v;
 r:=jsonb_build_object('schema','tabwise-r3-verdict/1','run_id',v,'baseline_run_id',b,'application_id',a,'patch_id',p,'source_sha256',encode(sha256(convert_to('candidate','UTF8')),'hex'),'patch_sha256',encode(sha256(convert_to('diff','UTF8')),'hex'),'baseline_evidence_sha256',repeat('b',64),'rerun_evidence_sha256',repeat('c',64),'verdict','INCONCLUSIVE','checks',jsonb_build_object('evidence_complete',false),'evidence_class','MACHINE','independence','L3');
 r:=r||jsonb_build_object('oracle',(select to_jsonb(x) from public.repair_oracles x where patch_id=p));
 denied:=false;begin perform public.persist_repair_verdict(o,v,r);exception when check_violation then denied:=true;end;if not denied then raise exception 'gate bypass';end if;
 update public.system_flags set worker_review_verdict='PASS',qualification_ref='synthetic-SQL-only';
 denied:=false;begin perform public.persist_repair_verdict(o,v,r);exception when check_violation then denied:=true;end;if not denied then raise exception 'missing evidence accepted';end if;
 insert into public.artifacts(run_id,path,sha256,bytes,kind) values(b,'evidence.json',repeat('b',64),1,'evidence'),(v,'evidence.json',repeat('c',64),1,'evidence');
 denied:=false;begin perform public.persist_repair_verdict('00000000-0000-4000-8000-000000000002',v,r);exception when check_violation then denied:=true;end;if not denied then raise exception 'foreign owner accepted';end if;
 denied:=false;begin perform public.persist_repair_verdict(o,v,r||jsonb_build_object('source_sha256',repeat('0',64)));exception when check_violation then denied:=true;end;if not denied then raise exception 'source substitution accepted';end if;
 begin
  perform public.persist_repair_verdict(o,v,r);
  raise exception 'consumer crash before commit' using errcode='P0002';
 exception when no_data_found then null;end;
 if exists(select from public.repair_verdicts where verify_run_id=v) or exists(select from public.audit_log where action='repair_verdict_recorded' and subject=v::text) then raise exception 'crash left partial verdict';end if;
 first_result:=public.persist_repair_verdict(o,v,r);
 if (select count(*) from public.audit_log where action='repair_verdict_recorded' and subject=v::text)<>1 then raise exception 'audit cardinality';end if;
 if public.persist_repair_verdict(o,v,r)->>'replayed'<>'true' then raise exception 'retry not recovered';end if;
 denied:=false;begin perform public.persist_repair_verdict(o,v,r||'{"verdict":"FIXED"}'::jsonb);exception when check_violation then denied:=true;end;if not denied then raise exception 'replay conflict accepted';end if;
 denied:=false;begin update public.repair_verdicts set result='{}' where verify_run_id=v;exception when check_violation then denied:=true;end;if not denied then raise exception 'result mutable';end if;
 denied:=false;begin update public.verifications set verdict='FIXED' where verify_run_id=v;exception when check_violation then denied:=true;end;if not denied then raise exception 'projection mutable';end if;
end $$;
rollback;
