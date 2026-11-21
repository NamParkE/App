-- 사용량 차감 · 영수증 환불 (0004, 0006)
\set U '00000000-0000-0000-0000-00000000000a'
\set W '00000000-0000-0000-0000-00000000000c'

select set_config('request.jwt.claim.sub', :'U', true);
set local role authenticated;
select (r->>'left')::int as left1, r->>'ticket' as t1 from (select charge_usage(1) r) x \gset
select (r->>'left')::int as left2, r->>'ticket' as t2 from (select charge_usage(5) r) x \gset
select refund_charge(:'t1') as refund1 \gset
select refund_charge(:'t1') as refund2 \gset
reset role;

select test.ok(:left1 = 29 and :'t1' <> '', '1회 차감: 30회 중 29회 남고 영수증이 나온다');
select test.ok(:left2 = 24, '5회 차감: 24회 남음');
select test.ok(:'refund1'::boolean, '영수증으로 환불된다');
select test.ok(not :'refund2'::boolean, '같은 영수증으로 두 번 환불되지 않는다');
select test.ok((select count from usage_daily where user_id = :'U' and day = today_kst()) = 5, '환불 뒤 오늘 사용 5회 (1 + 5 - 1)');

-- 다른 사람은 내 영수증으로 환불할 수 없다
select set_config('request.jwt.claim.sub', :'W', true);
set local role authenticated;
select refund_charge(:'t2') as w_refund \gset
reset role;
select test.ok(not :'w_refund'::boolean, '다른 사람의 영수증은 환불되지 않는다');

-- 한도를 넘으면 차감하지 않는다
update profiles set daily_limit = 6 where id = :'U';
select set_config('request.jwt.claim.sub', :'U', true);
set local role authenticated;
select (r->>'left')::int as left3, coalesce(r->>'ticket', '') as t3 from (select charge_usage(5) r) x \gset
reset role;
select test.ok(:left3 = -1 and :'t3' = '', '한도를 넘으면 -1, 영수증 없음');
select test.ok((select count from usage_daily where user_id = :'U' and day = today_kst()) = 5, '한도를 넘은 차감은 사용량을 바꾸지 않는다');

-- 사용자는 사용량 · 영수증 · 한도를 직접 고칠 수 없다
select set_config('request.jwt.claim.sub', :'U', true);
set local role authenticated;
do $$ begin
  update usage_daily set count = 0 where user_id = auth.uid();
  raise exception 'TEST FAILED: 사용량을 직접 고칠 수 있음';
exception when insufficient_privilege then raise notice 'ok - 사용량은 직접 고칠 수 없다';
end $$;
do $$ begin
  perform count(*) from usage_charges;
  raise exception 'TEST FAILED: 영수증 표를 읽을 수 있음';
exception when insufficient_privilege then raise notice 'ok - 영수증 표는 읽을 수 없다';
end $$;
do $$ begin
  update profiles set daily_limit = 999 where id = auth.uid();
  raise exception 'TEST FAILED: 자기 한도를 고칠 수 있음';
exception when insufficient_privilege then raise notice 'ok - 자기 한도는 고칠 수 없다';
end $$;
reset role;
