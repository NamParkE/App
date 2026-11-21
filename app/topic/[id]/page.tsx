import { notFound } from "next/navigation";
import { checkProfile, fetchProfile, requireUser, usageToday } from "@/lib/data";
import { parseSource, sentencesFor, topicSets } from "@/lib/progress";
import type { Topic } from "@/lib/types";
import TopicView from "./TopicView";

export default async function TopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { id } = await params;
  const { v } = await searchParams;
  const { supabase, userId } = await requireUser();
  const [rawProfile, { data: topic }, sets, used] = await Promise.all([
    fetchProfile(supabase, userId),
    supabase.from("topics").select("*").eq("id", id).maybeSingle<Topic>(),
    topicSets(supabase, userId, id),
    usageToday(supabase, userId),
  ]);
  const profile = checkProfile(rawProfile);
  if (!topic) notFound();
  const asked = parseSource(v);
  const ai = sentencesFor(sets, profile.level, "ai");
  const mine = sentencesFor(sets, profile.level, "mine");
  // ?v= 로 고른 쪽, 없으면 기본 방식 쪽을 보여 준다. 비어 있으면 그 방식의 "넣기 / 만들기" 화면이 나온다
  // (다른 쪽 답변이 있으면 작은 링크로 넘어갈 수 있다).
  const initial = asked ?? profile.opic_source;
  return (
    <TopicView
      key={initial}
      topic={topic}
      level={profile.level}
      usageLeft={Math.max(0, profile.daily_limit - used)}
      initial={initial}
      ai={ai}
      mine={mine}
    />
  );
}
