import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, myStreak } from "@/lib/data";
import { describeClaudeError } from "@/lib/claude";
import { lessonReport } from "@/lib/call/claude";
import {
  LEVEL_DOWN_SCORE,
  LEVEL_UP_COUNT,
  LEVEL_UP_SCORE,
  MIN_TURNS_FOR_REPORT,
  STREAK_MILESTONES,
} from "@/lib/call/levels";
import { closeLesson, fail, loadLesson, type LoadedLesson } from "@/lib/call/server";
import type { EndResponse } from "@/lib/call/types";

export const maxDuration = 60;

const Body = z.object({
  lessonId: z.string().uuid(),
  /** 화면에서 센 대답 수. 마지막 턴 저장이 아직 끝나지 않았으면 잠깐 기다린다. */
  expectedTurns: z.number().int().min(0).max(20).default(0),
  /** 홈의 "그만두기": 리포트 없이 중도 종료로 닫는다 */
  abandon: z.boolean().default(false),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "잘못된 요청이에요.");
  const { supabase, userId } = await currentUser();
  if (!userId) return fail(401, "다시 로그인해 주세요.");

  // 수업 · 프로필 · (수업 전) 연속 학습일을 한꺼번에
  const [loaded, { data: profile }, before] = await Promise.all([
    loadLesson(supabase, parsed.data.lessonId),
    supabase.from("profiles").select("call_level, call_level_since").eq("id", userId).maybeSingle<{ call_level: number; call_level_since: string }>(),
    myStreak(supabase),
  ]);
  let lesson: LoadedLesson | null = loaded;
  for (let i = 0; lesson && lesson.status === "active" && lesson.turns < parsed.data.expectedTurns && i < 4; i++) {
    await sleep(300);
    lesson = await loadLesson(supabase, parsed.data.lessonId);
  }
  if (!lesson || !profile) return fail(404, "수업을 찾을 수 없어요.");
  if (lesson.status !== "active") return fail(409, "이미 끝난 수업이에요.");

  const levelProgress = async () => {
    const [{ count }, { data: last3 }] = await Promise.all([
      supabase
        .from("lessons")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("level", profile.call_level)
        .eq("status", "done")
        .gte("score", LEVEL_UP_SCORE)
        .gte("started_at", profile.call_level_since),
      supabase
        .from("lessons")
        .select("score")
        .eq("user_id", userId)
        .eq("level", profile.call_level)
        .eq("status", "done")
        .gte("started_at", profile.call_level_since)
        .order("started_at", { ascending: false })
        .limit(3),
    ]);
    const good = Math.min(count ?? 0, LEVEL_UP_COUNT);
    const down =
      profile.call_level > 1 &&
      (last3 ?? []).length === 3 &&
      (last3 ?? []).every((l) => (l.score as number) < LEVEL_DOWN_SCORE);
    const suggest: EndResponse["suggest"] =
      good >= LEVEL_UP_COUNT && profile.call_level < 8 ? "up" : down ? "down" : null;
    return { progress: { level: profile.call_level, good, needed: LEVEL_UP_COUNT }, suggest };
  };

  // 대답이 너무 적거나 그만두면 리포트 없이 끝낸다 (학습일로도 치지 않는다). 대답이 0번이면 연습 횟수를 돌려준다
  if (parsed.data.abandon || lesson.turns < MIN_TURNS_FOR_REPORT) {
    const [closed, lp] = await Promise.all([closeLesson(supabase, lesson), levelProgress()]);
    if (!closed) return fail(409, "이미 끝난 수업이에요.");
    const body: EndResponse = {
      report: null,
      streak: before.streak,
      milestone: null,
      levelProgress: lp.progress,
      suggest: null,
      refunded: closed.refunded,
    };
    return NextResponse.json(body);
  }

  let report;
  try {
    report = await lessonReport({ level: lesson.level, topicTitle: lesson.topicTitle, plan: lesson.plan, history: lesson.history });
  } catch (e) {
    console.error("report failed", e);
    const { status, message } = describeClaudeError(e);
    return fail(status, `리포트를 만들지 못했어요. 다시 눌러 주세요. ${message}`);
  }

  // 저장 3가지를 동시에: 수업 결과, 표현장, 오늘 학습 기록
  await Promise.all([
    supabase
      .from("lessons")
      .update({ status: "done", score: report.score, report, ended_at: new Date().toISOString() })
      .eq("id", lesson.id),
    report.expressions.length
      ? supabase.from("expressions").upsert(
          report.expressions.map((e) => ({ user_id: userId, lesson_id: lesson.id, en: e.en.trim(), ko: e.ko, example: e.example })),
          { onConflict: "user_id,en", ignoreDuplicates: true },
        )
      : Promise.resolve(),
    supabase.rpc("bump_activity", { p_lessons: 1 }),
  ]);

  // 저장 뒤의 연속 학습일과 레벨 진행을 동시에
  const [after, lp] = await Promise.all([myStreak(supabase), levelProgress()]);
  const milestone =
    !before.studiedToday && after.streak > before.streak && STREAK_MILESTONES.includes(after.streak) ? after.streak : null;

  const body: EndResponse = { report, streak: after.streak, milestone, levelProgress: lp.progress, suggest: lp.suggest, refunded: false };
  return NextResponse.json(body);
}
