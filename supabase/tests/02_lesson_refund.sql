-- 수업 환불: 대답 없이 중도 종료한 수업만, 한 번만 (0006)
\set U '00000000-0000-0000-0000-00000000000a'

insert into lesson_plans (id, family_id, topic_id, level, plan)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'c-food', 1, '{}');
insert into lessons (id, user_id, topic_id, level, plan_id) values
  ('30000000-0000-0000-0000-000000000001', :'U', 'c-food', 1, '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', :'U', 'c-food', 1, '20000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claim.sub', :'U', true);
set local role authenticated;
select r->>'ticket' as t1 from (select charge_usage(5) r) x \gset
select r->>'ticket' as t2 from (select charge_usage(5) r) x \gset
select link_charge(:'t1', '30000000-0000-0000-0000-000000000001');
select link_charge(:'t2', '30000000-0000-0000-0000-000000000002');
select refund_lesson('30000000-0000-0000-0000-000000000001') as active_refund \gset
reset role;
select test.ok(not :'active_refund'::boolean, '진행 중인 수업은 환불되지 않는다');

-- 수업 1: 대답 없이 중도 종료 / 수업 2: 센 대답 1번 후 중도 종료
update lessons set status = 'left' where id in ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002');
insert into lesson_messages (lesson_id, user_id, role, text, counted)
values ('30000000-0000-0000-0000-000000000002', :'U', 'user', 'I like pizza.', true);

select set_config('request.jwt.claim.sub', :'U', true);
set local role authenticated;
select refund_lesson('30000000-0000-0000-0000-000000000001') as r1 \gset
select refund_lesson('30000000-0000-0000-0000-000000000001') as r1_again \gset
select refund_lesson('30000000-0000-0000-0000-000000000002') as r2 \gset
reset role;
select test.ok(:'r1'::boolean, '대답 없이 끝난 수업은 환불된다');
select test.ok(not :'r1_again'::boolean, '같은 수업은 두 번 환불되지 않는다');
select test.ok(not :'r2'::boolean, '대답을 한 수업은 환불되지 않는다');
select test.ok((select count from usage_daily where user_id = :'U' and day = today_kst()) = 5, '사용량: 10회 차감 - 5회 환불 = 5');

-- 끝난 수업은 다시 진행 중으로 되돌릴 수 없다 (환불받고 이어 쓰기 방지)
do $$ begin
  update lessons set status = 'active' where id = '30000000-0000-0000-0000-000000000001';
  raise exception 'TEST FAILED: 끝난 수업을 되살림';
exception when raise_exception then
  if sqlerrm like 'TEST FAILED%' then raise; end if;
  raise notice 'ok - 끝난 수업은 되살릴 수 없다';
end $$;
