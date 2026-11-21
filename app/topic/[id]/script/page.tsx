import { notFound } from "next/navigation";
import { requireProfile, usageToday } from "@/lib/data";
import type { Topic } from "@/lib/types";
import ScriptFlow from "./ScriptFlow";

/** 내 스크립트 넣기: 붙여 넣기 → 고칠 문장 하나씩 고르기 → 저장 전 확인 */
export default async function ScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId, profile } = await requireProfile();
  const [{ data: topic }, used, { count }] = await Promise.all([
    supabase.from("topics").select("*").eq("id", id).maybeSingle<Topic>(),
    usageToday(supabase, userId),
    supabase.from("answer_sets").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("topic_id", id).eq("source", "mine").is("archived_at", null),
  ]);
  if (!topic) notFound();
  return <ScriptFlow topic={topic} usageLeft={Math.max(0, profile.daily_limit - used)} replacing={(count ?? 0) > 0} />;
}
