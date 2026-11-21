-- 외운 문장 복습 (오픽 준비 고도화 ②). 설계: docs/design/opic-exam-prep.md
-- 외운 문장을 1 · 3 · 7 · 14일 뒤에 다시 물어본다. 한글 뜻만 보고 영어로 말해 90점 이상이면 다음 간격으로,
-- 아니면 외움 표시를 풀고(practicing) 복습 일정도 지운다. 다시 외우면 1일 뒤부터 다시 시작한다.

-- recall_step: 지금까지 통과한 복습 수 (0~4, 4 = 네 번 모두 통과 · 복습 끝)
-- next_recall_on: 다음 복습일 (한국 날짜). null = 복습 없음 (외우지 않았거나 복습 끝)
alter table public.sentence_progress add column if not exists recall_step int not null default 0;
alter table public.sentence_progress drop constraint if exists sentence_progress_recall_step_check;
alter table public.sentence_progress add constraint sentence_progress_recall_step_check check (recall_step between 0 and 4);
alter table public.sentence_progress add column if not exists next_recall_on date;
create index if not exists sentence_progress_recall_due
  on public.sentence_progress (user_id, next_recall_on) where next_recall_on is not null;

-- 통과한 복습 수 → 다음 복습까지 날 수 (0 → 1일, 1 → 3일, 2 → 7일, 3 → 14일, 4 → 없음)
create or replace function public.recall_gap(p_step int)
returns int
language sql
immutable
as $$
  select (array[1, 3, 7, 14])[p_step + 1];
$$;

-- 외움이 되는 순간 1일 뒤 복습을 잡고, 외움이 풀리면 일정을 지운다.
-- 외움 → 외움(같은 문장을 다시 연습)은 일정을 건드리지 않는다.
create or replace function public.sentence_progress_recall_schedule()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'memorized' then
    if tg_op = 'INSERT' or old.status is distinct from 'memorized' then
      new.recall_step := 0;
      new.next_recall_on := public.today_kst() + public.recall_gap(0);
    end if;
  else
    new.recall_step := 0;
    new.next_recall_on := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sentence_progress_recall_schedule on public.sentence_progress;
create trigger sentence_progress_recall_schedule
  before insert or update of status on public.sentence_progress
  for each row execute function public.sentence_progress_recall_schedule();

-- 복습 한 문장의 결과를 저장한다 (로그인한 본인의, 오늘까지 복습할 문장만).
-- 통과: 다음 간격으로 미룬다 (네 번째 통과면 복습 끝). 실패: 외움 표시를 푼다 (트리거가 일정을 지운다).
create or replace function public.record_recall(p_sentence_id uuid, p_passed boolean)
returns table (status text, recall_step int, next_recall_on date)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  return query
  update sentence_progress p set
    status = case when p_passed then 'memorized' else 'practicing' end,
    recall_step = case when p_passed then p.recall_step + 1 else 0 end,
    next_recall_on = case
      when p_passed and p.recall_step + 1 < 4 then today_kst() + recall_gap(p.recall_step + 1)
      else null
    end,
    updated_at = now()
  where p.user_id = v_uid
    and p.sentence_id = p_sentence_id
    and p.status = 'memorized'
    and p.next_recall_on <= today_kst()
  returning p.status, p.recall_step, p.next_recall_on;
  if not found then
    raise exception 'not_due' using errcode = 'no_data_found';
  end if;
end;
$$;
revoke execute on function public.record_recall(uuid, boolean) from public, anon;
grant execute on function public.record_recall(uuid, boolean) to authenticated;

-- 이미 외운 문장: 한꺼번에 몰리지 않게 사람마다 하루 15문장씩 내일부터 나눠서 첫 복습을 잡는다.
-- (트리거는 status 를 바꿀 때만 돌아서 여기에는 끼어들지 않는다. 여러 번 실행해도 이미 잡힌 것은 그대로)
update public.sentence_progress p set next_recall_on = s.due
from (
  select user_id, sentence_id,
    public.today_kst() + 1 + ((row_number() over (partition by user_id order by updated_at, sentence_id) - 1) / 15)::int as due
  from public.sentence_progress
  where status = 'memorized' and next_recall_on is null and recall_step = 0
) s
where p.user_id = s.user_id and p.sentence_id = s.sentence_id;
