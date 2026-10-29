begin;
insert into public.runs(id,user_id,journey_id,access_kind,status,deadline_at) values
('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','fernway-passenger','public','failed',now()),
('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002','fernway-passenger','public','failed',now());
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.runs)<>1 then raise exception 'RLS cross-user read'; end if;
 if exists(select from public.runs where user_id<>'00000000-0000-4000-8000-000000000001') then raise exception 'RLS leak'; end if;
 begin update public.runs set reason='unauthorized';raise exception 'client write accepted';exception when insufficient_privilege then null;end;
end $$;
set local role anon;
do $$ begin
 if exists(select from public.runs) then raise exception 'anonymous run read'; end if;
 if (select count(*) from public.projects where visibility='demo')<>1 then raise exception 'demo unavailable'; end if;
 begin perform public.reserve_hosted(1,null);raise exception 'client budget RPC accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS authenticated isolation, anonymous demo-only reads, no browser writes or broker RPC' as result;
rollback;
