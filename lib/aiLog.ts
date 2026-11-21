import "server-only";
import { after } from "next/server";
import { adminClient } from "./supabase/admin";
import { costUsd, type AiKind, type TokenUsage } from "./pricing";

// AI 호출 1번 = ai_calls 한 줄 (운영자 메뉴의 비용). 응답을 보낸 뒤에 기록하고, 실패해도 학습은 막지 않는다.

/** 누가 무엇 때문에 부르는지. 비용 기록에 쓴다 */
export interface AiMeter {
  userId: string;
  kind: AiKind;
}

export function logAiCall(meter: AiMeter, model: string, usage: TokenUsage | null | undefined) {
  if (!usage) return;
  const row = {
    user_id: meter.userId,
    kind: meter.kind,
    model,
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cache_read_tokens: usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
    cost_usd: costUsd(model, usage),
  };
  const save = async () => {
    const admin = adminClient();
    if (!admin) return;
    const { error } = await admin.from("ai_calls").insert(row);
    if (error) console.error("[ai-log] insert failed", error);
  };
  try {
    after(save);
  } catch {
    // 요청 밖에서 불린 경우 (테스트 등): 바로 저장한다
    void save();
  }
}
