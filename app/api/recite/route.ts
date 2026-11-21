import { after, NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, fetchProfile } from "@/lib/data";
import { adminClient } from "@/lib/supabase/admin";
import { sentencesFor, topicSets } from "@/lib/progress";
import { scoreRecital, type ReciteResponse } from "@/lib/recite";

/**
 * 답변 전체 이어 말하기 채점 (오픽 준비 고도화 ①). 단어 비교만 하고 AI 는 부르지 않는다 (사용량 차감 없음).
 * 외움 표시는 바꾸지 않는다 (막힌 문장은 다시 연습할 목록으로만 보여 준다).
 */
const Body = z.object({
  topicId: z.string().min(1).max(100),
  source: z.enum(["ai", "mine"]),
  said: z.string().trim().max(6000),
  durationSec: z.number().int().min(0).max(600),
});

function fail(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "잘못된 요청이에요.");
  const { topicId, source, said, durationSec } = parsed.data;

  const { supabase, userId } = await currentUser();
  if (!userId) return fail(401, "다시 로그인해 주세요.");

  const [rawProfile, sets] = await Promise.all([fetchProfile(supabase, userId), topicSets(supabase, userId, topicId)]);
  if (!rawProfile) return fail(401, "다시 로그인해 주세요.");
  const { sentences, setId } = sentencesFor(sets, rawProfile.level, source);
  if (!setId || sentences.length === 0) return fail(404, "이 주제의 답변을 찾을 수 없어요.");

  const result = scoreRecital(sentences, said);

  const { data: prev } = await supabase
    .from("recitations")
    .select("score, duration_sec")
    .eq("user_id", userId)
    .eq("answer_set_id", setId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ score: number; duration_sec: number }>();

  const { error } = await supabase.from("recitations").insert({
    user_id: userId,
    topic_id: topicId,
    answer_set_id: setId,
    score: result.score,
    duration_sec: durationSec,
    sentence_count: Math.min(sentences.length, 40),
    stuck: result.stuck,
    said,
  });
  if (error) console.error("[recite] save failed", error); // 저장이 안 돼도 결과는 보여 준다

  after(async () => {
    const admin = adminClient();
    if (!admin) return;
    const { error: e } = await admin.rpc("bump_activity_for", { p_uid: userId, p_practices: 1 });
    if (e) console.error("[recite] activity failed", e);
  });

  const body: ReciteResponse = {
    ...result,
    durationSec,
    previous: prev ? { score: prev.score, durationSec: prev.duration_sec } : null,
  };
  return NextResponse.json(body);
}
