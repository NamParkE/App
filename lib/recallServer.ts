import "server-only";
import { todayKst, type DB } from "./data";
import type { DueRow } from "./recall";

/**
 * 오늘까지 복습할 외운 문장 (아직 등급 · 보관 여부로 거르지 않은 것). pickDue 로 거른다.
 * 등급을 몰라도 되므로 프로필 조회와 동시에 보낼 수 있다.
 */
export async function dueRecallRows(supabase: DB, userId: string) {
  const { data } = await supabase
    .from("sentence_progress")
    .select("sentence_id, recall_step, next_recall_on, sentences(id, en, ko, position, answer_sets(topic_id, source, level, archived_at))")
    .eq("user_id", userId)
    .eq("status", "memorized")
    .lte("next_recall_on", todayKst())
    .order("next_recall_on")
    .limit(300)
    .returns<DueRow[]>();
  return data ?? [];
}
