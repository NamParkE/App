-- 전화영어 코칭 (리피가 먼저 도와주기 · 따라 말하기). 의도: docs/intent/call-coaching.md
-- 1) 대화 한 줄의 종류: talk(보통 대화) · help(말이 없을 때 리피가 먼저 건 말) · repeat(학생이 따라 말한 것, 대답 수에 넣지 않음)
alter table public.lesson_messages add column if not exists kind text not null default 'talk';
alter table public.lesson_messages drop constraint if exists lesson_messages_kind_check;
alter table public.lesson_messages add constraint lesson_messages_kind_check check (kind in ('talk', 'help', 'repeat'));

-- 2) 리피가 지난 대답과 함께 미리 준비해 둔 도움 (말이 없을 때 할 말 두 단계, 따라 말할 문장).
--    화면이 보낸 글을 그대로 기록에 넣지 않고, 서버가 저장해 둔 것만 쓴다. 사용자는 읽기만 (0007: lessons 는 서버만 쓴다).
alter table public.lessons add column if not exists pending_help jsonb;
