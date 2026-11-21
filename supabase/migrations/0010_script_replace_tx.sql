-- 내 스크립트 교체를 한 트랜잭션으로 (0009 다음에 실행).
-- 예전에는 "예전 스크립트 삭제 → 새 스크립트 추가 → 문장 추가"를 따로따로 해서,
--   1) 중간에 실패하면 예전 스크립트 · 진도 · 시도 기록이 이미 지워진 채로 남았고
--   2) 성공해도 시도 기록(attempts)이 문장과 함께 지워졌다 (sentences 삭제 시 cascade).
-- 이제 예전 스크립트는 지우지 않고 "보관"(archived_at)한다. 보관된 스크립트의 문장 · 진도 · 시도 기록은 그대로 남고,
-- 화면은 보관되지 않은 스크립트만 보여 준다. 새 스크립트는 새 문장이라 진도는 처음부터 시작한다.
-- AI 답변(source = 'ai')과 그 기록은 건드리지 않는다.
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 넣고 실행하세요. 여러 번 실행해도 괜찮습니다.

alter table public.answer_sets add column if not exists archived_at timestamptz;

-- 주제마다 "지금 쓰는" 내 스크립트는 하나 (보관된 것은 여러 개 있어도 된다)
drop index if exists public.answer_sets_mine_one;
create unique index if not exists answer_sets_mine_current on public.answer_sets (user_id, topic_id)
  where source = 'mine' and archived_at is null;

-- 보관은 내 스크립트에만
alter table public.answer_sets drop constraint if exists answer_sets_archive_mine_only;
alter table public.answer_sets add constraint answer_sets_archive_mine_only
  check (archived_at is null or source = 'mine');

-- 내 스크립트 교체: 이 함수 하나가 한 트랜잭션이다. 중간에 어떤 오류가 나도 전부 되돌아가서
-- 예전 스크립트 · 진도 · 시도 기록이 그대로 남는다. 성공하면 새 스크립트 id 를 돌려준다.
-- p_sentences: [{"en": "...", "pronunciation": "...", "ko": "...", "edited": true|false}, ...] (1~15개)
-- 로그인한 사람의 권한(RLS)으로 실행한다 (security invoker): 자기 것만 바꿀 수 있다.
create or replace function public.replace_my_script(p_topic text, p_sentences jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_set uuid;
  v_n int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_sentences is null or jsonb_typeof(p_sentences) <> 'array' then
    raise exception 'bad_sentences' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_sentences);
  if v_n < 1 or v_n > 15 then
    raise exception 'bad_sentence_count' using errcode = '22023';
  end if;
  if not exists (select 1 from topics where id = p_topic) then
    raise exception 'no_topic' using errcode = 'P0002';
  end if;

  -- 1) 지금 스크립트를 보관 (지우지 않는다: 문장 · 진도 · 시도 기록이 남는다)
  update answer_sets set archived_at = now()
  where user_id = v_uid and topic_id = p_topic and source = 'mine' and archived_at is null;

  -- 2) 새 스크립트
  insert into answer_sets (user_id, topic_id, source, level)
  values (v_uid, p_topic, 'mine', null)
  returning id into v_set;

  -- 3) 새 문장 (en 이 비어 있으면 not null 위반으로 전체가 되돌아간다)
  insert into sentences (answer_set_id, position, en, pronunciation, ko, edited)
  select
    v_set,
    (e.ord - 1)::int,
    nullif(btrim(e.value ->> 'en'), ''),
    coalesce(btrim(e.value ->> 'pronunciation'), ''),
    coalesce(btrim(e.value ->> 'ko'), ''),
    coalesce((e.value ->> 'edited')::boolean, false)
  from jsonb_array_elements(p_sentences) with ordinality as e(value, ord);

  if exists (
    select 1 from sentences
    where answer_set_id = v_set
      and (length(en) > 300 or length(pronunciation) > 400 or length(ko) > 400)
  ) then
    raise exception 'sentence_too_long' using errcode = '22023';
  end if;

  return v_set;
end;
$$;

revoke execute on function public.replace_my_script(text, jsonb) from public, anon;
grant execute on function public.replace_my_script(text, jsonb) to authenticated;
