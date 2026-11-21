import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/data";
import { SCRIPT_MAX_SENTENCES, SENTENCE_MAX_CHARS } from "@/lib/script";

// 내 스크립트 저장: 확인 화면에서 고른 최종 문장을 주제의 "내 스크립트"로 저장한다. AI 없음, 차감 없음.
// 이미 있던 내 스크립트는 바꾼다 (그 스크립트의 외움 진도는 처음부터). AI 답변은 건드리지 않는다.

const Body = z.object({
  topicId: z.string().min(1).max(64),
  sentences: z
    .array(
      z.object({
        en: z.string().trim().min(1).max(SENTENCE_MAX_CHARS),
        pronunciation: z.string().trim().max(400),
        ko: z.string().trim().max(400),
        edited: z.boolean(),
      }),
    )
    .min(1)
    .max(SCRIPT_MAX_SENTENCES),
});

function fail(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "저장할 문장이 올바르지 않아요.");
  const { topicId, sentences } = parsed.data;

  const { supabase, userId } = await currentUser();
  if (!userId) return fail(401, "다시 로그인해 주세요.");

  const [{ data: profile }, { data: topic }] = await Promise.all([
    supabase.from("profiles").select("id").eq("id", userId).maybeSingle(),
    supabase.from("topics").select("id").eq("id", topicId).maybeSingle(),
  ]);
  if (!profile) return fail(403, "가족 초대 코드로 먼저 가입해 주세요.");
  if (!topic) return fail(404, "주제를 찾을 수 없어요.");

  // 예전 내 스크립트를 지운다 (문장 · 진도 · 시도 기록은 함께 지워진다). RLS 로 내 것만 지워진다.
  const { error: delError } = await supabase.from("answer_sets").delete().eq("user_id", userId).eq("topic_id", topicId).eq("source", "mine");
  if (delError) {
    console.error("[script] delete failed", delError);
    return fail(500, "저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  const { data: set, error: setError } = await supabase
    .from("answer_sets")
    .insert({ user_id: userId, topic_id: topicId, source: "mine", level: null })
    .select("id")
    .single<{ id: string }>();
  if (setError || !set) {
    // 동시에 두 번 눌린 경우 등
    console.error("[script] set insert failed", setError);
    return fail(409, "저장하지 못했어요. 다시 한 번 눌러 주세요.");
  }

  const { error: insError } = await supabase.from("sentences").insert(
    sentences.map((s, i) => ({
      answer_set_id: set.id,
      position: i,
      en: s.en,
      pronunciation: s.pronunciation,
      ko: s.ko,
      edited: s.edited,
    })),
  );
  if (insError) {
    console.error("[script] sentences insert failed", insError);
    await supabase.from("answer_sets").delete().eq("id", set.id);
    return fail(500, "저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  return NextResponse.json({ ok: true });
}
