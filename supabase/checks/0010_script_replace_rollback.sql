-- 운영 DB 점검: 0009 · 0010 적용 여부, 그리고 "내 스크립트 교체" 실패 시 롤백 확인
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 넣고 실행하세요.
-- 맨 끝의 rollback 으로 이 점검이 만든 변경은 모두 되돌아갑니다 (운영 데이터는 바뀌지 않음).
-- 결과는 맨 아래 표 하나로 나옵니다. ok 칸이 모두 true 면 통과입니다.
--
-- 테스트 계정: 아래 test_email 을 테스트용 계정 이메일로 바꾸세요 (그 계정의 프로필이 있어야 합니다).

begin;

create temp table _check (step int, item text, ok boolean, detail text) on commit drop;

do $$
declare
  test_email text := 'test@example.com';   -- ← 테스트 계정 이메일
  v_uid uuid;
  v_topic text;
  v_before text;
  v_after text;
  v_err text;
  v_new uuid;
begin
  -- 1) 마이그레이션 적용 여부
  insert into _check values
    (1, '0009: answer_sets.source', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'answer_sets' and column_name = 'source'), null),
    (1, '0009: profiles.opic_source', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'opic_source'), null),
    (1, '0009: sentences.edited', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sentences' and column_name = 'edited'), null),
    (1, '0010: answer_sets.archived_at', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'answer_sets' and column_name = 'archived_at'), null),
    (1, '0010: replace_my_script()', exists (select 1 from pg_proc where proname = 'replace_my_script'), null);

  if not exists (select 1 from pg_proc where proname = 'replace_my_script') then
    insert into _check values (2, '롤백 점검', false, '0010 을 먼저 실행해 주세요');
    return;
  end if;

  select u.id into v_uid from auth.users u join public.profiles p on p.id = u.id where lower(u.email) = lower(test_email);
  if v_uid is null then
    insert into _check values (2, '롤백 점검', false, '테스트 계정(' || test_email || ')의 프로필을 찾지 못했어요');
    return;
  end if;
  select id into v_topic from public.topics order by sort limit 1;

  -- 테스트 계정으로 로그인한 것처럼 (RLS 그대로)
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 점검용으로 지금 스크립트 하나를 만들어 둔다 (이것도 맨 끝에 되돌아감)
  v_new := public.replace_my_script(v_topic, '[{"en":"Check one."},{"en":"Check two."}]'::jsonb);

  select string_agg(x, '|' order by x) into v_before from (
    select 'set:' || id || ':' || coalesce(archived_at::text, '-') as x from public.answer_sets where user_id = v_uid
    union all select 'sen:' || s.id from public.sentences s join public.answer_sets a on a.id = s.answer_set_id where a.user_id = v_uid
    union all select 'pro:' || sentence_id || ':' || status from public.sentence_progress where user_id = v_uid
    union all select 'att:' || id from public.attempts where user_id = v_uid
  ) t;

  -- 2) 저장 실패를 강제로: 두 번째 문장이 빈칸 → 중간(문장 저장)에서 실패
  begin
    perform public.replace_my_script(v_topic, '[{"en":"Fine."},{"en":"   "}]'::jsonb);
    v_err := null;
  exception when others then
    v_err := sqlstate || ' ' || sqlerrm;
  end;

  select string_agg(x, '|' order by x) into v_after from (
    select 'set:' || id || ':' || coalesce(archived_at::text, '-') as x from public.answer_sets where user_id = v_uid
    union all select 'sen:' || s.id from public.sentences s join public.answer_sets a on a.id = s.answer_set_id where a.user_id = v_uid
    union all select 'pro:' || sentence_id || ':' || status from public.sentence_progress where user_id = v_uid
    union all select 'att:' || id from public.attempts where user_id = v_uid
  ) t;

  reset role; -- 결과 표는 점검하는 사람 권한으로 쓴다

  insert into _check values
    (2, '저장 실패가 오류로 끝남', v_err is not null, v_err),
    (2, '실패 뒤 스크립트 · 문장 · 진도 · 시도 기록이 그대로', v_before is not distinct from v_after, null),
    (2, '실패 뒤에도 지금 스크립트는 점검용 그대로', (select id from public.answer_sets where user_id = v_uid and topic_id = v_topic and source = 'mine' and archived_at is null) = v_new, null);
end $$;

select * from _check order by step, item;

rollback;
