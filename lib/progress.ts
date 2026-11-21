import "server-only";
import type { DB } from "./data";
import { one, type AnswerSource, type Level, type Sentence, type SentenceStatus } from "./types";

export const SENTENCE_COUNT: Record<Level, number> = { IM2: 5, IH: 7, AL: 9 };

type SetRow = {
  topic_id: string;
  level: Level | null;
  source: AnswerSource;
  sentences: { id: string; sentence_progress: { status: SentenceStatus }[] | null }[] | null;
};

/**
 * 모든 주제·등급의 진도를 한 번에 가져온다 (문장 + 내 진도를 한 쿼리로).
 * 등급을 몰라도 되므로 프로필 조회와 동시에 실행할 수 있다.
 */
export async function allProgress(supabase: DB, userId: string) {
  const { data } = await supabase
    .from("answer_sets")
    .select("topic_id, level, source, sentences(id, sentence_progress(status))")
    .eq("user_id", userId)
    .is("archived_at", null) // 교체되어 보관된 내 스크립트는 빼고
    .returns<SetRow[]>();
  return data ?? [];
}

function countDone(sentences: SetRow["sentences"]) {
  const list = sentences ?? [];
  const done = list.filter((x) => one<{ status: SentenceStatus }>(x.sentence_progress)?.status === "memorized").length;
  return { done, total: list.length };
}

/**
 * 주제별 진도: topic_id → { done, total }.
 * 기본 방식(preferred) 쪽 답변의 진도를 보여 주고, 그쪽이 없으면 다른 쪽을 보여 준다.
 * AI 답변은 지금 등급의 것만 센다.
 */
export function progressFor(rows: SetRow[], level: Level, preferred: AnswerSource = "ai") {
  const ai = new Map<string, { done: number; total: number }>();
  const mine = new Map<string, { done: number; total: number }>();
  for (const s of rows) {
    if (s.source === "mine") mine.set(s.topic_id, countDone(s.sentences));
    else if (s.level === level) ai.set(s.topic_id, countDone(s.sentences));
  }
  const [first, second] = preferred === "mine" ? [mine, ai] : [ai, mine];
  const map = new Map(second);
  for (const [k, v] of first) if (v.total > 0) map.set(k, v);
  return map;
}

type TopicSetRow = {
  id: string;
  level: Level | null;
  source: AnswerSource;
  sentences: (Sentence & { sentence_progress: { status: SentenceStatus }[] | null })[] | null;
};

/** 한 주제의 모든 답변(AI 답변 등급별 + 내 스크립트)을 한 번에 가져온다. */
export async function topicSets(supabase: DB, userId: string, topicId: string) {
  const { data } = await supabase
    .from("answer_sets")
    .select("id, level, source, sentences(id, position, en, pronunciation, ko, sentence_progress(status))")
    .eq("user_id", userId)
    .eq("topic_id", topicId)
    .is("archived_at", null) // 교체되어 보관된 내 스크립트는 빼고
    .returns<TopicSetRow[]>();
  return data ?? [];
}

/** 그중 한 답변의 문장들과 각 문장의 상태. source 가 ai 면 내 등급의 답변 */
export function sentencesFor(rows: TopicSetRow[], level: Level, source: AnswerSource = "ai") {
  const set = rows.find((r) => (source === "mine" ? r.source === "mine" : r.source !== "mine" && r.level === level));
  const raw = (set?.sentences ?? []).slice().sort((a, b) => a.position - b.position);
  const statuses: Record<string, SentenceStatus> = {};
  const sentences: Sentence[] = raw.map(({ sentence_progress, ...s }) => {
    statuses[s.id] = one<{ status: SentenceStatus }>(sentence_progress)?.status ?? "todo";
    return s;
  });
  return { sentences, statuses, setId: set?.id ?? null };
}

/** ?v= 값을 답변 종류로. 이상한 값이면 null */
export function parseSource(v: string | undefined): AnswerSource | null {
  return v === "mine" || v === "ai" ? v : null;
}

/**
 * 어느 답변을 보여 줄지 정한다: 주소의 ?v= → 기본 방식 → 다른 쪽 순서로, 문장이 있는 쪽.
 * 둘 다 없으면 기본 방식.
 */
export function pickSource(rows: TopicSetRow[], level: Level, asked: AnswerSource | null, preferred: AnswerSource): AnswerSource {
  const has = (src: AnswerSource) => sentencesFor(rows, level, src).sentences.length > 0;
  for (const src of [asked, preferred, preferred === "ai" ? "mine" : "ai"] as (AnswerSource | null)[]) {
    if (src && has(src)) return src;
  }
  return preferred;
}

/** 한 주제의 한 답변(내 스크립트 / 지금 등급의 AI 답변) 진도. 없으면 null */
export function progressOne(rows: SetRow[], topicId: string, source: AnswerSource, level: Level) {
  const set = rows.find((r) => r.topic_id === topicId && (source === "mine" ? r.source === "mine" : r.source !== "mine" && r.level === level));
  if (!set) return null;
  const p = countDone(set.sentences);
  return p.total > 0 ? p : null;
}
