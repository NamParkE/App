import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/data";
import { SCRIPT_MAX_SENTENCES, SENTENCE_MAX_CHARS } from "@/lib/script";

// 내 스크립트 저장: 확인 화면에서 고른 최종 문장을 주제의 "내 스크립트"로 저장한다. AI 없음, 차감 없음.
// 이미 있던 내 스크립트는 보관하고 새것으로 바꾼다: 진도는 새 문장부터 다시, 과거 시도 기록은 보관된 문장에 남는다.
// AI 답변은 건드리지 않는다.

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

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!profile) return fail(403, "가족 초대 코드로 먼저 가입해 주세요.");

  // 교체는 DB 함수 하나(= 한 트랜잭션, 0010_script_replace_tx.sql)로 한다.
  // 예전 스크립트는 지우지 않고 보관해서 시도 기록이 남고, 중간에 실패하면 전부 되돌아가 예전 스크립트가 그대로 남는다.
  const { error } = await supabase.rpc("replace_my_script", { p_topic: topicId, p_sentences: sentences });
  if (error) {
    if (error.code === "P0002") return fail(404, "주제를 찾을 수 없어요.");
    if (error.code === "22023" || error.code === "23502") return fail(400, "저장할 문장이 올바르지 않아요.");
    if (error.code === "23505") return fail(409, "저장하지 못했어요. 다시 한 번 눌러 주세요.");
    console.error("[script] replace failed", error);
    return fail(500, "저장하지 못했어요. 지금 스크립트는 그대로 있어요. 잠시 후 다시 시도해 주세요.");
  }
  return NextResponse.json({ ok: true });
}
