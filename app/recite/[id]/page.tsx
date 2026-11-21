import { notFound, redirect } from "next/navigation";
import { checkProfile, fetchProfile, requireUser } from "@/lib/data";
import { parseSource, pickSource, sentencesFor, topicSets } from "@/lib/progress";
import type { Topic } from "@/lib/types";
import ReciteRunner from "./ReciteRunner";

/** 답변 전체 이어 말하기 (오픽 준비 고도화 ①). 모든 문장을 외운 답변만 */
export default async function RecitePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { id } = await params;
  const { v } = await searchParams;
  const { supabase, userId } = await requireUser();
  const [rawProfile, { data: topic }, sets] = await Promise.all([
    fetchProfile(supabase, userId),
    supabase.from("topics").select("*").eq("id", id).maybeSingle<Topic>(),
    topicSets(supabase, userId, id),
  ]);
  const profile = checkProfile(rawProfile);
  if (!topic) notFound();
  const source = pickSource(sets, profile.level, parseSource(v), profile.opic_source);
  const { sentences, statuses } = sentencesFor(sets, profile.level, source);
  const allDone = sentences.length > 0 && sentences.every((s) => statuses[s.id] === "memorized");
  if (!allDone) redirect(`/topic/${topic.id}?v=${source}`);
  return (
    <ReciteRunner
      topic={topic}
      source={source}
      sentences={sentences.map((s) => ({ position: s.position, en: s.en, ko: s.ko }))}
    />
  );
}
