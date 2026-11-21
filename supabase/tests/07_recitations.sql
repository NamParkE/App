-- 이어 말하기 기록 (0012): 내 답변으로만 남기고, 내 것만 보이며, 고치거나 지울 수 없다
\set U '00000000-0000-0000-0000-00000000000a'
\set W '00000000-0000-0000-0000-00000000000c'

select id as topic from topics order by sort limit 1 \gset
select id as topic2 from topics order by sort offset 1 limit 1 \gset
insert into answer_sets (id, user_id, topic_id, level, source) values
  ('a0000000-0000-0000-0000-000000000007', :'U', :'topic', 'IH', 'ai'),
  ('c0000000-0000-0000-0000-000000000007', :'W', :'topic', 'IH', 'ai');

select set_config('request.jwt.claim.sub', :'U', true);
set local role authenticated;
insert into recitations (user_id, topic_id, answer_set_id, score, duration_sec, sentence_count, stuck, said)
  values (:'U', :'topic', 'a0000000-0000-0000-0000-000000000007', 87, 114, 8, '{2,5}', 'I live in Seoul.');
reset role;
select test.ok((select count(*) = 1 from recitations where user_id = :'U'), '내 답변으로 기록을 남긴다');

set local role authenticated;
do $$ begin
  insert into recitations (user_id, topic_id, answer_set_id, score, duration_sec, sentence_count)
    values ('00000000-0000-0000-0000-00000000000a', (select id from topics order by sort limit 1), 'c0000000-0000-0000-0000-000000000007', 90, 60, 5);
  raise exception 'TEST FAILED: 다른 사람의 답변으로 기록함';
exception when insufficient_privilege then raise notice 'ok - 다른 사람의 답변으로는 기록할 수 없다';
end $$;
do $$ begin
  insert into recitations (user_id, topic_id, answer_set_id, score, duration_sec, sentence_count)
    values ('00000000-0000-0000-0000-00000000000c', (select id from topics order by sort limit 1), 'a0000000-0000-0000-0000-000000000007', 90, 60, 5);
  raise exception 'TEST FAILED: 다른 사람 이름으로 기록함';
exception when insufficient_privilege then raise notice 'ok - 다른 사람 이름으로는 기록할 수 없다';
end $$;
do $$ begin
  insert into recitations (user_id, topic_id, answer_set_id, score, duration_sec, sentence_count)
    values ('00000000-0000-0000-0000-00000000000a', (select id from topics order by sort offset 1 limit 1), 'a0000000-0000-0000-0000-000000000007', 90, 60, 5);
  raise exception 'TEST FAILED: 답변과 다른 주제로 기록함';
exception when insufficient_privilege then raise notice 'ok - 답변과 다른 주제로는 기록할 수 없다';
end $$;
do $$ begin
  update recitations set score = 100;
  raise exception 'TEST FAILED: 기록을 고침';
exception when insufficient_privilege then raise notice 'ok - 기록은 고칠 수 없다';
end $$;
do $$ begin
  delete from recitations;
  raise exception 'TEST FAILED: 기록을 지움';
exception when insufficient_privilege then raise notice 'ok - 기록은 지울 수 없다';
end $$;
reset role;

select set_config('request.jwt.claim.sub', :'W', true);
set local role authenticated;
select count(*) as w_sees from recitations \gset
reset role;
select test.ok(:w_sees = 0, '다른 사람의 이어 말하기 기록은 보이지 않는다');

select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$ begin
  perform 1 from recitations;
  raise exception 'TEST FAILED: 로그인 없이 읽음';
exception when insufficient_privilege then raise notice 'ok - 로그인하지 않으면 읽을 수 없다';
end $$;
reset role;
