-- 사용자가 직접 고치면 안 되는 기록은 서버(service_role)만 쓴다.
-- 예전에는 로그인한 사용자가 수업 점수 · 대답 수 · 대화 기록 · 학습 점수를 브라우저에서 직접 바꿀 수 있었다.
-- 서버는 SUPABASE_SERVICE_ROLE_KEY 로 쓰고, 사용자는 읽기만 한다 (RLS 정책은 그대로: 내 것만 보인다).

-- ───── 수업 · 대화: 사용자는 읽기만 ─────
revoke insert, update, delete on public.lessons from authenticated;
revoke insert, update, delete on public.lesson_messages from authenticated;
grant select, insert, update on public.lessons, public.lesson_messages to service_role;

-- ───── 학습 점수 (연속 학습일 · 가족 순위): 서버만 올린다 ─────
create or replace function public.bump_activity_for(
  p_uid uuid, p_lessons int default 0, p_practices int default 0, p_memorized int default 0, p_reviews int default 0
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into daily_activity (user_id, day, lessons, practices, memorized, reviews, points)
  values (
    p_uid, today_kst(),
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
revoke execute on function public.bump_activity_for(uuid, int, int, int, int) from public, anon, authenticated;
grant execute on function public.bump_activity_for(uuid, int, int, int, int) to service_role;

-- 사용자가 직접 부를 수 있던 예전 함수는 없앤다
drop function if exists public.bump_activity(int, int, int, int);

-- ───── 배포 전에 시작한 수업의 영수증 채우기 ─────
-- 0006 전에 시작한 오늘 수업에는 차감 영수증이 없어 대답 없이 끝나도 환불되지 않는다. 실제로 5회를 차감했으므로 영수증을 만들어 둔다.
insert into public.usage_charges (user_id, day, n, lesson_id)
select l.user_id, public.today_kst(), 5, l.id
from public.lessons l
where l.status = 'active'
  and (l.started_at at time zone 'Asia/Seoul')::date = public.today_kst()
  and not exists (select 1 from public.usage_charges c where c.lesson_id = l.id);
