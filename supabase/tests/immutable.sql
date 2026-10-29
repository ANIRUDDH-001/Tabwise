begin;
insert into public.reports(slug,snapshot,sha256,created_by) values('synthetic-test','{}',repeat('a',64),'00000000-0000-4000-8000-000000000001');
do $$ declare denied boolean:=false; result jsonb; begin
 begin update public.reports set snapshot='{"tampered":true}' where slug='synthetic-test';exception when check_violation then denied:=true;end;
 if not denied then raise exception 'report mutation accepted';end if;
 result:=public.reserve_diagnosis('00000000-0000-4000-8000-000000000001',null,1);
 if result->>'reason'<>'diagnosis_off' then raise exception 'diagnosis gate missing';end if;
end $$;
select 'PASS immutable report and disabled inference admission' as result;
rollback;
