-- 운영자 메뉴 (설계: docs/design/admin-menu.md)
-- 운영자 한 명이 모든 가족의 AI 비용 · 학습한 사람 · 한도를 다 쓴 사람 · 모드별 사용량을 보고, 사람마다 하루 한도를 바꾼다.
-- 운영자가 보는 것은 숫자와 이름 · 레벨뿐이다. 아래 admin_* 함수는 대화 · 문장 · 리포트 표를 읽지 않는다.
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 넣고 실행하세요. 여러 번 실행해도 괜찮습니다.

-- ───────────────────────── 운영자 ─────────────────────────

-- owner_emails(새 가족을 만들 수 있는 사람)와 따로 둔다. 판매하면 가족을 만드는 사람마다 owner_emails 에 들어가기 때문이다.
-- 운영자 등록: insert into public.operator_emails (email) values ('운영자@gmail.com');
create table if not exists public.operator_emails (
  email text primary key
);
alter table public.operator_emails enable row level security;
revoke all on public.operator_emails from public, anon, authenticated;

-- 로그인한 사람이 운영자인지. 이메일 확인을 마친 계정만 인정한다.
create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users u
    join operator_emails o on lower(o.email) = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;

create or replace function public.assert_operator()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_operator() then
    raise exception 'not_operator' using errcode = '42501';
  end if;
end;
$$;

-- ───────────────────────── AI 호출 기록 (비용) ─────────────────────────

create table if not exists public.ai_calls (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  family_id uuid references public.families (id) on delete set null,
  kind text not null check (kind in ('answer', 'coach', 'plan', 'turn', 'hint', 'sos', 'report')),
  model text not null,
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  cache_read_tokens int not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens int not null default 0 check (cache_write_tokens >= 0),
  -- 기록할 때의 가격표로 계산한 금액 (나중에 가격이 바뀌어도 그대로)
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  created_at timestamptz not null default now()
);
create index if not exists ai_calls_created on public.ai_calls (created_at);
create index if not exists ai_calls_family_created on public.ai_calls (family_id, created_at);
create index if not exists ai_calls_user_created on public.ai_calls (user_id, created_at);
alter table public.ai_calls enable row level security;
-- 정책 없음: 화면(브라우저)에서는 읽지도 쓰지도 못한다. 서버(service_role)만 쓰고, 운영자는 아래 함수로 합계만 본다.
revoke all on public.ai_calls from public, anon, authenticated;
grant insert on public.ai_calls to service_role;

-- 가족은 기록할 때 프로필에서 채운다 (나중에 가족을 옮겨도 그때의 가족으로 남는다)
create or replace function public.ai_calls_fill_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.family_id is null and new.user_id is not null then
    select family_id into new.family_id from profiles where id = new.user_id;
  end if;
  return new;
end;
$$;
drop trigger if exists ai_calls_fill_family on public.ai_calls;
create trigger ai_calls_fill_family before insert on public.ai_calls
  for each row execute function public.ai_calls_fill_family();

-- ───────────────────────── 한도 변경 기록 ─────────────────────────

create table if not exists public.limit_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  old_limit int not null,
  new_limit int not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists limit_changes_user on public.limit_changes (user_id, changed_at desc);
alter table public.limit_changes enable row level security;
revoke all on public.limit_changes from public, anon, authenticated;

-- ───────────────────────── 공통 계산 ─────────────────────────

-- 한국 날짜 기준 이번 주 월요일
create or replace function public.week_start_kst()
returns date
language sql
stable
as $$
  select today_kst() - (extract(isodow from today_kst())::int - 1);
$$;

-- 하루 학습 인정 (연속 학습일과 같은 기준): 수업 1회 또는 문장 연습 3회
-- 이메일은 앞부분과 끝부분만 보여 준다: minjun@gmail.com → minjun@…com
create or replace function public.mask_email(p_email text)
returns text
language sql
immutable
as $$
  select case
    when p_email is null or position('@' in p_email) = 0 then null
    else split_part(p_email, '@', 1) || '@…' ||
      coalesce(nullif(regexp_replace(split_part(p_email, '@', 2), '^.*\.', ''), ''), '')
  end;
$$;

-- ───────────────────────── 운영자 홈 ─────────────────────────

create or replace function public.admin_overview()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := today_kst();
  v_mon date := week_start_kst();
  v_month date := date_trunc('month', today_kst())::date;
  v_result json;
begin
  perform assert_operator();

  with studied as (
    select user_id, day from daily_activity
    where day between v_mon and v_today and (lessons > 0 or practices >= 3)
  ),
  month_calls as (
    select family_id, cost_usd from ai_calls
    where created_at >= (v_month::timestamp at time zone 'Asia/Seoul')
  ),
  maxed as (
    select p.id, p.display_name, f.name as family_name, u.count as used, p.daily_limit
    from usage_daily u
    join profiles p on p.id = u.user_id
    join families f on f.id = p.family_id
    where u.day = v_today and u.count >= p.daily_limit
  ),
  fam as (
    select
      f.id, f.name, f.created_at,
      (select count(*) from profiles p where p.family_id = f.id)::int as members,
      (select count(distinct s.user_id) from studied s join profiles p on p.id = s.user_id
        where p.family_id = f.id and s.day = v_today)::int as studied_today,
      coalesce((select sum(c.cost_usd) from month_calls c where c.family_id = f.id), 0)::float8 as month_cost_usd
    from families f
  )
  select json_build_object(
    'today', v_today,
    'month_cost_usd', coalesce((select sum(cost_usd) from month_calls), 0)::float8,
    'month_calls', (select count(*) from month_calls)::int,
    'total_users', (select count(*) from profiles)::int,
    'studied_today', (select count(distinct user_id) from studied where day = v_today)::int,
    'studied_week', (select count(distinct user_id) from studied)::int,
    'week_practices', coalesce((select sum(practices) from daily_activity where day between v_mon and v_today), 0)::int,
    'week_lessons', coalesce((select sum(lessons) from daily_activity where day between v_mon and v_today), 0)::int,
    'maxed', coalesce((select json_agg(json_build_object(
        'user_id', m.id, 'display_name', m.display_name, 'family_name', m.family_name,
        'used', m.used, 'daily_limit', m.daily_limit) order by m.family_name, m.display_name) from maxed m), '[]'::json),
    'families', coalesce((select json_agg(json_build_object(
        'id', x.id, 'name', x.name, 'members', x.members,
        'studied_today', x.studied_today, 'month_cost_usd', x.month_cost_usd)
        order by x.month_cost_usd desc, x.created_at) from fam x), '[]'::json)
  ) into v_result;
  return v_result;
end;
$$;

-- ───────────────────────── 가족 ─────────────────────────

create or replace function public.admin_family(p_family uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := today_kst();
  v_month date := date_trunc('month', today_kst())::date;
  v_result json;
begin
  perform assert_operator();
  if not exists (select 1 from families where id = p_family) then
    return null;
  end if;

  with m as (
    select
      p.id, p.display_name, p.style, p.daily_limit, p.created_at,
      case when p.style = 'vocab' then '전화영어 Lv.' || p.call_level else '오픽 ' || p.level end as level_label,
      (p.id = f.owner_id) as is_owner,
      coalesce((select u.count from usage_daily u where u.user_id = p.id and u.day = v_today), 0) as used_today,
      streak_for(p.id) as streak,
      (select max(a.day) from daily_activity a where a.user_id = p.id and (a.lessons > 0 or a.practices >= 3)) as last_study_day,
      coalesce((select sum(c.cost_usd) from ai_calls c where c.user_id = p.id
        and c.created_at >= (v_month::timestamp at time zone 'Asia/Seoul')), 0)::float8 as month_cost_usd
    from profiles p
    join families f on f.id = p.family_id
    where p.family_id = p_family
  )
  select json_build_object(
    'id', f.id,
    'name', f.name,
    'created_at', f.created_at,
    'owner_name', (select display_name from profiles where id = f.owner_id),
    'month_cost_usd', coalesce((select sum(c.cost_usd) from ai_calls c where c.family_id = f.id
      and c.created_at >= (v_month::timestamp at time zone 'Asia/Seoul')), 0)::float8,
    'members', coalesce((select json_agg(json_build_object(
        'user_id', m.id, 'display_name', m.display_name, 'is_owner', m.is_owner, 'style', m.style,
        'level_label', m.level_label, 'used_today', m.used_today, 'daily_limit', m.daily_limit,
        'streak', m.streak, 'last_study_day', m.last_study_day, 'month_cost_usd', m.month_cost_usd)
        order by m.used_today desc, m.created_at) from m), '[]'::json)
  ) into v_result
  from families f
  where f.id = p_family;
  return v_result;
end;
$$;

-- ───────────────────────── 사람 ─────────────────────────

create or replace function public.admin_member(p_user uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := today_kst();
  v_month date := date_trunc('month', today_kst())::date;
  v_result json;
begin
  perform assert_operator();
  if not exists (select 1 from profiles where id = p_user) then
    return null;
  end if;

  select json_build_object(
    'user_id', p.id,
    'display_name', p.display_name,
    'email', mask_email((select email from auth.users where id = p.id)),
    'family_id', f.id,
    'family_name', f.name,
    'is_owner', p.id = f.owner_id,
    'level_label', case when p.style = 'vocab' then '전화영어 Lv.' || p.call_level else '오픽 ' || p.level end,
    'daily_limit', p.daily_limit,
    'used_today', coalesce((select u.count from usage_daily u where u.user_id = p.id and u.day = v_today), 0),
    'days', (select json_agg(json_build_object(
        'day', d.day::date,
        'used', coalesce((select u.count from usage_daily u where u.user_id = p.id and u.day = d.day::date), 0))
        order by d.day)
      from generate_series(v_today - 6, v_today, interval '1 day') d(day)),
    'streak', streak_for(p.id),
    'last_study_day', (select max(a.day) from daily_activity a where a.user_id = p.id and (a.lessons > 0 or a.practices >= 3)),
    'month_lessons', coalesce((select sum(a.lessons) from daily_activity a where a.user_id = p.id and a.day >= v_month), 0)::int,
    'month_practices', coalesce((select sum(a.practices) from daily_activity a where a.user_id = p.id and a.day >= v_month), 0)::int,
    'month_used', coalesce((select sum(u.count) from usage_daily u where u.user_id = p.id and u.day >= v_month), 0)::int,
    'month_cost_usd', coalesce((select sum(c.cost_usd) from ai_calls c where c.user_id = p.id
      and c.created_at >= (v_month::timestamp at time zone 'Asia/Seoul')), 0)::float8,
    'last_change', (select json_build_object('old_limit', l.old_limit, 'new_limit', l.new_limit, 'changed_at', l.changed_at)
      from limit_changes l where l.user_id = p.id order by l.changed_at desc limit 1)
  ) into v_result
  from profiles p
  join families f on f.id = p.family_id
  where p.id = p_user;
  return v_result;
end;
$$;

-- 하루 한도 바꾸기 (0~200). 바뀐 값을 돌려준다.
create or replace function public.admin_set_limit(p_user uuid, p_limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old int;
begin
  perform assert_operator();
  if p_limit is null or p_limit < 0 or p_limit > 200 then
    raise exception 'bad_limit' using errcode = '22023';
  end if;
  select daily_limit into v_old from profiles where id = p_user for update;
  if v_old is null then
    raise exception 'no_profile' using errcode = 'P0002';
  end if;
  if v_old <> p_limit then
    update profiles set daily_limit = p_limit where id = p_user;
    insert into limit_changes (user_id, old_limit, new_limit, changed_by) values (p_user, v_old, p_limit, auth.uid());
  end if;
  return p_limit;
end;
$$;

-- ───────────────────────── AI 비용 ─────────────────────────

-- p_month: 그 달의 아무 날 (한국 날짜). 하루별 · 기능별 · 가족별 · 모델별 합계
create or replace function public.admin_cost(p_month date)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start date := date_trunc('month', coalesce(p_month, today_kst()))::date;
  v_end date := (date_trunc('month', coalesce(p_month, today_kst())) + interval '1 month')::date;
  v_result json;
begin
  perform assert_operator();

  with c as (
    select a.*, (a.created_at at time zone 'Asia/Seoul')::date as day
    from ai_calls a
    where a.created_at >= (v_start::timestamp at time zone 'Asia/Seoul')
      and a.created_at < (v_end::timestamp at time zone 'Asia/Seoul')
  )
  select json_build_object(
    'month', v_start,
    'total_usd', coalesce((select sum(cost_usd) from c), 0)::float8,
    'calls', (select count(*) from c)::int,
    'first_call_at', (select min(created_at) from ai_calls),
    'days', coalesce((select json_agg(json_build_object('day', x.day, 'usd', x.usd) order by x.day)
      from (select day, sum(cost_usd)::float8 as usd from c group by day) x), '[]'::json),
    'kinds', coalesce((select json_agg(json_build_object('kind', x.kind, 'usd', x.usd, 'calls', x.n) order by x.usd desc)
      from (select kind, sum(cost_usd)::float8 as usd, count(*)::int as n from c group by kind) x), '[]'::json),
    'families', coalesce((select json_agg(json_build_object('id', x.family_id, 'name', coalesce(f.name, '(가족 없음)'),
        'members', (select count(*) from profiles p where p.family_id = x.family_id)::int, 'usd', x.usd) order by x.usd desc)
      from (select family_id, sum(cost_usd)::float8 as usd from c group by family_id) x
      left join families f on f.id = x.family_id), '[]'::json),
    'models', coalesce((select json_agg(json_build_object('model', x.model, 'usd', x.usd, 'calls', x.n) order by x.usd desc)
      from (select model, sum(cost_usd)::float8 as usd, count(*)::int as n from c group by model) x), '[]'::json)
  ) into v_result;
  return v_result;
end;
$$;

-- ───────────────────────── 권한 ─────────────────────────

revoke execute on function
  public.is_operator(), public.assert_operator(), public.ai_calls_fill_family(),
  public.admin_overview(), public.admin_family(uuid), public.admin_member(uuid),
  public.admin_set_limit(uuid, int), public.admin_cost(date)
  from public, anon;
-- 로그인한 사람은 부를 수 있지만, 운영자가 아니면 함수 첫 줄에서 막힌다
grant execute on function
  public.is_operator(), public.admin_overview(), public.admin_family(uuid), public.admin_member(uuid),
  public.admin_set_limit(uuid, int), public.admin_cost(date)
  to authenticated;
