-- 실전 모의고사 (0013): 한 달 횟수 · 마칠 때만 차감 · 두 번 세지 않음 · 내 것만 · 운영자만 횟수 변경
\set U '00000000-0000-0000-0000-00000000000a'
\set V '00000000-0000-0000-0000-00000000000b'
\set W '00000000-0000-0000-0000-00000000000c'
\set OP '00000000-0000-0000-0000-0000000000ff'

insert into mock_exams (id, user_id, self_level, questions) values
  ('e0000000-0000-0000-0000-000000000001', :'U', 4, '{}'),
  ('e0000000-0000-0000-0000-000000000002', :'U', 4, '{}'),
  ('e0000000-0000-0000-0000-000000000003', :'U', 4, '{}'),
  ('e0000000-0000-0000-0000-000000000004', :'U', 4, '{}'),
  ('e0000000-0000-0000-0000-000000000009', :'W', 4, '{}');

select test.ok((select mock_monthly_limit from profiles where id = :'U') = 3, '기본 횟수는 한 달 3회');
select test.ok(mock_used_this_month(:'U') = 0, '시작만 한 시험(나간 시험)은 세지 않는다');

-- 서버(service_role)만 마칠 수 있다
select set_config('request.jwt.claim.sub', :'U', true);
set local role authenticated;
do $$ begin
  perform finish_mock_exam('00000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001', 'same', '[]');
  raise exception 'TEST FAILED: 사용자가 직접 마침';
exception when insufficient_privilege then raise notice 'ok - 사용자는 시험을 직접 마칠 수 없다 (서버만)';
end $$;
do $$ begin
  update mock_exams set status = 'done', finished_at = now();
  raise exception 'TEST FAILED: 사용자가 시험 기록을 고침';
exception when insufficient_privilege then raise notice 'ok - 사용자는 시험 기록을 고칠 수 없다';
end $$;
do $$ begin
  update profiles set mock_monthly_limit = 30 where id = '00000000-0000-0000-0000-00000000000a';
  raise exception 'TEST FAILED: 사용자가 자기 횟수를 바꿈';
exception when insufficient_privilege then raise notice 'ok - 사용자는 자기 모의고사 횟수를 못 바꾼다';
end $$;
select count(*) as u_sees from mock_exams \gset
reset role;
select test.ok(:u_sees = 4, '내 시험만 보인다');

set local role service_role;
select finish_mock_exam(:'U', 'e0000000-0000-0000-0000-000000000001', 'same', '[{"n":1,"said":"hi"}]') as left1 \gset
select finish_mock_exam(:'U', 'e0000000-0000-0000-0000-000000000001', 'same', '[]') as left1b \gset
reset role;
select test.ok(:left1 = 2 and :left1b = 2, '마치면 1회 차감, 같은 시험을 다시 마쳐도 두 번 세지 않는다');
select test.ok((select status = 'done' and report_status = 'pending' and answers -> 0 ->> 'said' = 'hi' and adjusted = 'same'
  from mock_exams where id = 'e0000000-0000-0000-0000-000000000001'), '마친 시험: 답과 난이도를 저장하고 리포트를 기다린다');

set local role service_role;
select finish_mock_exam(:'U', 'e0000000-0000-0000-0000-000000000002', 'easier', '[]') as left2 \gset
select finish_mock_exam(:'U', 'e0000000-0000-0000-0000-000000000003', 'harder', '[]') as left3 \gset
do $$ begin
  perform finish_mock_exam('00000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000004', 'same', '[]');
  raise exception 'TEST FAILED: 한도를 넘어 마침';
exception when sqlstate '53400' then raise notice 'ok - 이번 달 횟수를 다 쓰면 더 마칠 수 없다';
end $$;
do $$ begin
  perform finish_mock_exam('00000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000009', 'same', '[]');
  raise exception 'TEST FAILED: 다른 사람의 시험을 마침';
exception when no_data_found then raise notice 'ok - 다른 사람의 시험은 마칠 수 없다';
end $$;
reset role;
select test.ok(:left2 = 1 and :left3 = 0 and mock_used_this_month(:'U') = 3, '세 번 마치면 이번 달 0회 남음');
select test.ok((select status from mock_exams where id = 'e0000000-0000-0000-0000-000000000004') = 'active', '거절된 시험은 그대로');

-- 지난달에 마친 시험은 이번 달 횟수에 들어가지 않는다 (매달 1일 다시 채움)
update mock_exams set finished_at = month_start_kst() - interval '1 second'
  where id in ('e0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000003');
select test.ok(mock_used_this_month(:'U') = 1, '지난달에 마친 시험은 이번 달 횟수에 안 들어간다');

-- 운영자: 횟수 보기 · 바꾸기. 운영자가 아니면 거절
select set_config('request.jwt.claim.sub', :'U', true);
set local role authenticated;
do $$ begin
  perform admin_set_mock_limit('00000000-0000-0000-0000-00000000000a', 10);
  raise exception 'TEST FAILED: 운영자 아닌데 횟수 변경';
exception when insufficient_privilege then raise notice 'ok - 운영자가 아니면 모의고사 횟수를 못 바꾼다';
end $$;
do $$ begin
  perform admin_member_mock('00000000-0000-0000-0000-00000000000a');
  raise exception 'TEST FAILED: 운영자 아닌데 조회';
exception when insufficient_privilege then raise notice 'ok - 운영자가 아니면 모의고사 사용을 못 본다';
end $$;
select set_config('request.jwt.claim.sub', :'OP', true);
select admin_set_mock_limit(:'U', 5) as new_mock \gset
select admin_member_mock(:'U')::text as mock_json \gset
do $$ begin
  perform admin_set_mock_limit('00000000-0000-0000-0000-00000000000a', 31);
  raise exception 'TEST FAILED: 범위 밖 횟수';
exception when invalid_parameter_value then raise notice 'ok - 모의고사 횟수는 0~30';
end $$;
reset role;
select test.ok(:new_mock = 5 and (select mock_monthly_limit from profiles where id = :'U') = 5, '운영자는 모의고사 월 횟수를 바꾼다');
select test.ok((:'mock_json'::json ->> 'mock_limit')::int = 5 and (:'mock_json'::json ->> 'used_month')::int = 1, '운영자 회원 화면: 월 횟수와 이번 달 사용');
select test.ok((select count(*) from mock_limit_changes where user_id = :'U') = 1
  and (select count(*) from limit_changes where user_id = :'U') = 0, '모의고사 횟수 변경은 하루 한도 기록과 따로 남는다');

-- 비용 기록에 모의고사 리포트 종류
insert into ai_calls (user_id, kind, model) values (:'U', 'mock', 'claude-sonnet-5-5');
select test.ok(true, 'AI 비용 기록에 모의고사 리포트(mock) 종류');
