import { checkProfile, fetchProfile, requireUser, todayKst } from "@/lib/data";
import { pickDue, RECALL_SESSION } from "@/lib/recall";
import { dueRecallRows } from "@/lib/recallServer";
import RecallRunner from "./RecallRunner";

/** 오늘의 복습: 외운 문장을 한글 뜻만 보고 영어로 말하기 (오픽 준비 고도화 ②) */
export default async function RecallPage() {
  const { supabase, userId } = await requireUser();
  const [rawProfile, rows, { data: topics }] = await Promise.all([
    fetchProfile(supabase, userId),
    dueRecallRows(supabase, userId),
    supabase.from("topics").select("id, title_ko").returns<{ id: string; title_ko: string }[]>(),
  ]);
  const profile = checkProfile(rawProfile);
  const due = pickDue(rows, profile.level);
  const titles = Object.fromEntries((topics ?? []).map((t) => [t.id, t.title_ko]));
  return (
    <RecallRunner
      items={due.slice(0, RECALL_SESSION)}
      remaining={Math.max(0, due.length - RECALL_SESSION)}
      titles={titles}
      today={todayKst()}
    />
  );
}
