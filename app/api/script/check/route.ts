import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/data";
import { chargeUsage, refundCharge } from "@/lib/usage";
import { checkScript, describeClaudeError } from "@/lib/claude";
import { SCRIPT_MAX_CHARS, scriptProblem, splitSentences, type CheckResponse, type CheckedSentence } from "@/lib/script";
import type { Topic } from "@/lib/types";

// 내 스크립트 확인: 문장으로 나누고, 문장마다 판정 · 수정안 · 발음 · 번역을 받는다. 저장은 하지 않는다 (/api/script/save).
// 사용량 1회 차감, AI 가 실패하면 돌려준다.

const Body = z.object({
  topicId: z.string().min(1).max(64),
  text: z.string().max(SCRIPT_MAX_CHARS + 500),
});

export const maxDuration = 60;

function fail(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

const clip = (s: string | null | undefined, n: number) => (s ?? "").trim().slice(0, n);

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "잘못된 요청이에요.");
  const problem = scriptProblem(parsed.data.text);
  if (problem) return fail(400, problem);
  const sentences = splitSentences(parsed.data.text);

  const { supabase, userId } = await currentUser();
  if (!userId) return fail(401, "다시 로그인해 주세요.");

  const [{ data: profile }, { data: topic }] = await Promise.all([
    supabase.from("profiles").select("id").eq("id", userId).maybeSingle(),
    supabase.from("topics").select("*").eq("id", parsed.data.topicId).maybeSingle<Topic>(),
  ]);
  if (!profile) return fail(403, "가족 초대 코드로 먼저 가입해 주세요.");
  if (!topic) return fail(404, "주제를 찾을 수 없어요.");

  const charge = await chargeUsage(supabase);
  if (!charge) return fail(500, "사용량을 확인하지 못했어요.");
  if (charge.left < 0) return fail(429, "오늘 연습 횟수를 다 썼어요. 내일 다시 만나요!");

  let items;
  try {
    items = await checkScript(topic, sentences, userId);
  } catch (e) {
    await refundCharge(supabase, charge.ticket);
    console.error("script check failed", e);
    const { status, message } = describeClaudeError(e);
    return fail(status, `문장을 확인하지 못했어요. ${message}`);
  }

  // 원래 문장은 AI 가 아니라 우리가 나눈 것을 쓴다. 수정안이 없거나 같으면 "괜찮음"으로 본다.
  const out: CheckedSentence[] = sentences.map((original, i) => {
    const it = items[i];
    const fix = clip(it.fix, 300);
    const changed = it.verdict !== "ok" && fix.length > 0 && fix !== original;
    return {
      original,
      verdict: changed ? it.verdict : "ok",
      fix: changed ? fix : null,
      why: changed ? clip(it.why, 80) || null : null,
      original_pronunciation: clip(it.original_pronunciation, 400),
      original_ko: clip(it.original_ko, 400),
      fix_pronunciation: changed ? clip(it.fix_pronunciation, 400) : null,
      fix_ko: changed ? clip(it.fix_ko, 400) : null,
    };
  });
  const body: CheckResponse = { sentences: out, usageLeft: charge.left };
  return NextResponse.json(body);
}
