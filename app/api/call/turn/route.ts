import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/data";
import { describeClaudeError } from "@/lib/claude";
import { tutorTurn, type TurnOut } from "@/lib/call/claude";
import { LESSON_TURNS, MAX_PRACTICE_REPEATS, MAX_SKIPS } from "@/lib/call/levels";
import { fail, LessonHistoryError, loadLesson, saveOrLog } from "@/lib/call/server";
import {
  practiceRepeats,
  repeatsLastTutor,
  shapeTurn,
  shownHelp,
  stageOf,
  trailingSkips,
  turnRows,
  withOpening,
} from "@/lib/call/rules";
import { adminClient, MISSING_SERVICE_KEY } from "@/lib/supabase/admin";
import type { PendingHelp, TurnResponse } from "@/lib/call/types";

export const maxDuration = 60;

const Body = z.object({
  lessonId: z.string().uuid(),
  said: z.string().trim().min(1).max(600),
  /** 어린이 모드(영상통화 화면): 더 짧고 쉬운 말로 */
  kids: z.boolean().default(false),
  /** 학생이 말하기 전에 화면이 보여 준 도움 말 단계 (말이 없어서 리피가 먼저 건 말, 0~2) */
  helpShown: z.number().int().min(0).max(2).default(0),
});

/**
 * 통화 한 턴: 기록을 읽고(동시에 2쿼리) → 선생님 대답(AI 1회) → 대화를 저장한 뒤 응답.
 * 대답과 함께 "말이 없을 때 리피가 먼저 할 말"과 따라 말하기 카드를 미리 만들어 lessons.pending_help 에 둔다
 * (화면이 보낸 글을 기록에 넣지 않고, 서버가 저장해 둔 것만 쓴다).
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
  // 말이 없어서 리피가 먼저 건 도움 말도 기록과 프롬프트에 넣는다 (리피가 자기가 한 말을 알도록)
  const helpLines = shownHelp(lesson.pendingHelp?.help, parsed.data.helpShown);
  const history = [...lesson.history, ...helpLines.map((h) => ({ role: "tutor" as const, text: h.text, ko: h.ko, kind: "help" as const }))];
  const stage = stageOf(turnNumber);
  const practiceAllowed = stage === "topic" && turnNumber < LESSON_TURNS - 2 && practiceRepeats(lesson.history) < MAX_PRACTICE_REPEATS;
  const args = {
    userId,
    level: lesson.level,
    topicTitle: lesson.topicTitle,
    plan: lesson.plan,
    history,
    said: parsed.data.said,
    turnNumber,
    mustCount,
    kids: parsed.data.kids,
    practiceAllowed: practiceAllowed && !parsed.data.kids,
    stageSentence: lesson.pendingHelp?.repeat?.mode === "stage" ? lesson.pendingHelp.repeat.sentence : null,
  };
  let out: TurnOut;
  try {
    out = await tutorTurn(args);
    // 바로 앞 말을 그대로 되풀이했으면 한 번만 다시 만든다 (엉뚱한 대답에 다시 묻는 경우는 말을 바꿔 묻게 되어 있다)
    if (repeatsLastTutor(withOpening(history, lesson.plan.opening), out.reply)) {
      console.warn(`[call] repeated tutor line (lesson ${lesson.id}, turn ${turnNumber}); retrying once`);
      out = await tutorTurn({ ...args, avoid: out.reply });
    }
  } catch (e) {
    console.error("turn failed", e);
    const { status, message } = describeClaudeError(e);
    return fail(status, `선생님 대답을 받지 못했어요. ${message}`);
  }
  // 막혔거나("I don't know", 한국어) 엉뚱한 대답은 세지 않고 도와준다 (같은 질문이 MAX_SKIPS 번 넘게 이어지면 센다)
  const counted = (out.onTask && !out.stuck) || mustCount;
  const turns = counted ? turnNumber : lesson.turns;
  const shaped = shapeTurn(out, {
    isLast: counted && isLast,
    counted,
    stageSetup: turnNumber === LESSON_TURNS - 2,
    practiceAllowed: args.practiceAllowed,
    kids: parsed.data.kids,
  });

  // 따라 말하기 카드를 없애며 다음 질문을 대답에 붙였으면 한국어 뜻도 붙인다
  const ko = shaped.reply !== out.reply.trim() && out.repeat?.next_ko ? `${out.ko} ${out.repeat.next_ko}` : out.ko;

  // 대화를 먼저 저장하고(응답 전에 기다린다), 성공했을 때만 턴 수를 올린다.
  // 기록 없이 응답하면 다음 턴에서 선생님이 앞 대화를 모르게 된다. 두 줄의 칸은 같게 (turnRows 참고)
  const saved = await saveOrLog(`turn ${turnNumber} messages (lesson ${lesson.id})`, () =>
    admin
      .from("lesson_messages")
      .insert(
        turnRows({ lesson_id: lesson.id, user_id: userId }, parsed.data.said, counted, { text: shaped.reply, ko, correction: out.correction }, helpLines),
        { defaultToNull: false },
      ),
  );
  if (!saved) return fail(503, "대화를 저장하지 못했어요. 다시 말해 주세요.");
  const pending: PendingHelp = { help: shaped.help, repeat: shaped.repeat };
  // 턴 수 저장이 실패해도 대화는 저장됐으므로 응답한다 (다시 보내게 하면 같은 대답이 두 번 쌓인다)
  await saveOrLog(`turn ${turnNumber} count (lesson ${lesson.id})`, () =>
    admin
      .from("lessons")
      .update({ turns, last_active_at: new Date().toISOString(), pending_help: pending })
      .eq("id", lesson.id)
      .eq("user_id", userId),
  );

  const done = counted && isLast;
  const body: TurnResponse = {
    reply: {
      role: "tutor",
      text: shaped.reply,
      ko,
      correction: out.correction,
      emotion: out.emotion,
      choices: shaped.choices,
      starter: shaped.starter,
    },
    turns,
    done,
    counted,
    stage: stageOf(Math.min(turns + 1, LESSON_TURNS)),
    help: shaped.help,
    repeat: shaped.repeat,
    best: shaped.best,
  };
  return NextResponse.json(body);
}
