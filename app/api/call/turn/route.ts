import { after, NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/data";
import { describeClaudeError } from "@/lib/claude";
import { tutorTurn } from "@/lib/call/claude";
import { LESSON_TURNS, MAX_SKIPS } from "@/lib/call/levels";
import { fail, loadLesson, saveOrLog } from "@/lib/call/server";
import { trailingSkips } from "@/lib/call/rules";
import { adminClient, MISSING_SERVICE_KEY } from "@/lib/supabase/admin";
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
  const admin = adminClient();
  if (!admin) return fail(500, MISSING_SERVICE_KEY);

  const lesson = await loadLesson(supabase, parsed.data.lessonId);
  if (!lesson) return fail(404, "수업을 찾을 수 없어요.");
  if (lesson.status !== "active" || lesson.turns >= LESSON_TURNS) return fail(409, "이미 끝난 수업이에요.");

  const turnNumber = lesson.turns + 1;
  const isLast = turnNumber >= LESSON_TURNS;
  // 마지막 대답이거나 이미 여러 번 다시 물었으면, 이번 대답은 무엇이든 센다
  const mustCount = isLast || trailingSkips(lesson.history) >= MAX_SKIPS;
  let out;
  try {
    out = await tutorTurn({
      userId,
      level: lesson.level,
      topicTitle: lesson.topicTitle,
      plan: lesson.plan,
      history: lesson.history,
      said: parsed.data.said,
      turnNumber,
      mustCount,
      kids: parsed.data.kids,
    });
  } catch (e) {
    console.error("turn failed", e);
    const { status, message } = describeClaudeError(e);
    return fail(status, `선생님 대답을 받지 못했어요. ${message}`);
  }
  const counted = out.onTask || mustCount;
  const turns = counted ? turnNumber : lesson.turns;

  // 대화를 먼저 저장하고, 성공했을 때만 턴 수를 올린다.
  // (기록 없이 턴만 올라가면 다음 턴에서 선생님이 앞 대화를 모르게 된다)
  after(async () => {
    const saved = await saveOrLog(`turn ${turnNumber} messages (lesson ${lesson.id})`, () =>
      admin.from("lesson_messages").insert([
        { lesson_id: lesson.id, user_id: userId, role: "user", text: parsed.data.said, counted },
        { lesson_id: lesson.id, user_id: userId, role: "tutor", text: out.reply, ko: out.ko, correction: out.correction },
      ]),
    );
    if (!saved) return;
    await saveOrLog(`turn ${turnNumber} count (lesson ${lesson.id})`, () =>
      admin.from("lessons").update({ turns, last_active_at: new Date().toISOString() }).eq("id", lesson.id).eq("user_id", userId),
    );
  });

  const body: TurnResponse = {
    reply: { role: "tutor", text: out.reply, ko: out.ko, correction: out.correction, emotion: out.emotion },
    turns,
    done: counted && isLast,
    counted,
  };
  return NextResponse.json(body);
}
