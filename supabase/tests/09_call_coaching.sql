-- 전화영어 코칭 (0015): 대화 줄 종류 · 미리 준비한 도움은 서버만 쓴다
\set U '00000000-0000-0000-0000-00000000000a'

insert into call_topics (id, level_min, level_max, title_ko, title_en, scenario, sort)
  values ('t-coach', 1, 8, '날씨', 'Weather', 'Talk about the weather', 999) on conflict (id) do nothing;
insert into lesson_plans (id, family_id, topic_id, level, plan)
  values ('40000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 't-coach', 3, '{}');
insert into lessons (id, user_id, topic_id, level, plan_id)
  values ('30000000-0000-0000-0000-000000000009', :'U', 't-coach', 3, '40000000-0000-0000-0000-000000000009');

insert into lesson_messages (lesson_id, user_id, role, text) values ('30000000-0000-0000-0000-000000000009', :'U', 'tutor', 'Hi!');
select test.ok((select kind from lesson_messages where lesson_id = '30000000-0000-0000-0000-000000000009') = 'talk', '종류를 안 쓰면 보통 대화(talk)');
insert into lesson_messages (lesson_id, user_id, role, text, kind, counted)
  values ('30000000-0000-0000-0000-000000000009', :'U', 'tutor', 'Is it sunny or rainy?', 'help', true),
         ('30000000-0000-0000-0000-000000000009', :'U', 'user', 'It is raining.', 'repeat', false);
select test.ok((select count(*) from lesson_messages where lesson_id = '30000000-0000-0000-0000-000000000009') = 3, '도움 말 · 따라 말하기 줄을 남긴다');
do $$ begin
  insert into lesson_messages (lesson_id, user_id, role, text, kind) values ('30000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000a', 'user', 'x', 'chat');
  raise exception 'TEST FAILED: 모르는 종류가 들어감';
exception when check_violation then raise notice 'ok - 종류는 talk · help · repeat 만';
end $$;

-- 미리 준비한 도움은 사용자가 바꿀 수 없다 (서버만)
select set_config('request.jwt.claim.sub', :'U', true);
set local role authenticated;
do $$ begin
  update lessons set pending_help = '{"nudges":{"choice":"hacked"}}' where id = '30000000-0000-0000-0000-000000000009';
  raise exception 'TEST FAILED: 사용자가 도움 말을 바꿈';
exception when insufficient_privilege then raise notice 'ok - 미리 준비한 도움 말은 사용자가 바꿀 수 없다';
end $$;
select pending_help is null as can_read from lessons where id = '30000000-0000-0000-0000-000000000009' \gset
reset role;
select test.ok(:'can_read'::boolean, '자기 수업의 도움 말은 읽을 수 있다');
