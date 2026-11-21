-- 답변 전체 이어 말하기 기록 (오픽 준비 고도화 ①). 설계: docs/design/opic-exam-prep.md
-- 주제 화면의 "지난 이어 말하기 87%"와 결과 화면의 "지난번보다 나아졌어요"에 쓴다.
-- 채점은 서버의 단어 비교(AI 없음)이고, 기록은 서버가 로그인한 사용자 권한으로 남긴다 (RLS: 내 것만).

create table if not exists public.recitations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id text not null references public.topics (id) on delete cascade,
  answer_set_id uuid not null references public.answer_sets (id) on delete cascade,
  score int not null check (score between 0 and 100),
  duration_sec int not null check (duration_sec between 0 and 600),
  sentence_count int not null check (sentence_count between 1 and 40),
  stuck int[] not null default '{}', -- 막힌 문장 위치 (sentences.position)
  said text not null default '' check (char_length(said) <= 6000),
  created_at timestamptz not null default now()
);
create index if not exists recitations_user_set on public.recitations (user_id, answer_set_id, created_at desc);

alter table public.recitations enable row level security;
drop policy if exists "내 이어 말하기 기록을 본다" on public.recitations;
create policy "내 이어 말하기 기록을 본다" on public.recitations
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "내 답변으로만 기록을 남긴다" on public.recitations;
create policy "내 답변으로만 기록을 남긴다" on public.recitations
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.answer_sets a where a.id = answer_set_id and a.user_id = auth.uid() and a.topic_id = recitations.topic_id)
  );

-- 기록은 남기기만 한다 (고치거나 지우지 않음)
revoke all on public.recitations from anon, authenticated;
grant select, insert on public.recitations to authenticated;
grant select, insert, update, delete on public.recitations to service_role;
