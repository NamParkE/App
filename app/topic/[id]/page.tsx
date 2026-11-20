import { notFound } from "next/navigation";
import { checkProfile, fetchProfile, requireUser, usageToday } from "@/lib/data";
import { sentencesFor, topicSets } from "@/lib/progress";
import type { Topic } from "@/lib/types";
import TopicView from "./TopicView";

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  return (
    <TopicView
      topic={topic}
      level={profile.level}
      sentences={sentences}
      statuses={statuses}
      usageLeft={Math.max(0, profile.daily_limit - used)}
    />
  );
}
