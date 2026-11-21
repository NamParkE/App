-- 외운 문장 복습 일정 (0011): 외우면 1일 뒤, 통과하면 3 · 7 · 14일 뒤, 네 번째 통과면 끝, 실패하면 외움 표시를 푼다
\set U '00000000-0000-0000-0000-00000000000a'
\set W '00000000-0000-0000-0000-00000000000c'

select id as topic from topics order by sort limit 1 \gset
insert into answer_sets (id, user_id, topic_id, level, source) values
  ('a0000000-0000-0000-0000-000000000006', :'U', :'topic', 'IH', 'ai');
insert into sentences (id, answer_set_id, position, en, pronunciation, ko) values
  ('a6000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', 0, 'One.', '', '1'),
  ('a6000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000006', 1, 'Two.', '', '2');

create temp view r as
  select sentence_id, status, recall_step, next_recall_on - today_kst() as days
  from sentence_progress where user_id = '00000000-0000-0000-0000-00000000000a';
-- 테스트용: 오늘 복습할 차례로 당긴다 (관리자 권한으로)
create or replace function pg_temp.make_due(p uuid) returns void language sql as $$
  update sentence_progress set next_recall_on = today_kst() where sentence_id = p;
$$;

select set_config('request.jwt.claim.sub', :'U', true);
set local role authenticated;
-- 연습 중 → 외움 (연습 화면이 하는 것처럼 upsert)
insert into sentence_progress (user_id, sentence_id, status, best_score, attempts)
  values (:'U', 'a6000000-0000-0000-0000-000000000001', 'practicing', 50, 1);
reset role;
select test.ok((select next_recall_on is null from sentence_progress where sentence_id = 'a6000000-0000-0000-0000-000000000001'), '연습 중인 문장은 복습이 없다');
set local role authenticated;
insert into sentence_progress (user_id, sentence_id, status, best_score, attempts)
  values (:'U', 'a6000000-0000-0000-0000-000000000001', 'memorized', 95, 2)
  on conflict (user_id, sentence_id) do update set status = excluded.status, best_score = excluded.best_score, attempts = excluded.attempts;
reset role;
select test.ok((select days = 1 and recall_step = 0 from r where sentence_id = 'a6000000-0000-0000-0000-000000000001'), '외우는 순간 1일 뒤 복습이 잡힌다');

-- 외운 문장을 다시 연습해도(외움 → 외움) 일정은 그대로
update sentence_progress set next_recall_on = today_kst() + 5, recall_step = 2 where sentence_id = 'a6000000-0000-0000-0000-000000000001';
set local role authenticated;
insert into sentence_progress (user_id, sentence_id, status, best_score, attempts)
  values (:'U', 'a6000000-0000-0000-0000-000000000001', 'memorized', 98, 3)
  on conflict (user_id, sentence_id) do update set status = excluded.status, best_score = excluded.best_score, attempts = excluded.attempts;
reset role;
select test.ok((select days = 5 and recall_step = 2 from r where sentence_id = 'a6000000-0000-0000-0000-000000000001'), '외운 문장을 다시 연습해도 복습 일정은 그대로');
update sentence_progress set recall_step = 0, next_recall_on = today_kst() + 1 where sentence_id = 'a6000000-0000-0000-0000-000000000001';

-- 아직 복습할 날이 아니면 거절
set local role authenticated;
do $$ begin
  perform record_recall('a6000000-0000-0000-0000-000000000001', true);
  raise exception 'TEST FAILED: 복습할 날이 아닌데 저장됨';
exception when no_data_found then raise notice 'ok - 복습할 날이 아니면 거절';
end $$;
reset role;

-- 네 번 통과: 3 → 7 → 14일 뒤, 네 번째면 끝
select pg_temp.make_due('a6000000-0000-0000-0000-000000000001');
set local role authenticated;
select test.ok((select recall_step = 1 and next_recall_on = today_kst() + 3 from record_recall('a6000000-0000-0000-0000-000000000001', true)), '첫 복습 통과 → 3일 뒤');
reset role;
select pg_temp.make_due('a6000000-0000-0000-0000-000000000001');
set local role authenticated;
select test.ok((select next_recall_on = today_kst() + 7 from record_recall('a6000000-0000-0000-0000-000000000001', true)), '두 번째 통과 → 7일 뒤');
reset role;
select pg_temp.make_due('a6000000-0000-0000-0000-000000000001');
set local role authenticated;
select test.ok((select next_recall_on = today_kst() + 14 from record_recall('a6000000-0000-0000-0000-000000000001', true)), '세 번째 통과 → 14일 뒤');
reset role;
select pg_temp.make_due('a6000000-0000-0000-0000-000000000001');
set local role authenticated;
select test.ok((select recall_step = 4 and next_recall_on is null and status = 'memorized' from record_recall('a6000000-0000-0000-0000-000000000001', true)), '네 번째 통과 → 복습 끝, 외움은 그대로');
reset role;

-- 실패: 외움 표시가 풀리고 일정이 지워진다. 다시 외우면 1일 뒤부터
insert into sentence_progress (user_id, sentence_id, status, best_score, attempts)
  values (:'U', 'a6000000-0000-0000-0000-000000000002', 'memorized', 92, 1);
update sentence_progress set recall_step = 2 where sentence_id = 'a6000000-0000-0000-0000-000000000002';
select pg_temp.make_due('a6000000-0000-0000-0000-000000000002');
set local role authenticated;
select test.ok((select status = 'practicing' and recall_step = 0 and next_recall_on is null from record_recall('a6000000-0000-0000-0000-000000000002', false)), '실패 → 외움 표시를 풀고 일정을 지운다');
update sentence_progress set status = 'memorized' where sentence_id = 'a6000000-0000-0000-0000-000000000002';
reset role;
select test.ok((select days = 1 and recall_step = 0 from r where sentence_id = 'a6000000-0000-0000-0000-000000000002'), '다시 외우면 1일 뒤부터 다시');

-- 다른 사람의 문장 · 로그인 안 한 사람
select pg_temp.make_due('a6000000-0000-0000-0000-000000000002');
select set_config('request.jwt.claim.sub', :'W', true);
set local role authenticated;
do $$ begin
  perform record_recall('a6000000-0000-0000-0000-000000000002', false);
  raise exception 'TEST FAILED: 다른 사람의 복습을 저장함';
exception when no_data_found then raise notice 'ok - 다른 사람의 문장은 복습할 수 없다';
end $$;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  perform record_recall('a6000000-0000-0000-0000-000000000002', true);
  raise exception 'TEST FAILED: 로그인 없이 저장됨';
exception when insufficient_privilege then raise notice 'ok - 로그인하지 않으면 거절';
end $$;
reset role;
select test.ok((select status = 'memorized' from r where sentence_id = 'a6000000-0000-0000-0000-000000000002'), '거절된 복습은 진도를 바꾸지 않는다');
select test.ok(public.recall_gap(4) is null and public.recall_gap(0) = 1, '간격 표: 1 · 3 · 7 · 14일, 끝나면 없음');
