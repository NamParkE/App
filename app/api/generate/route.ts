import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ClaudeRefusalError, generateSentences } from "@/lib/claude";
import type { Profile, Topic } from "@/lib/types";

const Body = z.object({ topicId: z.string().min(1).max(64) });

function fail(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "잘못된 요청이에요.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "다시 로그인해 주세요.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, level")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "id" | "level">>();
  if (!profile) return fail(403, "가족 초대 코드로 먼저 가입해 주세요.");

  const { data: topic } = await supabase
    .from("topics")
    .select("*")
    .eq("id", parsed.data.topicId)
    .maybeSingle<Topic>();
  if (!topic) return fail(404, "주제를 찾을 수 없어요.");

  // 이미 만든 답변이 있으면 그대로 쓴다 (AI 비용 아끼기)
  const { data: existing } = await supabase
    .from("answer_sets")
    .select("id, sentences(id)")
    .eq("user_id", user.id)
    .eq("topic_id", topic.id)
    .eq("level", profile.level)
    .maybeSingle();
  if (existing && ((existing.sentences as unknown[] | null)?.length ?? 0) > 0) {
    return NextResponse.json({ ok: true });
  }

  const { data: left, error: usageError } = await supabase.rpc("consume_usage");
  if (usageError) return fail(500, "사용량을 확인하지 못했어요.");
  if ((left as number) < 0) return fail(429, "오늘 연습 횟수를 다 썼어요. 내일 다시 만나요!");

  let generated;
  try {
    generated = await generateSentences(topic, profile.level);
  } catch (e) {
    await supabase.rpc("refund_usage");
    console.error("generate failed", e);
    if (e instanceof ClaudeRefusalError) return fail(422, "이 주제는 답변을 만들 수 없었어요.");
    if (e instanceof Anthropic.RateLimitError) return fail(503, "요청이 많아요. 잠시 후 다시 시도해 주세요.");
    return fail(502, "답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  let setId = existing?.id as string | undefined;
  if (!setId) {
    const { data: created, error } = await supabase
      .from("answer_sets")
      .insert({ user_id: user.id, topic_id: topic.id, level: profile.level })
      .select("id")
      .single();
    if (error) {
      // 동시에 두 번 눌린 경우: 먼저 만든 쪽을 쓴다
      const { data: again } = await supabase
        .from("answer_sets")
        .select("id")
        .eq("user_id", user.id)
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
