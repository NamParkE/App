import "server-only";
import { NextResponse } from "next/server";
import type { DB } from "../data";
import { one } from "../types";
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
  topicId: string;
  topicTitle: string;
  plan: LessonPlan;
  history: ChatMessage[];
}

/** 수업 + 계획 + 주제 + 대화 기록을 한 번에 (동시에 두 쿼리) */
export async function loadLesson(supabase: DB, lessonId: string): Promise<LoadedLesson | null> {
  const [{ data: lesson }, { data: messages }] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, status, level, turns, hints, topic_id, lesson_plans(plan), call_topics(title_en)")
      .eq("id", lessonId)
      .maybeSingle(),
    supabase
      .from("lesson_messages")
      .select("role, text, ko, correction")
      .eq("lesson_id", lessonId)
      .order("id"),
  ]);
  if (!lesson) return null;
  const plan = one<{ plan: LessonPlan }>(lesson.lesson_plans)?.plan;
  const topicTitle = one<{ title_en: string }>(lesson.call_topics)?.title_en ?? "";
  if (!plan) return null;
  return {
    id: lesson.id as string,
    status: lesson.status as LoadedLesson["status"],
    level: lesson.level as number,
    turns: lesson.turns as number,
    hints: lesson.hints as number,
    topicId: lesson.topic_id as string,
    topicTitle,
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
