import { after, NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/data";
import { describeClaudeError } from "@/lib/claude";
import { tutorTurn } from "@/lib/call/claude";
import { LESSON_TURNS } from "@/lib/call/levels";
import { fail, loadLesson } from "@/lib/call/server";
import type { TurnResponse } from "@/lib/call/types";

export const maxDuration = 60;

const Body = z.object({
  lessonId: z.string().uuid(),
  said: z.string().trim().min(1).max(600),
  /** 어린이 모드(영상통화 화면): 더 짧고 쉬운 말로 */
  kids: z.boolean().default(false),
});

/** 통화 한 턴: 기록을 읽고(동시에 2쿼리) → 선생님 대답(AI 1회) → 응답을 먼저 보내고 저장은 뒤에서 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "잘못된 요청이에요.");
  const { supabase, userId } = await currentUser();
  if (!userId) return fail(401, "다시 로그인해 주세요.");

  const lesson = await loadLesson(supabase, parsed.data.lessonId);
  if (!lesson) return fail(404, "수업을 찾을 수 없어요.");
  if (lesson.status !== "active" || lesson.turns >= LESSON_TURNS) return fail(409, "이미 끝난 수업이에요.");

  const turnNumber = lesson.turns + 1;
  let out;
  try {
    out = await tutorTurn({
      level: lesson.level,
      topicTitle: lesson.topicTitle,
      plan: lesson.plan,
      history: lesson.history,
      said: parsed.data.said,
      turnNumber,
      kids: parsed.data.kids,
    });
  } catch (e) {
    console.error("turn failed", e);
    const { status, message } = describeClaudeError(e);
    return fail(status, `선생님 대답을 받지 못했어요. ${message}`);
  }

  after(async () => {
    await Promise.all([
      supabase.from("lesson_messages").insert([
        { lesson_id: lesson.id, user_id: userId, role: "user", text: parsed.data.said },
        { lesson_id: lesson.id, user_id: userId, role: "tutor", text: out.reply, ko: out.ko, correction: out.correction },
      ]),
      supabase.from("lessons").update({ turns: turnNumber }).eq("id", lesson.id),
    ]);
  });

  const body: TurnResponse = {
    reply: { role: "tutor", text: out.reply, ko: out.ko, correction: out.correction, emotion: out.emotion },
    turns: turnNumber,
    done: turnNumber >= LESSON_TURNS,
  };
  return NextResponse.json(body);
}
