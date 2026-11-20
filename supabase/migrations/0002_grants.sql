-- 표 권한을 명시적으로 준다.
-- 최근 Supabase 프로젝트는 SQL로 만든 표를 앱(anon / authenticated)에 자동으로 열어 주지 않는다.
-- 어떤 행을 볼 수 있는지는 0001 의 RLS 정책이 정한다. 여기서는 "표에 접근할 수 있는지"만 정한다.
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 실행하세요. 여러 번 실행해도 괜찮습니다.

grant usage on schema public to anon, authenticated;

-- 읽기만
grant select on public.topics, public.families, public.usage_daily to authenticated;

-- 프로필: 읽기 + 정해진 칸만 수정 (한도·가족은 수정 불가)
grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated, anon;
grant update (display_name, level, style, setup_done) on public.profiles to authenticated;

-- 내 학습 데이터: 읽기·쓰기 (RLS 로 본인 것만)
grant select, insert, update, delete on
  public.answer_sets, public.sentences, public.sentence_progress, public.attempts
  to authenticated;

-- 로그인하지 않은 사용자(anon)는 표에 접근하지 않는다
revoke all on
  public.owner_emails, public.families, public.profiles, public.usage_daily, public.topics,
  public.answer_sets, public.sentences, public.sentence_progress, public.attempts
  from anon;
revoke all on public.owner_emails from authenticated;

-- 함수: 로그인한 사용자만 실행
revoke execute on function
  public.my_family_id(), public.gen_invite_code(), public.create_family(text),
  public.join_family(text, text), public.today_kst(), public.consume_usage(), public.refund_usage()
  from public, anon;
grant execute on function
  public.my_family_id(), public.create_family(text), public.join_family(text, text),
  public.today_kst(), public.consume_usage(), public.refund_usage()
  to authenticated;
