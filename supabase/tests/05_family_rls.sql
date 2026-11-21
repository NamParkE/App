-- 가족 경계: 다른 가족의 정보는 보이지 않는다 (RLS)
\set U '00000000-0000-0000-0000-00000000000a'
\set W '00000000-0000-0000-0000-00000000000c'

insert into daily_activity (user_id, day, lessons, practices, points) values (:'W', today_kst(), 1, 3, 13);
select set_config('request.jwt.claim.sub', :'U', true);
set local role authenticated;
select count(*) as seen_profiles from profiles \gset
select count(*) as seen_w from profiles where id = :'W' \gset
select count(*) as board_rows from family_board() \gset
select count(*) as seen_activity from daily_activity where user_id = :'W' \gset
reset role;
select test.ok(:seen_profiles = 2, '같은 가족(U, V) 프로필만 보인다');
select test.ok(:seen_w = 0, '다른 가족 프로필은 보이지 않는다');
select test.ok(:board_rows = 2, '가족 순위에는 우리 가족만');
select test.ok(:seen_activity = 0, '다른 사람의 학습 기록은 보이지 않는다');
