import { after, NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, todayKst } from "@/lib/data";
import { compareSentences } from "@/lib/diff";
import { fail } from "@/lib/call/server";

const Body = z.object({ expressionId: z.string().uuid(), said: z.string().trim().min(1).max(300) });

// 복습 간격 (단계별, 일): 맞히면 단계가 오르고 다음 복습이 멀어진다
const INTERVALS = [1, 3, 7, 14, 30];
const PASS = 90;

function addDays(day: string, n: number) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 표현 복습: 단어 비교로 채점 (AI 없음) */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "잘못된 요청이에요.");
  const { supabase, userId } = await currentUser();
  if (!userId) return fail(401, "다시 로그인해 주세요.");

  const { data: ex } = await supabase
    .from("expressions")
    .select("id, en, stage")
    .eq("id", parsed.data.expressionId)
    .maybeSingle<{ id: string; en: string; stage: number }>();
  if (!ex) return fail(404, "표현을 찾을 수 없어요.");

  const diff = compareSentences(ex.en.replace(/…|\.\.\./g, " "), parsed.data.said);
  const passed = diff.score >= PASS;
  const stage = passed ? Math.min(ex.stage + 1, 4) : ex.stage;
  const next = addDays(todayKst(), passed ? INTERVALS[stage] : 1);

  after(async () => {
    await Promise.all([
      supabase.from("expressions").update({ stage, next_review_on: next }).eq("id", ex.id),
      supabase.rpc("bump_activity", { p_reviews: 1 }),
    ]);
  });
  return NextResponse.json({ diff, passed, stage });
}
