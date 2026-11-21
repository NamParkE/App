-- 실전 모의고사 (오픽 준비 고도화 ③). 설계: docs/design/opic-exam-prep.md
-- - 하루 사용량과 따로 세는 전용 횟수: 사람마다 한 달 mock_monthly_limit 회 (기본 3, 한국 시간 매달 1일 다시 채움).
-- - 15번을 마치는 순간(finish_mock_exam) 한 번 센다. 끝내지 않고 나간 시험(active)은 세지 않는다.
-- - 시험 · 리포트 기록은 서버(service_role)만 쓴다. 사용자는 자기 것을 읽기만 한다.

-- ───── 사람마다 한 달 횟수 (운영자가 바꾼다) ─────
alter table public.profiles add column if not exists mock_monthly_limit int not null default 3;
alter table public.profiles drop constraint if exists profiles_mock_monthly_limit_check;
alter table public.profiles add constraint profiles_mock_monthly_limit_check check (mock_monthly_limit between 0 and 30);

-- ───── 시험 ─────
create table if not exists public.mock_exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'done')),
  survey jsonb not null default '{}'::jsonb,          -- 배경 설문 답 (다음 시험 때 미리 채운다)
  self_level int not null check (self_level between 1 and 6),
  questions jsonb not null,                           -- 1~7번 + 8~15번(쉽게 / 비슷하게 / 어렵게 세 벌)
  adjusted text check (adjusted in ('easier', 'same', 'harder')), -- 7번 뒤 고른 난이도
  answers jsonb not null default '[]'::jsonb,         -- [{n, said, sec, replays}]
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  report jsonb,
  report_status text not null default 'none' check (report_status in ('none', 'pending', 'ready', 'failed')),
  check ((status = 'done') = (finished_at is not null))
);
create index if not exists mock_exams_user_finished on public.mock_exams (user_id, finished_at desc);
create index if not exists mock_exams_user_started on public.mock_exams (user_id, started_at desc);

alter table public.mock_exams enable row level security;
drop policy if exists "내 모의고사를 본다" on public.mock_exams;
create policy "내 모의고사를 본다" on public.mock_exams
  for select to authenticated using (user_id = auth.uid());
revoke all on public.mock_exams from anon, authenticated;
grant select on public.mock_exams to authenticated;
grant select, insert, update on public.mock_exams to service_role;

-- 한국 시간 이번 달 1일 0시
create or replace function public.month_start_kst()
returns timestamptz
language sql
stable
as $$
  select (date_trunc('month', today_kst())::timestamp at time zone 'Asia/Seoul');
$$;

-- 이번 달에 마친 모의고사 수
create or replace function public.mock_used_this_month(p_uid uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from mock_exams
  where user_id = p_uid and status = 'done' and finished_at >= month_start_kst();
$$;

-- 시험을 마친다 (서버만). 이번 달 횟수가 남아 있어야 하고, 이미 마친 시험이면 다시 세지 않는다.
-- 돌려주는 값: 이번 달 남은 횟수. 횟수가 없으면 no_quota(53400), 내 시험이 아니면 no_exam(P0002).
create or replace function public.finish_mock_exam(p_uid uuid, p_exam uuid, p_adjusted text, p_answers jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_status text;
  v_used int;
begin
  -- 같은 사람의 마치기를 한 줄로 세운다 (동시에 두 시험을 마쳐도 한도를 넘지 않게)
  select mock_monthly_limit into v_limit from profiles where id = p_uid for update;
  if v_limit is null then
    raise exception 'no_profile' using errcode = 'P0002';
  end if;
  select status into v_status from mock_exams where id = p_exam and user_id = p_uid for update;
  if v_status is null then
    raise exception 'no_exam' using errcode = 'P0002';
  end if;
  v_used := mock_used_this_month(p_uid);
  if v_status = 'done' then
    return greatest(v_limit - v_used, 0);
  end if;
  if v_used >= v_limit then
    raise exception 'no_quota' using errcode = '53400';
  end if;
  update mock_exams set
    status = 'done',
    finished_at = now(),
    adjusted = p_adjusted,
    answers = coalesce(p_answers, '[]'::jsonb),
    report_status = 'pending'
  where id = p_exam;
  return v_limit - v_used - 1;
end;
$$;
revoke execute on function public.finish_mock_exam(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.finish_mock_exam(uuid, uuid, text, jsonb) to service_role;
revoke execute on function public.mock_used_this_month(uuid) from public, anon;
grant execute on function public.mock_used_this_month(uuid) to authenticated, service_role;
grant execute on function public.month_start_kst() to authenticated, service_role;

-- ───── AI 비용 기록에 "모의고사 리포트" 종류 추가 (0008, 0009) ─────
alter table public.ai_calls drop constraint if exists ai_calls_kind_check;
alter table public.ai_calls add constraint ai_calls_kind_check
  check (kind in ('answer', 'coach', 'plan', 'turn', 'hint', 'sos', 'report', 'script', 'mock'));

-- ───── 운영자: 한 사람의 모의고사 월 횟수 보기 · 바꾸기 ─────
-- 하루 한도 변경 기록(limit_changes)과 따로 남긴다 (운영자 회원 화면의 "마지막 변경"이 섞이지 않게)
create table if not exists public.mock_limit_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  old_limit int not null,
  new_limit int not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);
alter table public.mock_limit_changes enable row level security;
revoke all on public.mock_limit_changes from public, anon, authenticated;

create or replace function public.admin_member_mock(p_user uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform assert_operator();
  return (
    select json_build_object(
      'mock_limit', p.mock_monthly_limit,
      'used_month', mock_used_this_month(p.id),
      'exams', coalesce((
        select json_agg(json_build_object('finished_at', e.finished_at, 'grade', e.report ->> 'grade') order by e.finished_at desc)
        from mock_exams e where e.user_id = p.id and e.status = 'done' and e.finished_at >= month_start_kst()
      ), '[]'::json)
    )
    from profiles p where p.id = p_user
  );
end;
$$;

create or replace function public.admin_set_mock_limit(p_user uuid, p_limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old int;
begin
  perform assert_operator();
  if p_limit is null or p_limit < 0 or p_limit > 30 then
    raise exception 'bad_limit' using errcode = '22023';
  end if;
  select mock_monthly_limit into v_old from profiles where id = p_user for update;
  if v_old is null then
    raise exception 'no_user' using errcode = 'P0002';
  end if;
  if v_old <> p_limit then
    update profiles set mock_monthly_limit = p_limit where id = p_user;
    insert into mock_limit_changes (user_id, old_limit, new_limit, changed_by) values (p_user, v_old, p_limit, auth.uid());
  end if;
  return p_limit;
end;
$$;
revoke execute on function public.admin_member_mock(uuid), public.admin_set_mock_limit(uuid, int) from public, anon;
grant execute on function public.admin_member_mock(uuid), public.admin_set_mock_limit(uuid, int) to authenticated;
