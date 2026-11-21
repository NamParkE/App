-- 내 스크립트 교체: 한 트랜잭션, 실패하면 전부 그대로, 성공하면 진도는 새로 · 시도 기록은 보존 (0009, 0010)
\set U '00000000-0000-0000-0000-00000000000a'
\set W '00000000-0000-0000-0000-00000000000c'

select id as topic from topics order by sort limit 1 \gset
insert into answer_sets (id, user_id, topic_id, level, source) values
  ('a0000000-0000-0000-0000-000000000001', :'U', :'topic', 'IH', 'ai'),
  ('b0000000-0000-0000-0000-000000000001', :'U', :'topic', null, 'mine');
insert into sentences (id, answer_set_id, position, en, pronunciation, ko) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 0, 'AI one.', '', 'AI 1'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 0, 'Mine one.', '', '내 1'),
  ('b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 1, 'Mine two.', '', '내 2');
insert into sentence_progress (user_id, sentence_id, status, best_score, attempts) values
  (:'U', 'a1000000-0000-0000-0000-000000000001', 'memorized', 95, 3),
  (:'U', 'b1000000-0000-0000-0000-000000000001', 'memorized', 92, 2);
insert into attempts (user_id, sentence_id, topic_id, said, score, mode) values
  (:'U', 'a1000000-0000-0000-0000-000000000001', :'topic', 'AI one', 95, 'hide'),
  (:'U', 'b1000000-0000-0000-0000-000000000001', :'topic', 'Mine one', 92, 'hide');

create temp view snap as select
  (select string_agg(id || ':' || coalesce(archived_at::text, '-'), ',' order by id) from answer_sets where user_id = '00000000-0000-0000-0000-00000000000a') sets,
  (select count(*) from sentences s join answer_sets a on a.id = s.answer_set_id where a.user_id = '00000000-0000-0000-0000-00000000000a') sentences,
  (select count(*) from sentence_progress where user_id = '00000000-0000-0000-0000-00000000000a') progress,
  (select count(*) from attempts where user_id = '00000000-0000-0000-0000-00000000000a') attempts;
create temp table before as select * from snap;

-- 실패 1: 중간 단계(문장 저장)에서 실패 — 빈 문장
select set_config('request.jwt.claim.sub', :'U', true);
set local role authenticated;
do $$ begin
  perform replace_my_script((select id from topics order by sort limit 1), '[{"en":"Fine."},{"en":"   "}]');
  raise exception 'TEST FAILED: 빈 문장이 저장됨';
exception when not_null_violation then raise notice 'ok - 빈 문장은 저장되지 않는다';
end $$;
-- 실패 2: 마지막 단계(길이 검사)에서 실패
do $$ begin
  perform replace_my_script((select id from topics order by sort limit 1), jsonb_build_array(jsonb_build_object('en', 'Fine.'), jsonb_build_object('en', repeat('x', 301))));
  raise exception 'TEST FAILED: 너무 긴 문장이 저장됨';
exception when invalid_parameter_value then raise notice 'ok - 너무 긴 문장은 저장되지 않는다';
end $$;
reset role;
select test.ok((select row(s.*) from snap s) = (select row(b.*) from before b), '실패하면 스크립트 · 문장 · 진도 · 시도 기록이 그대로');

-- 성공
select set_config('request.jwt.claim.sub', :'U', true);
set local role authenticated;
select replace_my_script(:'topic', '[{"en":"New one.","pronunciation":"뉴 원","ko":"새 1"},{"en":"New two.","edited":true}]') as new_id \gset
reset role;
select test.ok((select count(*) from answer_sets where user_id = :'U' and source = 'mine' and archived_at is null) = 1
  and (select id from answer_sets where user_id = :'U' and source = 'mine' and archived_at is null) = :'new_id', '지금 쓰는 내 스크립트는 새것 하나');
select test.ok((select archived_at is not null from answer_sets where id = 'b0000000-0000-0000-0000-000000000001'), '예전 스크립트는 지우지 않고 보관');
select test.ok((select count(*) from sentence_progress p join sentences s on s.id = p.sentence_id where s.answer_set_id = :'new_id') = 0, '진도 초기화: 새 문장에는 진도가 없다');
select test.ok((select attempts from snap) = (select attempts from before), '과거 시도 기록은 그대로 남는다');
select test.ok((select archived_at is null from answer_sets where id = 'a0000000-0000-0000-0000-000000000001')
  and (select count(*) from sentence_progress where sentence_id = 'a1000000-0000-0000-0000-000000000001') = 1, 'AI 답변과 그 진도는 그대로');
select test.ok((select string_agg(en || ':' || edited, ',' order by position) from sentences where answer_set_id = :'new_id') = 'New one.:false,New two.:true', '새 문장 순서 · 내용 · 수정안 표시');

-- 다른 사람 · 로그인 안 한 사람
create temp table before2 as select * from snap;
select set_config('request.jwt.claim.sub', :'W', true);
set local role authenticated;
select replace_my_script(:'topic', '[{"en":"Other."}]') is not null as w_ok \gset
reset role;
select test.ok(:'w_ok'::boolean and (select row(s.*) from snap s) = (select row(b.*) from before2 b), '다른 계정의 교체는 내 스크립트를 건드리지 않는다');
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
do $$ begin
  perform replace_my_script((select id from topics order by sort limit 1), '[{"en":"x."}]');
  raise exception 'TEST FAILED: 로그인 없이 저장됨';
exception when insufficient_privilege then raise notice 'ok - 로그인하지 않으면 거절';
end $$;
-- AI 답변은 보관 표시를 할 수 없다
select set_config('request.jwt.claim.sub', :'U', true);
do $$ begin
  update answer_sets set archived_at = now() where id = 'a0000000-0000-0000-0000-000000000001';
  raise exception 'TEST FAILED: AI 답변을 보관함';
exception when check_violation then raise notice 'ok - AI 답변은 보관할 수 없다';
end $$;
reset role;
