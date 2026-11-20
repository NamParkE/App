-- 어휘 확장형 (전화영어 모드)
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 실행하세요. (0001 ~ 0003 다음)
-- 설계: docs/design/vocab-call-mode.md

-- ───────────────────────── 프로필: 전화영어 레벨 ─────────────────────────

alter table public.profiles
  add column if not exists call_level int not null default 3 check (call_level between 1 and 8),
  add column if not exists call_level_since timestamptz not null default now();

grant update (call_level, call_level_since) on public.profiles to authenticated;

-- ───────────────────────── 사용량: 한 번에 여러 회 차감 ─────────────────────────
-- 전화영어 수업은 시작할 때 5회를 한 번에 차감한다.

drop function if exists public.consume_usage();
create or replace function public.consume_usage(p_n int default 1)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_limit int;
  v_count int;
begin
  if p_n < 1 or p_n > 20 then
    raise exception 'invalid_amount';
  end if;
  select daily_limit into v_limit from profiles where id = v_uid;
  if v_limit is null then
    raise exception 'no_profile';
  end if;
  insert into usage_daily (user_id, day, count)
  values (v_uid, today_kst(), 0)
  on conflict (user_id, day) do nothing;
  update usage_daily set count = count + p_n
  where user_id = v_uid and day = today_kst() and count + p_n <= v_limit
  returning count into v_count;
  if v_count is null then
    return -1;
  end if;
  return v_limit - v_count;
end;
$$;

drop function if exists public.refund_usage();
create or replace function public.refund_usage(p_n int default 1)
returns void
language sql
security definer
set search_path = public
as $$
  update usage_daily set count = greatest(count - least(greatest(p_n, 0), 20), 0)
  where user_id = auth.uid() and day = today_kst();
$$;

revoke execute on function public.consume_usage(int), public.refund_usage(int) from public, anon;
grant execute on function public.consume_usage(int), public.refund_usage(int) to authenticated;

-- ───────────────────────── 수업 주제 ─────────────────────────

create table if not exists public.call_topics (
  id text primary key,
  level_min int not null check (level_min between 1 and 8),
  level_max int not null check (level_max between 1 and 8),
  title_ko text not null,
  title_en text not null,
  scenario text not null,
  sort int not null default 0
);
alter table public.call_topics enable row level security;
drop policy if exists "로그인 사용자는 수업 주제를 본다" on public.call_topics;
create policy "로그인 사용자는 수업 주제를 본다" on public.call_topics
  for select to authenticated using (true);
grant select on public.call_topics to authenticated;

insert into public.call_topics (id, level_min, level_max, title_ko, title_en, scenario, sort) values
('c-food', 1, 3, '좋아하는 음식', 'Favorite food', 'Talk about foods the student likes and dislikes, and what they ate today.', 10),
('c-family', 1, 3, '우리 가족', 'My family', 'Talk about the student''s family members: who they are and what they like.', 20),
('c-animals', 1, 2, '동물', 'Animals', 'Talk about animals the student likes, pets, and animal sounds and colors.', 30),
('c-clothes', 1, 2, '색깔과 옷', 'Colors and clothes', 'Talk about colors and what the student is wearing today.', 40),
('c-my-day', 1, 3, '나의 하루', 'My day', 'Talk about the student''s daily routine: waking up, meals, school or work, bedtime.', 50),
('c-weather', 1, 3, '오늘 날씨', 'The weather', 'Talk about today''s weather and what the student likes to do in each kind of weather.', 60),
('c-play', 1, 2, '놀이와 장난감', 'Toys and play', 'Talk about games, toys and what the student likes to play.', 70),
('c-weekend', 2, 4, '지난 주말에 한 일', 'Last weekend', 'Ask what the student did last weekend, where they went and who they were with.', 110),
('c-neighborhood', 2, 4, '우리 동네', 'My neighborhood', 'Talk about the student''s neighborhood: places, favorite spots, what is nearby.', 120),
('c-seasons', 2, 4, '좋아하는 계절', 'Seasons', 'Talk about the four seasons and the student''s favorite one and why.', 130),
('c-ordering', 2, 5, '음식 주문하기', 'Ordering food', 'Role-play: the tutor is a café or restaurant server and the student orders food and drinks.', 140),
('c-directions', 2, 5, '길 묻고 답하기', 'Asking for directions', 'Role-play: the student asks the tutor how to get to a place in town.', 150),
('c-hobbies', 3, 5, '취미', 'Hobbies', 'Talk about the student''s hobbies, how they started and how often they do them.', 160),
('c-shopping', 3, 5, '쇼핑', 'Shopping', 'Talk about what the student likes to buy, where, and a recent purchase.', 170),
('c-travel-plan', 4, 6, '여행 계획', 'Travel plans', 'Talk about a trip the student wants to take: where, when, with whom, and what to do.', 210),
('c-health', 4, 6, '건강 습관', 'Healthy habits', 'Talk about sleep, exercise and eating habits, and what the student wants to improve.', 220),
('c-movies', 4, 7, '영화와 드라마', 'Movies and dramas', 'Talk about a recent movie or drama: the story, the characters, and the student''s opinion.', 230),
('c-memory', 4, 7, '기억에 남는 경험', 'A memorable experience', 'Ask about a memorable experience and follow up with details and feelings.', 240),
('c-phone-life', 4, 6, '휴대폰과 생활', 'Phones in daily life', 'Talk about how the student uses their phone and whether they use it too much.', 250),
('c-work-life', 5, 7, '일과 삶의 균형', 'Work-life balance', 'Discuss how the student balances work or study with rest and family time.', 260),
('c-tech-future', 6, 8, '기술과 미래', 'Technology and the future', 'Discuss how AI and technology may change jobs and daily life, asking for opinions.', 310),
('c-environment', 6, 8, '환경 문제', 'The environment', 'Discuss environmental issues and what individuals and governments should do.', 320),
('c-culture', 6, 8, '문화 차이', 'Cultural differences', 'Discuss cultural differences the student has noticed, with examples and opinions.', 330),
('c-news', 7, 8, '요즘 화제', 'Current topics', 'Chat about a recent general-interest news topic the student picks, avoiding politics, and discuss viewpoints.', 340),
('c-career', 6, 8, '커리어 고민', 'Career choices', 'Discuss career goals, dilemmas and advice, like a mentor conversation.', 350),
('c-small-talk', 7, 8, '원어민식 수다', 'Casual small talk', 'Natural, fast-paced small talk with idioms, humor and slang, like two friends catching up.', 360)
on conflict (id) do nothing;

-- ───────────────────────── 수업 계획 (가족 안에서 공유) ─────────────────────────

create table if not exists public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  topic_id text not null references public.call_topics (id) on delete cascade,
  level int not null check (level between 1 and 8),
  plan jsonb not null,
  created_at timestamptz not null default now(),
  unique (family_id, topic_id, level)
);
alter table public.lesson_plans enable row level security;
drop policy if exists "가족 수업 계획" on public.lesson_plans;
create policy "가족 수업 계획" on public.lesson_plans
  for all to authenticated
  using (family_id = public.my_family_id())
  with check (family_id = public.my_family_id());
grant select, insert on public.lesson_plans to authenticated;

-- ───────────────────────── 수업 · 대화 · 표현장 ─────────────────────────

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id text not null references public.call_topics (id) on delete cascade,
  level int not null check (level between 1 and 8),
  plan_id uuid not null references public.lesson_plans (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'done', 'left')),
  turns int not null default 0,
  hints int not null default 0,
  score int,
  report jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists lessons_user_started on public.lessons (user_id, started_at desc);
alter table public.lessons enable row level security;
drop policy if exists "내 수업" on public.lessons;
create policy "내 수업" on public.lessons
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.lessons to authenticated;

create table if not exists public.lesson_messages (
  id bigint generated always as identity primary key,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('tutor', 'user')),
  text text not null,
  ko text,
  correction jsonb,
  created_at timestamptz not null default now()
);
create index if not exists lesson_messages_lesson on public.lesson_messages (lesson_id, id);
alter table public.lesson_messages enable row level security;
drop policy if exists "내 대화" on public.lesson_messages;
create policy "내 대화" on public.lesson_messages
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert on public.lesson_messages to authenticated;

create table if not exists public.expressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid references public.lessons (id) on delete set null,
  en text not null,
  ko text not null,
  example text not null default '',
  stage int not null default 0 check (stage between 0 and 4),
  next_review_on date not null default (public.today_kst() + 1),
  created_at timestamptz not null default now(),
  unique (user_id, en)
);
create index if not exists expressions_user_review on public.expressions (user_id, next_review_on);
alter table public.expressions enable row level security;
drop policy if exists "내 표현장" on public.expressions;
create policy "내 표현장" on public.expressions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.expressions to authenticated;

-- ───────────────────────── 하루 학습 기록 (연속 학습일 · 가족 순위) ─────────────────────────

create table if not exists public.daily_activity (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  lessons int not null default 0,
  practices int not null default 0,
  memorized int not null default 0,
  reviews int not null default 0,
  points int not null default 0,
  primary key (user_id, day)
);
alter table public.daily_activity enable row level security;
drop policy if exists "내 학습 기록" on public.daily_activity;
create policy "내 학습 기록" on public.daily_activity
  for select to authenticated using (user_id = auth.uid());
grant select on public.daily_activity to authenticated;
-- 쓰기는 아래 bump_activity() 로만 한다 (점수 계산을 한곳에서)

-- 점수: 수업 10 · 문장 외움 3 · 문장 연습 1 · 표현 복습 1
create or replace function public.bump_activity(
  p_lessons int default 0, p_practices int default 0, p_memorized int default 0, p_reviews int default 0
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into daily_activity (user_id, day, lessons, practices, memorized, reviews, points)
  values (
    auth.uid(), today_kst(),
    least(greatest(p_lessons, 0), 5), least(greatest(p_practices, 0), 5),
    least(greatest(p_memorized, 0), 5), least(greatest(p_reviews, 0), 5),
    least(greatest(p_lessons, 0), 5) * 10 + least(greatest(p_memorized, 0), 5) * 3
      + least(greatest(p_practices, 0), 5) + least(greatest(p_reviews, 0), 5)
  )
  on conflict (user_id, day) do update set
    lessons = daily_activity.lessons + excluded.lessons,
    practices = daily_activity.practices + excluded.practices,
    memorized = daily_activity.memorized + excluded.memorized,
    reviews = daily_activity.reviews + excluded.reviews,
    points = daily_activity.points + excluded.points;
$$;

-- 하루 학습 인정: 수업 1회 또는 문장 연습 3회
-- 연속 학습일: 오늘 또는 어제까지 이어진 학습한 날 수
create or replace function public.streak_for(p_uid uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with d as (
    select day from daily_activity
    where user_id = p_uid and (lessons > 0 or practices >= 3)
  ),
  g as (
    select day, day - (row_number() over (order by day))::int as grp from d
  ),
  runs as (
    select max(day) as last_day, count(*)::int as n from g group by grp
  )
  select coalesce(
    (select n from runs where last_day >= today_kst() - 1 order by last_day desc limit 1),
    0
  );
$$;

-- 내 연속 학습일과 오늘 학습 인정 여부
create or replace function public.my_streak()
returns table (streak int, studied_today boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    streak_for(auth.uid()),
    exists (
      select 1 from daily_activity
      where user_id = auth.uid() and day = today_kst() and (lessons > 0 or practices >= 3)
    );
$$;

-- 가족 순위: 내 가족의 집계 숫자만 돌려준다 (대화 내용·문장은 공개하지 않음)
create or replace function public.family_board()
returns table (
  user_id uuid,
  display_name text,
  style text,
  level_label text,
  streak int,
  points int,
  last_week_points int,
  days boolean[]
)
language sql
stable
security definer
set search_path = public
as $$
  with wk as (
    select (today_kst() - ((extract(isodow from today_kst())::int) - 1)) as mon
  )
  select
    p.id,
    p.display_name,
    p.style,
    case when p.style = 'vocab' then 'Lv.' || p.call_level else p.level end,
    streak_for(p.id),
    coalesce((select sum(a.points) from daily_activity a, wk
              where a.user_id = p.id and a.day between wk.mon and wk.mon + 6), 0)::int,
    coalesce((select sum(a.points) from daily_activity a, wk
              where a.user_id = p.id and a.day between wk.mon - 7 and wk.mon - 1), 0)::int,
    array(
      select exists (
        select 1 from daily_activity a
        where a.user_id = p.id and a.day = wk.mon + g and (a.lessons > 0 or a.practices >= 3)
      )
      from wk, generate_series(0, 6) g
      order by g
    )
  from profiles p
  where p.family_id = public.my_family_id()
  order by 6 desc, 5 desc, p.created_at;
$$;

revoke execute on function
  public.bump_activity(int, int, int, int), public.streak_for(uuid), public.my_streak(), public.family_board()
  from public, anon;
grant execute on function
  public.bump_activity(int, int, int, int), public.my_streak(), public.family_board()
  to authenticated;
-- streak_for 는 다른 함수 안에서만 쓴다 (다른 사람 id 로 직접 부르지 못하게)

-- 로그인하지 않은 사용자는 새 표에 접근하지 않는다
revoke all on public.call_topics, public.lesson_plans, public.lessons, public.lesson_messages,
  public.expressions, public.daily_activity from anon;
