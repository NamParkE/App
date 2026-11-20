import { notFound } from "next/navigation";
import { requireProfile, usageToday } from "@/lib/data";
import { topicSentences } from "@/lib/progress";
import type { Topic } from "@/lib/types";
import TopicView from "./TopicView";

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, profile } = await requireProfile();
  const { data: topic } = await supabase.from("topics").select("*").eq("id", id).maybeSingle<Topic>();
  if (!topic) notFound();
  const [{ sentences, statuses }, used] = await Promise.all([
    topicSentences(supabase, user.id, topic.id, profile.level),
    usageToday(supabase, user.id),
  ]);
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
