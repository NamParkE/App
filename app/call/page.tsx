import { checkProfile, fetchProfile, requireUser, todayKst } from "@/lib/data";
import type { ReviewItem } from "@/lib/call/types";
import CallSession from "./CallSession";

// 수업 화면. 복습 → 수업 준비 → 통화 → 리포트 → 축하까지 이 화면 하나에서 진행한다
// (단계마다 서버 페이지를 다시 만들지 않아 빠르다).
export default async function CallPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const { supabase, userId } = await requireUser();
  const [rawProfile, { data: due }] = await Promise.all([
    fetchProfile(supabase, userId),
    supabase
      .from("expressions")
      .select("id, en, ko, example, stage")
      .eq("user_id", userId)
      .lte("next_review_on", todayKst())
      .order("next_review_on")
      .limit(3)
      .returns<ReviewItem[]>(),
  ]);
  const profile = checkProfile(rawProfile);
  return (
    <CallSession
      level={profile.call_level}
      name={profile.display_name}
      topicId={topic ?? null}
      reviewItems={due ?? []}
    />
  );
}
