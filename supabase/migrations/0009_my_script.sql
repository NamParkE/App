-- 오픽 직접 답변 입력 (내 스크립트). 설계: docs/design/my-script-mode.md
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 넣고 실행하세요. 여러 번 실행해도 괜찮습니다.

-- ───── 답변 세트: AI 답변(등급마다) / 내 스크립트(주제마다 하나, 등급과 상관없음) ─────
alter table public.answer_sets add column if not exists source text not null default 'ai';
alter table public.answer_sets drop constraint if exists answer_sets_source_check;
alter table public.answer_sets add constraint answer_sets_source_check check (source in ('ai', 'mine'));

alter table public.answer_sets alter column level drop not null;
alter table public.answer_sets drop constraint if exists answer_sets_level_by_source;
alter table public.answer_sets add constraint answer_sets_level_by_source
  check ((source = 'ai' and level is not null) or (source = 'mine' and level is null));

create unique index if not exists answer_sets_mine_one on public.answer_sets (user_id, topic_id) where source = 'mine';

-- 수정안으로 바꾼 문장 표시
alter table public.sentences add column if not exists edited boolean not null default false;

-- ───── 기본 답변 방식 (오픽 시작할 때 고름, 내 정보에서 바꿈) ─────
alter table public.profiles add column if not exists opic_source text not null default 'ai';
alter table public.profiles drop constraint if exists profiles_opic_source_check;
alter table public.profiles add constraint profiles_opic_source_check check (opic_source in ('ai', 'mine'));
grant update (opic_source) on public.profiles to authenticated;

-- ───── AI 비용 기록에 "스크립트 확인" 종류 추가 (0008) ─────
alter table public.ai_calls drop constraint if exists ai_calls_kind_check;
alter table public.ai_calls add constraint ai_calls_kind_check
  check (kind in ('answer', 'coach', 'plan', 'turn', 'hint', 'sos', 'report', 'script'));
