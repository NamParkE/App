import "server-only";
import type { createClient } from "./supabase/server";
import type { Level, Sentence, SentenceStatus } from "./types";

type DB = Awaited<ReturnType<typeof createClient>>;

export const SENTENCE_COUNT: Record<Level, number> = { IM2: 5, IH: 7, AL: 9 };

/** 주제별 진도 (현재 등급 기준): topic_id → { done, total } */
export async function topicProgress(supabase: DB, userId: string, level: Level) {
  const { data: sets } = await supabase
    .from("answer_sets")
    .select("topic_id, sentences(id)")
    .eq("user_id", userId)
    .eq("level", level);
  const { data: memorized } = await supabase
    .from("sentence_progress")
    .select("sentence_id")
    .eq("user_id", userId)
    .eq("status", "memorized");
  const done = new Set((memorized ?? []).map((m) => m.sentence_id as string));
  const map = new Map<string, { done: number; total: number }>();
  for (const s of sets ?? []) {
    const ids = ((s.sentences as { id: string }[] | null) ?? []).map((x) => x.id);
    map.set(s.topic_id as string, { done: ids.filter((id) => done.has(id)).length, total: ids.length });
  }
  return map;
}

/** 한 주제의 문장들과 각 문장의 상태 */
export async function topicSentences(supabase: DB, userId: string, topicId: string, level: Level) {
  const { data: set } = await supabase
    .from("answer_sets")
    .select("id, sentences(id, position, en, pronunciation, ko)")
    .eq("user_id", userId)
    .eq("topic_id", topicId)
    .eq("level", level)
    .maybeSingle();
  const sentences = (((set?.sentences as Sentence[] | null) ?? []) as Sentence[]).sort(
    (a, b) => a.position - b.position,
  );
  const statuses: Record<string, SentenceStatus> = {};
  if (sentences.length) {
    const { data: prog } = await supabase
      .from("sentence_progress")
      .select("sentence_id, status")
      .eq("user_id", userId)
      .in(
        "sentence_id",
        sentences.map((s) => s.id),
      );
    for (const s of sentences) statuses[s.id] = "todo";
    for (const p of prog ?? []) statuses[p.sentence_id as string] = p.status as SentenceStatus;
  }
  return { sentences, statuses };
}
