import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/data";
import { compareSentences } from "@/lib/diff";
import { fail, LessonHistoryError, loadLesson, saveOrLog } from "@/lib/call/server";
import { turnRows } from "@/lib/call/rules";
import { adminClient, MISSING_SERVICE_KEY } from "@/lib/supabase/admin";
import type { RepeatResponse } from "@/lib/call/types";

/** 따라 말하기 연습에서 이 점수 이상이면 "성공" */
const REPEAT_PASS = 70;

const Body = z.object({
  lessonId: z.string().uuid(),
  said: z.string().trim().max(600).default(""),
  /** "건너뛰기": 따라 말하지 않고 다음 질문으로 */
  skip: z.boolean().default(false),
});

/**
 * 따라 말하기 연습 (주제 대화 중, 대답 수에 넣지 않음). AI 를 부르지 않는다:
 * 서버에 저장해 둔 문장과 단어 비교만 하고, 리피의 칭찬 · 다음 질문도 지난 대답 때 미리 만든 것을 쓴다.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "잘못된 요청이에요.");
  const { skip, said } = parsed.data;
  if (!skip && !said) return fail(400, "잘 들리지 않았어요. 다시 말해 보세요.");
  const { supabase, userId } = await currentUser();
  if (!userId) return fail(401, "다시 로그인해 주세요.");
  const admin = adminClient();
  if (!admin) return fail(500, MISSING_SERVICE_KEY);

  let lesson;
  try {
    lesson = await loadLesson(supabase, parsed.data.lessonId);
  } catch (e) {
    if (!(e instanceof LessonHistoryError)) throw e;
    return fail(503, "대화 기록을 불러오지 못했어요. 잠시 후 다시 해 주세요.");
  }
  if (!lesson || lesson.status !== "active") return fail(404, "수업을 찾을 수 없어요.");
  const card = lesson.pendingHelp?.repeat;
  if (!card || card.mode !== "practice" || !card.next) return fail(409, "따라 말할 문장이 없어요. 계속 대화해요.");

  const score = skip ? 0 : compareSentences(card.sentence, said).score;
  const passed = !skip && score >= REPEAT_PASS;
  const text = skip ? card.next : `${passed ? card.praise : "Nice try!"} ${card.next}`;
  const ko = card.next_ko ?? null;

  const base = { lesson_id: lesson.id, user_id: userId };
  const rows = skip
    ? turnRows(base, "", false, { text, ko, correction: null }).slice(-1)
    : turnRows(base, said, false, { text, ko, correction: null }, [], "repeat");
  const saved = await saveOrLog(`repeat (lesson ${lesson.id})`, () =>
    admin.from("lesson_messages").insert(rows, { defaultToNull: false }),
  );
  if (!saved) return fail(503, "대화를 저장하지 못했어요. 다시 해 주세요.");
  // 카드는 한 번만 쓴다. 말이 없을 때의 도움 말(다음 질문용)은 그대로 둔다
  await saveOrLog(`repeat clear (lesson ${lesson.id})`, () =>
    admin
      .from("lessons")
      .update({ pending_help: { help: lesson.pendingHelp?.help ?? null, repeat: null }, last_active_at: new Date().toISOString() })
      .eq("id", lesson.id)
      .eq("user_id", userId),
  );

  const body: RepeatResponse = {
    score,
    passed,
    skipped: skip,
    reply: { role: "tutor", text, ko, emotion: passed ? "proud" : "happy" },
  };
  return NextResponse.json(body);
}
