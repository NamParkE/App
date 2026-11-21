-- 운영자 메뉴: 운영자만, 숫자만 (0008)
\set U '00000000-0000-0000-0000-00000000000a'
\set W '00000000-0000-0000-0000-00000000000c'
\set OP '00000000-0000-0000-0000-0000000000ff'

-- 운영자가 아닌 사람(가족 관리자 포함)은 모든 운영자 함수에서 거절
select set_config('request.jwt.claim.sub', :'U', true);
set local role authenticated;
select is_operator() as u_op \gset
do $$ begin perform admin_overview(); raise exception 'TEST FAILED: 운영자 아님에도 admin_overview';
exception when insufficient_privilege then raise notice 'ok - 가족 관리자도 운영자 메뉴는 못 본다'; end $$;
do $$ begin perform admin_set_limit('00000000-0000-0000-0000-00000000000c', 200); raise exception 'TEST FAILED: 운영자 아님에도 한도 변경';
exception when insufficient_privilege then raise notice 'ok - 운영자가 아니면 한도를 못 바꾼다'; end $$;
do $$ begin perform count(*) from ai_calls; raise exception 'TEST FAILED: AI 비용 기록을 읽음';
exception when insufficient_privilege then raise notice 'ok - 사용자는 AI 비용 기록을 못 읽는다'; end $$;
reset role;
select test.ok(not :'u_op'::boolean, 'owner_emails 와 상관없이 operator_emails 만 운영자');

-- 운영자
select set_config('request.jwt.claim.sub', :'OP', true);
set local role authenticated;
select is_operator() as op_op \gset
select admin_set_limit(:'W', 50) as new_limit \gset
select (admin_overview()->>'total_users')::int as total \gset
select admin_member(:'W')::text as member_json \gset
do $$ begin perform admin_set_limit('00000000-0000-0000-0000-00000000000c', 500); raise exception 'TEST FAILED: 범위 밖 한도';
exception when invalid_parameter_value then raise notice 'ok - 한도는 0~200'; end $$;
reset role;
select test.ok(:'op_op'::boolean, 'operator_emails 에 있으면 운영자');
select test.ok(:new_limit = 50 and (select daily_limit from profiles where id = :'W') = 50, '운영자는 다른 가족의 한도를 바꾼다');
select test.ok((select old_limit = 30 and new_limit = 50 from limit_changes where user_id = :'W'), '한도 변경 기록이 남는다');
select test.ok(:total = 4, '운영자 홈: 모든 가족의 사람 수');
select test.ok(:'member_json' not like '%"text"%' and :'member_json' not like '%said%', '사람 상세에 대화 · 문장 내용은 없다');

-- 이메일 확인을 마치지 않은 계정은 운영자가 아니다
update auth.users set email_confirmed_at = null where id = :'OP';
select set_config('request.jwt.claim.sub', :'OP', true);
set local role authenticated;
select is_operator() as op_unconfirmed \gset
reset role;
select test.ok(not :'op_unconfirmed'::boolean, '이메일 미확인 계정은 운영자가 아니다');
