import "server-only";
import { NextResponse } from "next/server";
import type { DB } from "../data";
import type { Admin } from "../supabase/admin";
import { one } from "../types";
import type { ActiveLessonRow } from "./rules";

export { isResumable, splitActive, type ActiveLessonRow } from "./rules";
import type { ChatMessage, LessonPlan } from "./types";

export function fail(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

export interface LoadedLesson {
  id: string;
  status: "active" | "done" | "left";
  level: number;
  turns: number;
  hints: number;
  sos: number;
  startedAt: string;
  lastActiveAt: string;
  topicId: string;
  topicTitle: string;
  topicTitleKo: string;
  plan: LessonPlan;
  history: ChatMessage[];
}

export class LessonHistoryError extends Error {}

/** 수업 + 계획 + 주제 + 대화 기록을 한 번에 (동시에 두 쿼리). 기록을 못 읽으면 LessonHistoryError */
export async function loadLesson(supabase: DB, lessonId: string): Promise<LoadedLesson | null> {
  const [{ data: lesson }, { data: messages, error: messagesError }] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, status, level, turns, hints, sos, started_at, last_active_at, topic_id, lesson_plans(plan), call_topics(title_en, title_ko)")
      .eq("id", lessonId)
      .maybeSingle(),
    supabase
      .from("lesson_messages")
      .select("role, text, ko, correction, counted")
      .eq("lesson_id", lessonId)
      .order("id"),
  ]);
  if (!lesson) return null;
  // 기록을 못 읽었는데 빈 대화로 넘기면 선생님이 처음부터 다시 묻는다 (같은 질문 되풀이). 오류로 알린다
  if (messagesError) throw new LessonHistoryError(messagesError.message);
  const plan = one<{ plan: LessonPlan }>(lesson.lesson_plans)?.plan;
  const topic = one<{ title_en: string; title_ko: string }>(lesson.call_topics);
  const topicTitle = topic?.title_en ?? "";
  if (!plan) return null;
  return {
    id: lesson.id as string,
    status: lesson.status as LoadedLesson["status"],
    level: lesson.level as number,
    turns: lesson.turns as number,
    hints: lesson.hints as number,
    sos: (lesson.sos as number) ?? 0,
    startedAt: lesson.started_at as string,
    lastActiveAt: (lesson.last_active_at as string) ?? (lesson.started_at as string),
    topicId: lesson.topic_id as string,
    topicTitle,
    topicTitleKo: topic?.title_ko ?? "",
    plan,
    history: (messages ?? []) as ChatMessage[],
  };
}

/**
 * 응답을 보낸 뒤(after) 하는 저장용. Supabase 는 실패해도 throw 하지 않으므로 error 를 직접 확인하고,
 * 한 번 다시 시도한 뒤에도 실패하면 로그를 남긴다. 성공 여부를 돌려준다.
 */
export async function saveOrLog(label: string, run: () => PromiseLike<{ error: unknown }>): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { error } = await run();
      if (!error) return true;
      console.error(`[call] ${label} failed (attempt ${attempt})`, error);
    } catch (e) {
      console.error(`[call] ${label} threw (attempt ${attempt})`, e);
    }
  }
  return false;
}

// ───── 끊긴 통화 · 중도 종료 ─────

/**
 * 진행 중인 수업을 중도 종료(left)로 닫는다. 대답을 한 번도 안 했으면 연습 횟수를 돌려준다.
 * 환불 조건(내 수업 · 중도 종료 · 센 대답 없음 · 오늘 차감 · 한 번만)은 DB 함수 refund_lesson 이 다시 확인한다.
 * 이미 닫힌 수업이면(동시에 두 번 불려도) 아무것도 하지 않고 null.
 */
export async function closeLesson(
  supabase: DB,
  admin: Admin,
  lesson: { id: string; turns: number },
): Promise<{ refunded: boolean } | null> {
  // 상태는 서버 연결로 바꾸고, 환불은 사용자 연결로 (영수증 함수가 auth.uid() 로 내 것인지 확인한다)
  const { data: closed, error } = await admin
    .from("lessons")
    .update({ status: "left", ended_at: new Date().toISOString() })
    .eq("id", lesson.id)
    .eq("status", "active")
    .select("id");
  if (error) {
    console.error(`[call] close lesson ${lesson.id} failed`, error);
    return null;
  }
  if (!closed?.length) return null;
  if (lesson.turns > 0) return { refunded: false };
  const { data, error: refundError } = await supabase.rpc("refund_lesson", { p_lesson: lesson.id });
  if (refundError) console.error(`[call] refund lesson ${lesson.id} failed`, refundError);
  return { refunded: data === true };
}

/** 사용자 연결로 읽은 "내" 진행 중 수업 중 닫을 것을 닫는다 */
export function closeStale(supabase: DB, admin: Admin, stale: ActiveLessonRow[]) {
  return Promise.all(stale.map((r) => closeLesson(supabase, admin, { id: r.id, turns: r.turns })));
}
