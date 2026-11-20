import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, usageToday } from "@/lib/data";
import { MAX_HINTS, MAX_SOS, RESUME_MINUTES } from "@/lib/call/levels";
import { closeLesson, fail, isResumable, loadLesson, saveOrLog } from "@/lib/call/server";
import type { ResumeResponse } from "@/lib/call/types";

const Body = z.object({ lessonId: z.string().uuid() });

/** 끊긴 통화 이어하기: 지금까지의 대화를 돌려준다. 사용량은 더 쓰지 않는다. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "잘못된 요청이에요.");
  const { supabase, userId } = await currentUser();
  if (!userId) return fail(401, "다시 로그인해 주세요.");

  const [lesson, { data: profile }, used] = await Promise.all([
    loadLesson(supabase, parsed.data.lessonId),
    supabase.from("profiles").select("daily_limit").eq("id", userId).maybeSingle<{ daily_limit: number }>(),
    usageToday(supabase, userId),
  ]);
  if (!lesson) return fail(404, "수업을 찾을 수 없어요.");
  if (lesson.status !== "active") return fail(409, "이미 끝난 수업이에요.");
  if (!isResumable(lesson.lastActiveAt)) {
    await closeLesson(supabase, lesson);
    return fail(410, `${RESUME_MINUTES}분이 지나 통화가 끝났어요. 새 수업을 시작해 주세요.`);
  }

  await saveOrLog(`resume touch (lesson ${lesson.id})`, () =>
    supabase.from("lessons").update({ last_active_at: new Date().toISOString() }).eq("id", lesson.id),
  );

  // 첫 인사 저장이 빠졌으면 계획의 첫 마디로 채운다
  const history = lesson.history.length
    ? lesson.history
    : [{ role: "tutor" as const, text: lesson.plan.opening, ko: lesson.plan.opening_ko, correction: null }];

  const body: ResumeResponse = {
    lessonId: lesson.id,
    topic: { id: lesson.topicId, title_ko: lesson.topicTitleKo, title_en: lesson.topicTitle },
    level: lesson.level,
    expressions: lesson.plan.expressions,
    opening: { role: "tutor", text: lesson.plan.opening, ko: lesson.plan.opening_ko, correction: null },
    usageLeft: Math.max(0, (profile?.daily_limit ?? 0) - used),
    history,
    turns: lesson.turns,
    hintsLeft: Math.max(0, MAX_HINTS - lesson.hints),
    sosLeft: Math.max(0, MAX_SOS - lesson.sos),
  };
  return NextResponse.json(body);
}
