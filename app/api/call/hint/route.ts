import { after, NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/data";
import { describeClaudeError } from "@/lib/claude";
import { hintAnswers } from "@/lib/call/claude";
import { MAX_HINTS } from "@/lib/call/levels";
import { fail, loadLesson } from "@/lib/call/server";
import type { HintResponse } from "@/lib/call/types";

export const maxDuration = 60;

const Body = z.object({ lessonId: z.string().uuid() });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "잘못된 요청이에요.");
  const { supabase, userId } = await currentUser();
  if (!userId) return fail(401, "다시 로그인해 주세요.");

  const lesson = await loadLesson(supabase, parsed.data.lessonId);
  if (!lesson || lesson.status !== "active") return fail(404, "진행 중인 수업이 아니에요.");
  if (lesson.hints >= MAX_HINTS) return fail(429, `힌트는 수업마다 ${MAX_HINTS}번까지예요.`);

  const lastTutor = [...lesson.history].reverse().find((m) => m.role === "tutor")?.text ?? lesson.plan.opening;
  try {
    const answers = await hintAnswers({ level: lesson.level, lastTutorLine: lastTutor, topicTitle: lesson.topicTitle });
    after(async () => {
      await supabase.from("lessons").update({ hints: lesson.hints + 1 }).eq("id", lesson.id);
    });
    const body: HintResponse = { answers, hintsLeft: MAX_HINTS - lesson.hints - 1 };
    return NextResponse.json(body);
  } catch (e) {
    console.error("hint failed", e);
    const { status, message } = describeClaudeError(e);
    return fail(status, `힌트를 받지 못했어요. ${message}`);
  }
}
