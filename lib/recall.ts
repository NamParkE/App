// 외운 문장 복습 (오픽 준비 고도화 ②): 오늘 복습할 문장 고르기 · 날짜 표시.
// 일정 계산과 저장은 DB(0011_sentence_recall.sql)가 한다. 여기는 화면에 필요한 순수 함수만 (테스트하기 쉽게).
import type { DiffResult } from "./diff.ts";
import { one, type AnswerSource, type Level } from "./types.ts";

/** 한 번에 복습하는 최대 문장 수 (나머지는 끝나고 다시 시작하면 이어서) */
export const RECALL_SESSION = 20;
/** 통과한 복습 수 → 다음 복습까지 날 수 (DB 의 recall_gap 과 같다) */
export const RECALL_GAPS = [1, 3, 7, 14] as const;

export type DueRow = {
  sentence_id: string;
  recall_step: number;
  next_recall_on: string;
  sentences: unknown; // { id, en, ko, position, answer_sets: { topic_id, source, level, archived_at } }
};

export type RecallItem = {
  id: string;
  en: string;
  ko: string;
  position: number;
  topicId: string;
  source: AnswerSource;
  step: number; // 지금까지 통과한 복습 수
  dueOn: string; // 복습하기로 한 날 (YYYY-MM-DD)
};

type SentenceRow = { id: string; en: string; ko: string; position: number; answer_sets: unknown };
type SetRow = { topic_id: string; source: AnswerSource; level: Level | null; archived_at: string | null };

/**
 * 오늘 복습할 문장: 지금 쓰는 답변(보관되지 않은 내 스크립트, 지금 등급의 AI 답변)의 것만.
 * 오래 밀린 것 먼저, 같은 날이면 주제 · 문장 순서대로.
 */
export function pickDue(rows: DueRow[], level: Level): RecallItem[] {
  const items: RecallItem[] = [];
  for (const r of rows) {
    const s = one<SentenceRow>(r.sentences);
    const set = one<SetRow>(s?.answer_sets);
    if (!s || !set || set.archived_at) continue;
    if (set.source !== "mine" && set.level !== level) continue;
    items.push({
      id: s.id,
      en: s.en,
      ko: s.ko,
      position: s.position,
      topicId: set.topic_id,
      source: set.source,
      step: r.recall_step,
      dueOn: r.next_recall_on,
    });
  }
  return items.sort(
    (a, b) => a.dueOn.localeCompare(b.dueOn) || a.topicId.localeCompare(b.topicId) || a.position - b.position,
  );
}

/** 주제별 문장 수 (홈 카드의 "집 소개 5 · 카페 4"), 많은 것 먼저 */
export function countByTopic(items: RecallItem[]) {
  const map = new Map<string, number>();
  for (const it of items) map.set(it.topicId, (map.get(it.topicId) ?? 0) + 1);
  return [...map.entries()].map(([topicId, count]) => ({ topicId, count })).sort((a, b) => b.count - a.count);
}

/** 두 날짜(YYYY-MM-DD) 사이 날 수 */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "14일 뒤 (12월 5일)" — 다음 복습 안내 */
export function nextRecallLabel(today: string, next: string | null) {
  if (!next) return "네 번 모두 기억했어요 · 복습 끝";
  const [, m, d] = next.split("-").map(Number);
  const n = daysBetween(today, next);
  return `다음 복습: ${n === 1 ? "내일" : `${n}일 뒤`} (${m}월 ${d}일)`;
}

/** 이번 복습이 외운 지 며칠 만인지 ("7일 만에 복습") — 통과한 복습 수로 계산 */
export function sinceLabel(step: number) {
  const days = RECALL_GAPS.slice(0, step + 1).reduce((a, b) => a + b, 0);
  return `외운 지 ${days}일째 복습`;
}

/** /api/recall 응답 */
export type RecallResponse = {
  diff: DiffResult | null;
  score: number;
  passed: boolean;
  /** 저장한 결과. 한 번 더 말해 보기(retry)면 null */
  saved: { status: "memorized" | "practicing"; step: number; nextRecallOn: string | null } | null;
};
