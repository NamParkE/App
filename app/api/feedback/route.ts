import { after, NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/data";
import { chargeUsage, refundCharge } from "@/lib/usage";
import { adminClient } from "@/lib/supabase/admin";
import { coachAttempt, describeClaudeError } from "@/lib/claude";
import { compareSentences, pairKey } from "@/lib/diff";
import { MEMORIZED_SCORE, one, type FeedbackResponse, type SentenceStatus } from "@/lib/types";

const Body = z.object({
  sentenceId: z.string().uuid(),
  said: z.string().trim().min(1).max(500),
  mode: z.enum(["see", "hide"]),
});

// AI 응답을 기다릴 수 있도록 넉넉히 (Vercel 함수 최대 실행 시간, 초)
export const maxDuration = 60;

function fail(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

function localHeadline(score: number) {
  if (score >= 100) return "완벽해요!";
  if (score >= MEMORIZED_SCORE) return "거의 완벽해요";
  if (score >= 70) return "거의 다 왔어요";
  if (score >= 40) return "조금만 더 연습해요";
  return "천천히 다시 해 봐요";
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "잘못된 요청이에요.");
  const { sentenceId, said, mode } = parsed.data;

  const { supabase, userId } = await currentUser();
  if (!userId) return fail(401, "다시 로그인해 주세요.");

  // 문장과 이전 진도를 한꺼번에 조회. RLS 덕분에 내 문장만 조회된다.
  const [{ data: sentence }, { data: prev }] = await Promise.all([
    supabase.from("sentences").select("id, en, answer_sets(topic_id)").eq("id", sentenceId).maybeSingle(),
    supabase
      .from("sentence_progress")
      .select("status, best_score, attempts")
      .eq("user_id", userId)
      .eq("sentence_id", sentenceId)
      .maybeSingle<{ status: SentenceStatus; best_score: number; attempts: number }>(),
  ]);
  if (!sentence) return fail(404, "문장을 찾을 수 없어요.");
  const topicId = one<{ topic_id: string }>(sentence.answer_sets)?.topic_id;
  if (!topicId) return fail(404, "문장을 찾을 수 없어요.");

  let diff = compareSentences(sentence.en, said);
  let headline = localHeadline(diff.score);
  let tips: string[] = [];
  let coachSkipped: FeedbackResponse["coachSkipped"] = null;
  let usageLeft: number | null = null;
  let coachError: string | null = null;

  if (diff.score === 100) {
    coachSkipped = "perfect"; // 다 맞으면 AI를 부르지 않는다
  } else {
    const charge = await chargeUsage(supabase);
    if (!charge || charge.left < 0) {
      coachSkipped = "limit";
      usageLeft = 0;
    } else {
      const charged = charge.left;
      usageLeft = charged;
      try {
        const coaching = await coachAttempt(sentence.en, said, diff, userId);
        const allowed = new Set(diff.replacements.map(pairKey));
        const acceptable = new Set(
          coaching.acceptable.map((r) => pairKey({ said: r.said.toLowerCase(), model: r.model.toLowerCase() })).filter((k) => allowed.has(k)),
        );
        if (acceptable.size) diff = compareSentences(sentence.en, said, acceptable);
        headline = coaching.headline || localHeadline(diff.score);
        tips = coaching.tips;
      } catch (e) {
        console.error("coach failed", e);
        coachError = describeClaudeError(e).message;
        if (await refundCharge(supabase, charge.ticket)) usageLeft = charged + 1;
        coachSkipped = "error";
        headline = localHeadline(diff.score);
      }
    }
  }

  // 진도 저장: 가리고 말하기에서 기준 점수 이상이면 "외움"
  const status: SentenceStatus =
    prev?.status === "memorized" || (mode === "hide" && diff.score >= MEMORIZED_SCORE) ? "memorized" : "practicing";

  await Promise.all([
    supabase.from("sentence_progress").upsert({
      user_id: userId,
      sentence_id: sentence.id,
      status,
      best_score: Math.max(prev?.best_score ?? 0, diff.score),
      attempts: (prev?.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    }),
    supabase.from("attempts").insert({
      user_id: userId,
      sentence_id: sentence.id,
      topic_id: topicId,
      said,
      score: diff.score,
      mode,
      feedback: { headline, tips, coachSkipped },
    }),
  ]);

  const newlyMemorized = status === "memorized" && prev?.status !== "memorized";
  after(async () => {
    // 학습 점수는 서버 연결로만 올린다 (키가 없으면 점수만 건너뛴다)
    const admin = adminClient();
    if (!admin) return;
    const { error } = await admin.rpc("bump_activity_for", { p_uid: userId, p_practices: 1, p_memorized: newlyMemorized ? 1 : 0 });
    if (error) console.error("[feedback] activity failed", error);
  });

  const body: FeedbackResponse = { diff, headline, tips, coachSkipped, coachError, usageLeft, status };
  return NextResponse.json(body);
}
