-- 0013 의 mock_used_this_month(p_uid) 를 로그인한 사용자가 직접 부르면 다른 사람의 이번 달 모의고사 횟수를 볼 수 있었다.
-- 화면은 자기 시험 표(RLS)에서 세므로 사용자에게는 닫는다. 서버(service_role)와 운영자 함수(admin_member_mock)는 그대로 쓴다.
revoke execute on function public.mock_used_this_month(uuid) from public, anon, authenticated;
grant execute on function public.mock_used_this_month(uuid) to service_role;
