import { notFound, redirect } from "next/navigation";
import { requireProfile, usageToday } from "@/lib/data";
import { topicSentences } from "@/lib/progress";
import type { Topic } from "@/lib/types";
import Practice from "./Practice";

export default async function PracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const { id } = await params;
  const { start } = await searchParams;
  const { supabase, user, profile } = await requireProfile();
  const { data: topic } = await supabase.from("topics").select("*").eq("id", id).maybeSingle<Topic>();
  if (!topic) notFound();
  const [{ sentences, statuses }, used] = await Promise.all([
    topicSentences(supabase, user.id, topic.id, profile.level),
    usageToday(supabase, user.id),
  ]);
  if (sentences.length === 0) redirect(`/topic/${topic.id}`);
  const startIdx = Math.min(Math.max(0, parseInt(start ?? "0", 10) || 0), sentences.length - 1);
  return (
    <Practice
      topic={topic}
      sentences={sentences}
      initialStatuses={statuses}
      startIdx={startIdx}
      initialUsageLeft={Math.max(0, profile.daily_limit - used)}
    />
  );
}
