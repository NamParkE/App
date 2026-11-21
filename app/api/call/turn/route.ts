import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/data";
import { describeClaudeError } from "@/lib/claude";
import { tutorTurn } from "@/lib/call/claude";
import { LESSON_TURNS, MAX_SKIPS } from "@/lib/call/levels";
import { fail, LessonHistoryError, loadLesson, saveOrLog } from "@/lib/call/server";
import { repeatsLastTutor, trailingSkips, turnRows, withOpening } from "@/lib/call/rules";
import { adminClient, MISSING_SERVICE_KEY } from "@/lib/supabase/admin";
import type { TurnResponse } from "@/lib/call/types";

export const maxDuration = 60;

const Body = z.object({
  lessonId: z.string().uuid(),
  said: z.string().trim().min(1).max(600),
  /** 어린이 모드(영상통화 화면): 더 짧고 쉬운 말로 */
  kids: z.boolean().default(false),
});

/**
 * 통화 한 턴: 기록을 읽고(동시에 2쿼리) → 선생님 대답(AI 1회) → 대화를 저장한 뒤 응답.
 * 저장을 응답 뒤로 미루면, 저장이 늦거나 실패했을 때 다음 턴의 선생님이 직전 대화를 몰라 같은 질문을 되풀이했다.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "잘못된 요청이에요.");
  const { supabase, userId } = await currentUser();
  if (!userId) return fail(401, "다시 로그인해 주세요.");
  const admin = adminClient();
  if (!admin) return fail(500, MISSING_SERVICE_KEY);

  let lesson;
  try {
    lesson = await loadLesson(supabase, parsed.data.lessonId);
  } catch (e) {
    if (!(e instanceof LessonHistoryError)) throw e;
    console.error("[call] turn history failed", e);
    return fail(503, "대화 기록을 불러오지 못했어요. 잠시 후 다시 말해 주세요.");
  }
  if (!lesson) return fail(404, "수업을 찾을 수 없어요.");
  if (lesson.status !== "active" || lesson.turns >= LESSON_TURNS) return fail(409, "이미 끝난 수업이에요.");

  const turnNumber = lesson.turns + 1;
  const isLast = turnNumber >= LESSON_TURNS;
  // 마지막 대답이거나 이미 여러 번 다시 물었으면, 이번 대답은 무엇이든 센다
  const mustCount = isLast || trailingSkips(lesson.history) >= MAX_SKIPS;
  const args = {
    userId,
    level: lesson.level,
    topicTitle: lesson.topicTitle,
    plan: lesson.plan,
    history: lesson.history,
    said: parsed.data.said,
    turnNumber,
    mustCount,
    kids: parsed.data.kids,
  };
  let out;
  try {
    out = await tutorTurn(args);
    // 바로 앞 말을 그대로 되풀이했으면 한 번만 다시 만든다 (엉뚱한 대답에 다시 묻는 경우는 말을 바꿔 묻게 되어 있다)
    if (repeatsLastTutor(withOpening(lesson.history, lesson.plan.opening), out.reply)) {
      console.warn(`[call] repeated tutor line (lesson ${lesson.id}, turn ${turnNumber}); retrying once`);
      out = await tutorTurn({ ...args, avoid: out.reply });
    }
  } catch (e) {
    console.error("turn failed", e);
    const { status, message } = describeClaudeError(e);
    return fail(status, `선생님 대답을 받지 못했어요. ${message}`);
  }
  const counted = out.onTask || mustCount;
  const turns = counted ? turnNumber : lesson.turns;

  // 대화를 먼저 저장하고(응답 전에 기다린다), 성공했을 때만 턴 수를 올린다.
  // 기록 없이 응답하면 다음 턴에서 선생님이 앞 대화를 모르게 된다.
  const saved = await saveOrLog(`turn ${turnNumber} messages (lesson ${lesson.id})`, () =>
    // 두 줄의 칸을 똑같이 채운다 (turnRows 참고: 칸이 다르면 NOT NULL 에 걸려 저장이 매번 실패했다)
    admin
      .from("lesson_messages")
      .insert(turnRows({ lesson_id: lesson.id, user_id: userId }, parsed.data.said, counted, { text: out.reply, ko: out.ko, correction: out.correction }), {
        defaultToNull: false,
      }),
  );
  if (!saved) return fail(503, "대화를 저장하지 못했어요. 다시 말해 주세요.");
  // 턴 수 저장이 실패해도 대화는 저장됐으므로 응답한다 (다시 보내게 하면 같은 대답이 두 번 쌓인다)
  await saveOrLog(`turn ${turnNumber} count (lesson ${lesson.id})`, () =>
    admin.from("lessons").update({ turns, last_active_at: new Date().toISOString() }).eq("id", lesson.id).eq("user_id", userId),
  );

  const body: TurnResponse = {
    reply: { role: "tutor", text: out.reply, ko: out.ko, correction: out.correction, emotion: out.emotion },
    turns,
    done: counted && isLast,
    counted,
  };
  return NextResponse.json(body);
}
