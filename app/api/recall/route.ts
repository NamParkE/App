import { after, NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/data";
import { adminClient } from "@/lib/supabase/admin";
import { compareSentences } from "@/lib/diff";
import type { RecallResponse } from "@/lib/recall";
import { MEMORIZED_SCORE } from "@/lib/types";

/**
 * 외운 문장 복습 한 문장 채점 (오픽 준비 고도화 ②). 단어 비교만 하고 AI 는 부르지 않는다 (사용량 차감 없음).
 * - 90점 이상이면 기억함 → 다음 간격으로, 아니면(또는 "모르겠어요") 외움 표시를 푼다. 일정은 DB 함수 record_recall 이 정한다.
 * - retry: 못 기억한 문장을 같은 자리에서 한 번 더 말해 보기. 점수만 보여 주고 진도는 바꾸지 않는다.
 */
const Body = z.object({
  sentenceId: z.string().uuid(),
  said: z.string().trim().max(500).default(""),
  gaveUp: z.boolean().default(false),
  retry: z.boolean().default(false),
});

function fail(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "잘못된 요청이에요.");
  const { sentenceId, said, gaveUp, retry } = parsed.data;
  if (!gaveUp && !said) return fail(400, "말한 문장이 없어요.");

  const { supabase, userId } = await currentUser();
  if (!userId) return fail(401, "다시 로그인해 주세요.");

  // RLS 덕분에 내 문장만 조회된다
  const { data: sentence } = await supabase.from("sentences").select("id, en").eq("id", sentenceId).maybeSingle<{ id: string; en: string }>();
  if (!sentence) return fail(404, "문장을 찾을 수 없어요.");

  const diff = gaveUp ? null : compareSentences(sentence.en, said);
  const score = diff?.score ?? 0;
  const passed = !gaveUp && score >= MEMORIZED_SCORE;

  if (retry) {
    const body: RecallResponse = { diff, score, passed, saved: null };
    return NextResponse.json(body);
  }

  const { data, error } = await supabase.rpc("record_recall", { p_sentence_id: sentence.id, p_passed: passed });
  if (error) {
    if (error.code === "P0002") return fail(409, "이미 복습한 문장이에요. 다음 문장으로 넘어가요.");
    console.error("[recall] save failed", error);
    return fail(500, "결과를 저장하지 못했어요. 다시 말해 보세요.");
  }
  const row = (data as { status: "memorized" | "practicing"; recall_step: number; next_recall_on: string | null }[] | null)?.[0];

  after(async () => {
    // 복습도 연속 학습일에 들어간다 (학습 점수는 서버 연결로만 올린다)
    const admin = adminClient();
    if (!admin) return;
    const { error: e } = await admin.rpc("bump_activity_for", { p_uid: userId, p_reviews: 1 });
    if (e) console.error("[recall] activity failed", e);
  });

  const body: RecallResponse = {
    diff,
    score,
    passed,
    saved: row ? { status: row.status, step: row.recall_step, nextRecallOn: row.next_recall_on } : null,
  };
  return NextResponse.json(body);
}
