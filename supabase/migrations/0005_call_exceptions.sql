-- 전화영어 예외 처리: 엉뚱한 대답 · 한국어로 묻기 · 끊긴 통화 이어하기
-- 설계: docs/design/vocab-call-mode.md (시안: 전화영어 예외 처리 시안)

-- 대답 수에 넣지 않은 대답 (장난 · 무의미한 말)
alter table public.lesson_messages add column if not exists counted boolean not null default true;

-- 수업당 "한국어로 묻기" 사용 횟수
alter table public.lessons add column if not exists sos int not null default 0;

-- 마지막으로 주고받은 때. 30분이 지나면 끊긴 통화를 정리한다
alter table public.lessons add column if not exists last_active_at timestamptz not null default now();

create index if not exists lessons_user_active on public.lessons (user_id, last_active_at desc) where status = 'active';
