import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/data";
import { chargeUsage, refundCharge } from "@/lib/usage";
import { describeClaudeError, generateSentences } from "@/lib/claude";
import type { Profile, Topic } from "@/lib/types";

const Body = z.object({ topicId: z.string().min(1).max(64) });

// AI 응답을 기다릴 수 있도록 넉넉히 (Vercel 함수 최대 실행 시간, 초)
export const maxDuration = 60;

function fail(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "잘못된 요청이에요.");

  const { supabase, userId } = await currentUser();
  if (!userId) return fail(401, "다시 로그인해 주세요.");
  const topicId = parsed.data.topicId;

  // 프로필·주제·기존 답변을 한꺼번에 조회 (DB 왕복 1번)
  const [{ data: profile }, { data: topic }, { data: sets }] = await Promise.all([
    supabase.from("profiles").select("id, level").eq("id", userId).maybeSingle<Pick<Profile, "id" | "level">>(),
    supabase.from("topics").select("*").eq("id", topicId).maybeSingle<Topic>(),
    supabase.from("answer_sets").select("id, level, sentences(id)").eq("user_id", userId).eq("topic_id", topicId),
  ]);
  if (!profile) return fail(403, "가족 초대 코드로 먼저 가입해 주세요.");
  if (!topic) return fail(404, "주제를 찾을 수 없어요.");

  // 이미 만든 답변이 있으면 그대로 쓴다 (AI 비용 아끼기)
  const existing = (sets ?? []).find((s) => s.level === profile.level);
  if (existing && ((existing.sentences as unknown[] | null)?.length ?? 0) > 0) {
    return NextResponse.json({ ok: true });
  }

  const charge = await chargeUsage(supabase);
  if (!charge) return fail(500, "사용량을 확인하지 못했어요.");
  if (charge.left < 0) return fail(429, "오늘 연습 횟수를 다 썼어요. 내일 다시 만나요!");

  let generated;
  try {
    generated = await generateSentences(topic, profile.level, userId);
  } catch (e) {
    await refundCharge(supabase, charge.ticket);
    console.error("generate failed", e);
    const { status, message } = describeClaudeError(e);
    return fail(status, `답변을 만들지 못했어요. ${message}`);
  }

  let setId = existing?.id as string | undefined;
  if (!setId) {
    const { data: created, error } = await supabase
      .from("answer_sets")
      .insert({ user_id: userId, topic_id: topic.id, level: profile.level })
      .select("id")
      .single();
    if (error) {
      // 동시에 두 번 눌린 경우: 먼저 만든 쪽을 쓴다
      const { data: again } = await supabase
        .from("answer_sets")
        .select("id")
        .eq("user_id", userId)
        .eq("topic_id", topic.id)
        .eq("level", profile.level)
        .maybeSingle();
      if (!again) return fail(500, "답변을 저장하지 못했어요.");
      return NextResponse.json({ ok: true });
    }
    setId = created.id as string;
  }

  const { error: insertError } = await supabase.from("sentences").insert(
    generated.map((s, i) => ({
      answer_set_id: setId,
      position: i,
      en: s.en.trim(),
      pronunciation: s.pronunciation.trim(),
      ko: s.ko.trim(),
    })),
  );
  if (insertError && insertError.code !== "23505") return fail(500, "답변을 저장하지 못했어요.");
  return NextResponse.json({ ok: true });
}
