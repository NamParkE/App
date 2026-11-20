import { notFound, redirect } from "next/navigation";
import { checkProfile, fetchProfile, requireUser, usageToday } from "@/lib/data";
import { sentencesFor, topicSets } from "@/lib/progress";
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
  const { supabase, userId } = await requireUser();
  const [rawProfile, { data: topic }, sets, used] = await Promise.all([
    fetchProfile(supabase, userId),
    supabase.from("topics").select("*").eq("id", id).maybeSingle<Topic>(),
    topicSets(supabase, userId, id),
    usageToday(supabase, userId),
  ]);
  const profile = checkProfile(rawProfile);
  if (!topic) notFound();
  const { sentences, statuses } = sentencesFor(sets, profile.level);
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
