import "server-only";
import type { DB } from "./data";
import { one, type Level, type Sentence, type SentenceStatus } from "./types";

export const SENTENCE_COUNT: Record<Level, number> = { IM2: 5, IH: 7, AL: 9 };

type SetRow = {
  topic_id: string;
  level: Level;
  sentences: { id: string; sentence_progress: { status: SentenceStatus }[] | null }[] | null;
};

/**
 * 모든 주제·등급의 진도를 한 번에 가져온다 (문장 + 내 진도를 한 쿼리로).
 * 등급을 몰라도 되므로 프로필 조회와 동시에 실행할 수 있다.
 */
export async function allProgress(supabase: DB, userId: string) {
  const { data } = await supabase
    .from("answer_sets")
    .select("topic_id, level, sentences(id, sentence_progress(status))")
    .eq("user_id", userId)
    .returns<SetRow[]>();
  return data ?? [];
}

/** 특정 등급의 주제별 진도: topic_id → { done, total } */
export function progressFor(rows: SetRow[], level: Level) {
  const map = new Map<string, { done: number; total: number }>();
  for (const s of rows) {
    if (s.level !== level) continue;
    const sentences = s.sentences ?? [];
    const done = sentences.filter((x) => one<{ status: SentenceStatus }>(x.sentence_progress)?.status === "memorized").length;
    map.set(s.topic_id, { done, total: sentences.length });
  }
  return map;
}

type TopicSetRow = {
  level: Level;
  sentences: (Sentence & { sentence_progress: { status: SentenceStatus }[] | null })[] | null;
};

/** 한 주제의 모든 등급 답변을 한 번에 가져온다 (등급은 나중에 고른다). */
export async function topicSets(supabase: DB, userId: string, topicId: string) {
  const { data } = await supabase
    .from("answer_sets")
    .select("level, sentences(id, position, en, pronunciation, ko, sentence_progress(status))")
    .eq("user_id", userId)
    .eq("topic_id", topicId)
    .returns<TopicSetRow[]>();
  return data ?? [];
}

/** 그중 내 등급의 문장들과 각 문장의 상태 */
export function sentencesFor(rows: TopicSetRow[], level: Level) {
  const set = rows.find((r) => r.level === level);
  const raw = (set?.sentences ?? []).slice().sort((a, b) => a.position - b.position);
  const statuses: Record<string, SentenceStatus> = {};
  const sentences: Sentence[] = raw.map(({ sentence_progress, ...s }) => {
    statuses[s.id] = one<{ status: SentenceStatus }>(sentence_progress)?.status ?? "todo";
    return s;
  });
  return { sentences, statuses };
}
