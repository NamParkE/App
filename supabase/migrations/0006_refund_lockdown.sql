-- 환불 잠그기: 예전 refund_usage(p_n) 는 로그인한 사용자가 직접 불러 사용량을 마음대로 되돌릴 수 있었다.
-- 이제 차감할 때마다 "차감 영수증"(usage_charges)을 남기고, 환불은 그 영수증으로 한 번만 한다.
-- 영수증 표는 정책·권한이 없어 화면(브라우저)에서는 읽을 수도 쓸 수도 없다. 아래 함수들만 만진다.

create table if not exists public.usage_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  n int not null check (n between 1 and 20),
  lesson_id uuid references public.lessons (id) on delete set null,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists usage_charges_lesson on public.usage_charges (lesson_id) where lesson_id is not null;
alter table public.usage_charges enable row level security;
revoke all on public.usage_charges from public, anon, authenticated;

-- 사용량 차감 + 영수증. {"left": 남은 횟수(한도를 넘으면 -1), "ticket": 영수증 id 또는 null}
create or replace function public.charge_usage(p_n int default 1)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left int;
  v_ticket uuid;
begin
  v_left := consume_usage(p_n);
  if v_left >= 0 then
    insert into usage_charges (user_id, day, n) values (auth.uid(), today_kst(), p_n) returning id into v_ticket;
  end if;
  return json_build_object('left', v_left, 'ticket', v_ticket);
end;
$$;

-- 영수증 하나를 환불한다 (내 것, 오늘 것, 아직 환불 안 한 것만). 영수증 id 는 서버만 안다.
create or replace function public.refund_charge(p_ticket uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update usage_charges set refunded_at = now()
  where id = p_ticket and user_id = auth.uid() and day = today_kst() and refunded_at is null
  returning n into v_n;
  if v_n is null then
    return false;
  end if;
  update usage_daily set count = greatest(count - v_n, 0)
  where user_id = auth.uid() and day = today_kst();
  return true;
end;
$$;

-- 수업 시작 때 영수증을 수업에 묶는다 (한 번만)
create or replace function public.link_charge(p_ticket uuid, p_lesson uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update usage_charges set lesson_id = p_lesson
  where id = p_ticket and user_id = auth.uid() and lesson_id is null
    and exists (select 1 from lessons where id = p_lesson and user_id = auth.uid());
$$;

-- 대답 없이 끝난 수업의 사용량을 돌려준다. 수업이 중도 종료(left)이고, 센 대답이 대화 기록에 하나도 없을 때만.
-- (lessons.turns 는 화면에서 고칠 수 있으므로 믿지 않는다. 대화 기록은 고치거나 지울 수 없다)
create or replace function public.refund_lesson(p_lesson uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket uuid;
begin
  if not exists (select 1 from lessons where id = p_lesson and user_id = auth.uid() and status = 'left') then
    return false;
  end if;
  if exists (select 1 from lesson_messages where lesson_id = p_lesson and role = 'user' and counted) then
    return false;
  end if;
  select id into v_ticket from usage_charges
  where lesson_id = p_lesson and user_id = auth.uid() and refunded_at is null
  limit 1;
  if v_ticket is null then
    return false;
  end if;
  return refund_charge(v_ticket);
end;
$$;

-- 끝난 수업(done/left)은 다시 진행 중으로 되돌릴 수 없다 (환불받고 이어서 쓰는 것을 막는다)
create or replace function public.lessons_keep_closed()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'active' and new.status is distinct from old.status then
    raise exception 'lesson_closed';
  end if;
  return new;
end;
$$;
drop trigger if exists lessons_keep_closed on public.lessons;
create trigger lessons_keep_closed before update on public.lessons
  for each row execute function public.lessons_keep_closed();

-- 예전 환불 함수는 없앤다
drop function if exists public.refund_usage(int);

revoke execute on function
  public.charge_usage(int), public.refund_charge(uuid), public.link_charge(uuid, uuid), public.refund_lesson(uuid)
  from public, anon;
grant execute on function
  public.charge_usage(int), public.refund_charge(uuid), public.link_charge(uuid, uuid), public.refund_lesson(uuid)
  to authenticated;
