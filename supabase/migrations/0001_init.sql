-- 오픽 암기형 앱 초기 스키마
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 넣고 실행하세요.

-- ───────────────────────── 가족 / 사용자 ─────────────────────────

-- 가족 계정을 새로 만들 수 있는 이메일 (관리자가 SQL로 직접 넣음)
create table public.owner_emails (
  email text primary key
);
alter table public.owner_emails enable row level security;
-- 정책 없음: 클라이언트에서는 읽기/쓰기 불가, 아래 security definer 함수만 사용

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  display_name text not null,
  level text not null default 'IH' check (level in ('IM2', 'IH', 'AL')),
  style text not null default 'memorize' check (style in ('memorize', 'vocab')),
  daily_limit int not null default 30 check (daily_limit between 0 and 1000),
  setup_done boolean not null default false,
  created_at timestamptz not null default now()
);

-- 내 가족 id (RLS 정책에서 재귀 없이 쓰기 위한 함수)
create or replace function public.my_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from public.profiles where id = auth.uid();
$$;

alter table public.families enable row level security;
create policy "가족 구성원은 자기 가족을 본다" on public.families
  for select to authenticated using (id = public.my_family_id());

alter table public.profiles enable row level security;
create policy "같은 가족의 프로필을 본다" on public.profiles
  for select to authenticated using (family_id = public.my_family_id());
create policy "내 프로필만 고친다" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- 사용자는 이름/등급/스타일/설정 완료만 바꿀 수 있다 (한도, 가족은 못 바꿈)
revoke update on public.profiles from authenticated, anon;
grant update (display_name, level, style, setup_done) on public.profiles to authenticated;

-- 초대 코드 생성 (헷갈리는 0/O/1/I 제외)
create or replace function public.gen_invite_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
begin
  for i in 1..6 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end;
$$;

-- 첫 로그인: owner_emails 에 있는 사람만 새 가족을 만든다
create or replace function public.create_family(p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_family uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from profiles where id = v_uid) then
    return (select family_id from profiles where id = v_uid);
  end if;
  if not exists (select 1 from owner_emails where lower(email) = v_email) then
    raise exception 'not_owner';
  end if;
  insert into families (name, invite_code, owner_id)
  values (coalesce(nullif(trim(p_display_name), ''), '우리') || ' 가족', gen_invite_code(), v_uid)
  returning id into v_family;
  insert into profiles (id, family_id, display_name)
  values (v_uid, v_family, coalesce(nullif(trim(p_display_name), ''), '나'));
  return v_family;
end;
$$;

-- 초대 코드로 가족에 들어간다
create or replace function public.join_family(p_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from profiles where id = v_uid) then
    return (select family_id from profiles where id = v_uid);
  end if;
  select id into v_family from families where invite_code = upper(trim(p_code));
  if v_family is null then
    raise exception 'invalid_code';
  end if;
  insert into profiles (id, family_id, display_name)
  values (v_uid, v_family, coalesce(nullif(trim(p_display_name), ''), '나'));
  return v_family;
end;
$$;

-- ───────────────────────── 사용량 제한 ─────────────────────────

create table public.usage_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.usage_daily enable row level security;
create policy "내 사용량을 본다" on public.usage_daily
  for select to authenticated using (user_id = auth.uid());

create or replace function public.today_kst()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Seoul')::date;
$$;

-- AI 호출 1회를 차감한다. 한도를 넘으면 -1, 아니면 남은 횟수를 돌려준다.
create or replace function public.consume_usage()
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
  select daily_limit into v_limit from profiles where id = v_uid;
  if v_limit is null then
    raise exception 'no_profile';
  end if;
  insert into usage_daily (user_id, day, count)
  values (v_uid, today_kst(), 0)
  on conflict (user_id, day) do nothing;
  update usage_daily set count = count + 1
  where user_id = v_uid and day = today_kst() and count < v_limit
  returning count into v_count;
  if v_count is null then
    return -1;
  end if;
  return v_limit - v_count;
end;
$$;

-- AI 호출이 실패했을 때 차감을 되돌린다
create or replace function public.refund_usage()
returns void
language sql
security definer
set search_path = public
as $$
  update usage_daily set count = greatest(count - 1, 0)
  where user_id = auth.uid() and day = today_kst();
$$;

-- ───────────────────────── 주제 / 답변 문장 ─────────────────────────

create table public.topics (
  id text primary key,
  category text not null check (category in ('survey', 'unexpected', 'roleplay')),
  title_ko text not null,
  title_en text not null,
  question_en text not null,
  question_ko text not null,
  sort int not null default 0
);
alter table public.topics enable row level security;
create policy "로그인 사용자는 주제를 본다" on public.topics
  for select to authenticated using (true);

-- 사용자 × 주제 × 등급마다 한 벌의 핵심 답변
create table public.answer_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id text not null references public.topics (id) on delete cascade,
  level text not null check (level in ('IM2', 'IH', 'AL')),
  created_at timestamptz not null default now(),
  unique (user_id, topic_id, level)
);
alter table public.answer_sets enable row level security;
create policy "내 답변 세트" on public.answer_sets
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.sentences (
  id uuid primary key default gen_random_uuid(),
  answer_set_id uuid not null references public.answer_sets (id) on delete cascade,
  position int not null,
  en text not null,
  pronunciation text not null,
  ko text not null,
  unique (answer_set_id, position)
);
alter table public.sentences enable row level security;
create policy "내 문장" on public.sentences
  for all to authenticated
  using (exists (select 1 from answer_sets a where a.id = answer_set_id and a.user_id = auth.uid()))
  with check (exists (select 1 from answer_sets a where a.id = answer_set_id and a.user_id = auth.uid()));

-- ───────────────────────── 학습 기록 ─────────────────────────

create table public.sentence_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  sentence_id uuid not null references public.sentences (id) on delete cascade,
  status text not null default 'practicing' check (status in ('practicing', 'memorized')),
  best_score int not null default 0,
  attempts int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, sentence_id)
);
alter table public.sentence_progress enable row level security;
create policy "내 진도" on public.sentence_progress
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sentence_id uuid not null references public.sentences (id) on delete cascade,
  topic_id text not null references public.topics (id) on delete cascade,
  said text not null,
  score int not null,
  mode text not null check (mode in ('see', 'hide')),
  feedback jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index attempts_user_created on public.attempts (user_id, created_at desc);
alter table public.attempts enable row level security;
create policy "내 시도 기록" on public.attempts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────── 오픽 빈출 주제 ─────────────────────────

insert into public.topics (id, category, title_ko, title_en, question_en, question_ko, sort) values
('home', 'survey', '집 소개', 'Home',
 'Tell me about your home. What does it look like, and what is your favorite room?',
 '집을 소개해 주세요. 어떻게 생겼고, 가장 좋아하는 방은 어디인가요?', 10),
('neighborhood', 'survey', '동네', 'Neighborhood',
 'Describe your neighborhood. What is it like, and what do you like about it?',
 '사는 동네를 묘사해 주세요. 어떤 곳이고 무엇이 좋은가요?', 20),
('cafe', 'survey', '카페 가기', 'Café',
 'You indicated that you go to cafés. Tell me about a café you often visit and what you usually do there.',
 '카페에 간다고 하셨는데, 자주 가는 카페와 거기서 주로 무엇을 하는지 말해 주세요.', 30),
('park', 'survey', '공원 가기', 'Park',
 'Tell me about a park you like to go to. What does it look like, and what do you do there?',
 '즐겨 가는 공원을 소개해 주세요. 어떻게 생겼고 거기서 무엇을 하나요?', 40),
('movies', 'survey', '영화 보기', 'Movies',
 'You said you like watching movies. What kinds of movies do you like, and tell me about a movie you saw recently.',
 '영화 보는 걸 좋아한다고 하셨는데, 어떤 영화를 좋아하고 최근 본 영화는 무엇인가요?', 50),
('music', 'survey', '음악 감상', 'Music',
 'What kind of music do you like to listen to? When and where do you usually listen to music?',
 '어떤 음악을 즐겨 듣나요? 주로 언제, 어디서 듣나요?', 60),
('walking', 'survey', '걷기·조깅', 'Walking',
 'You said you enjoy walking or jogging. Where do you usually go, and how often do you do it?',
 '걷기나 조깅을 즐긴다고 하셨는데, 주로 어디서 얼마나 자주 하나요?', 70),
('travel-domestic', 'survey', '국내 여행', 'Travel',
 'Tell me about a memorable trip you took in your country. Where did you go and what did you do?',
 '기억에 남는 국내 여행을 말해 주세요. 어디에 가서 무엇을 했나요?', 80),
('weather', 'unexpected', '날씨·계절', 'Weather',
 'Tell me about the weather and seasons in your country. Which season do you like the most?',
 '우리나라의 날씨와 계절을 말해 주세요. 어떤 계절을 가장 좋아하나요?', 110),
('recycling', 'unexpected', '재활용', 'Recycling',
 'How do people recycle in your country? Describe what you do with trash and recyclables at home.',
 '우리나라 사람들은 어떻게 재활용하나요? 집에서 쓰레기와 재활용품을 어떻게 처리하는지 말해 주세요.', 120),
('holidays', 'unexpected', '명절·휴일', 'Holidays',
 'Tell me about a holiday that people in your country celebrate. What do people usually do on that day?',
 '우리나라의 명절 하나를 소개해 주세요. 그날 사람들은 보통 무엇을 하나요?', 130),
('transportation', 'unexpected', '교통수단', 'Transportation',
 'What kinds of transportation do people use in your country? How do you usually get around?',
 '우리나라 사람들은 어떤 교통수단을 이용하나요? 당신은 주로 어떻게 이동하나요?', 140),
('rp-ask-cafe', 'roleplay', '카페에 질문하기', 'Ask questions',
 'You want to meet your friend at a new café. Call the café and ask three or four questions about it.',
 '친구와 새 카페에서 만나려 합니다. 카페에 전화해 서너 가지를 물어보세요.', 210),
('rp-problem', 'roleplay', '문제 해결하기', 'Solve a problem',
 'You bought something online, but it arrived broken. Call the store, explain the problem, and suggest two or three solutions.',
 '온라인으로 산 물건이 망가진 채 왔습니다. 가게에 전화해 상황을 설명하고 해결책을 두세 가지 제안하세요.', 220),
('rp-experience', 'roleplay', '관련 경험 말하기', 'Past experience',
 'Have you ever had a problem with something you bought? Tell me what happened and how you solved it.',
 '산 물건에 문제가 있었던 적이 있나요? 무슨 일이 있었고 어떻게 해결했는지 말해 주세요.', 230);

-- 마지막 단계: 아래 이메일을 본인 Google 계정 이메일로 바꿔 실행하세요.
-- insert into public.owner_emails (email) values ('you@example.com');
