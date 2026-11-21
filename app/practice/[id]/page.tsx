import { notFound, redirect } from "next/navigation";
import { checkProfile, fetchProfile, requireUser, usageToday } from "@/lib/data";
import { parseSource, pickSource, sentencesFor, topicSets } from "@/lib/progress";
import type { Topic } from "@/lib/types";
import Practice from "./Practice";

export default async function PracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string; v?: string }>;
}) {
  const { id } = await params;
  const { start, v } = await searchParams;
  const { supabase, userId } = await requireUser();
  const [rawProfile, { data: topic }, sets, used] = await Promise.all([
    fetchProfile(supabase, userId),
    supabase.from("topics").select("*").eq("id", id).maybeSingle<Topic>(),
    topicSets(supabase, userId, id),
    usageToday(supabase, userId),
  ]);
  const profile = checkProfile(rawProfile);
  if (!topic) notFound();
  // 주소의 ?v= (내 스크립트 mine / AI 답변 ai) 를 따르고, 없으면 기본 방식 쪽
  const source = pickSource(sets, profile.level, parseSource(v), profile.opic_source);
  const { sentences, statuses } = sentencesFor(sets, profile.level, source);
  if (sentences.length === 0) redirect(`/topic/${topic.id}`);
  // ?start= 가 없으면 아직 못 외운 첫 문장부터 (홈의 "이어서 연습")
  const firstTodo = Math.max(0, sentences.findIndex((s) => statuses[s.id] !== "memorized"));
  const startIdx = Math.min(Math.max(0, start === undefined ? firstTodo : parseInt(start, 10) || 0), sentences.length - 1);
  return (
    <Practice
      topic={topic}
      source={source}
      sentences={sentences}
      initialStatuses={statuses}
      startIdx={startIdx}
      initialUsageLeft={Math.max(0, profile.daily_limit - used)}
    />
  );
}
