begin;
do $$
declare v_id uuid; id2 uuid; result jsonb; i integer;
begin
  if to_regprocedure('public.reserve_hosted(bigint,uuid)') is null then raise exception 'RED: broker missing'; end if;
  if (select ceiling_nano from public.hosted_budget where singleton) <> 40000000000 then raise exception 'hosted cap'; end if;
  update public.hosted_budget set spent_nano=39900000000;
  for i in 1..50 loop
    result:=public.reserve_hosted(10000000,null);
    if result->>'id' is not null then v_id:=(result->>'id')::uuid; end if;
  end loop;
  if (select spent_nano+reserved_nano from public.hosted_budget where singleton)>40000000000 then raise exception 'overshoot'; end if;
  result:=public.settle_hosted(v_id,10000001);
  if result->>'reason'<>'above_reservation' then raise exception 'above-reservation must alarm and retain'; end if;
  if (select state from public.budget_reservations where budget_reservations.id=v_id) <> 'open' then raise exception 'reservation lost'; end if;
end $$;
select 'PASS hosted ceiling and retained above-reservation rejection' as result;
rollback;
