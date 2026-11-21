import { after, NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/data";
import { describeClaudeError } from "@/lib/claude";
import { sosAnswer } from "@/lib/call/claude";
import { MAX_SOS } from "@/lib/call/levels";
import { fail, loadLesson, saveOrLog } from "@/lib/call/server";
import { adminClient, MISSING_SERVICE_KEY } from "@/lib/supabase/admin";
import type { SosResponse } from "@/lib/call/types";

export const maxDuration = 60;

const Body = z.object({ lessonId: z.string().uuid(), said: z.string().trim().min(1).max(300) });

/** 한국어로 묻기: 학생이 한국어로 말한 것을 지금 영어로 어떻게 말하면 되는지 알려 준다. 대답 수에는 넣지 않는다. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "잘못된 요청이에요.");
  const { supabase, userId } = await currentUser();
  if (!userId) return fail(401, "다시 로그인해 주세요.");
  const admin = adminClient();
  if (!admin) return fail(500, MISSING_SERVICE_KEY);

  const lesson = await loadLesson(supabase, parsed.data.lessonId);
  if (!lesson || lesson.status !== "active") return fail(404, "진행 중인 수업이 아니에요.");
  if (lesson.sos >= MAX_SOS) return fail(429, `한국어로 묻기는 수업마다 ${MAX_SOS}번까지예요.`);

  const lastTutor = [...lesson.history].reverse().find((m) => m.role === "tutor")?.text ?? lesson.plan.opening;
  try {
    const answer = await sosAnswer({ userId, level: lesson.level, lastTutorLine: lastTutor, topicTitle: lesson.topicTitle, said: parsed.data.said });
    after(async () => {
      await saveOrLog(`sos count (lesson ${lesson.id})`, () =>
        admin.from("lessons").update({ sos: lesson.sos + 1, last_active_at: new Date().toISOString() }).eq("id", lesson.id).eq("user_id", userId),
      );
    });
    const body: SosResponse = { answer, sosLeft: MAX_SOS - lesson.sos - 1 };
    return NextResponse.json(body);
  } catch (e) {
    console.error("sos failed", e);
    const { status, message } = describeClaudeError(e);
    return fail(status, `알려 드리지 못했어요. ${message}`);
  }
}
