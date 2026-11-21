import { checkProfile, fetchProfile, requireUser } from "@/lib/data";
import { monthStartKst, nextRefillLabel, type MockReport } from "@/lib/mock";
import type { Survey } from "@/lib/mockBank";
import MockSetup from "./MockSetup";

export type PastExam = { id: string; finished_at: string; report_status: string; grade: MockReport["grade"] | null };

/** 실전 모의고사 시작 안내 · 배경 설문 · 자가 평가 (오픽 준비 고도화 ③) */
export default async function MockPage() {
  const { supabase, userId } = await requireUser();
  const [rawProfile, { data: limitRow }, { data: done }, { data: last }] = await Promise.all([
    fetchProfile(supabase, userId),
    supabase.from("profiles").select("mock_monthly_limit").eq("id", userId).maybeSingle<{ mock_monthly_limit: number }>(),
    supabase
      .from("mock_exams")
      .select("id, finished_at, report_status, report")
      .eq("user_id", userId)
      .eq("status", "done")
      .order("finished_at", { ascending: false })
      .limit(40) // 한 달 횟수는 최대 30회
      .returns<{ id: string; finished_at: string; report_status: string; report: MockReport | null }[]>(),
    // 지난번 설문 답은 그대로 채워 두고 고칠 수만 있게
    supabase
      .from("mock_exams")
      .select("survey")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ survey: Survey }>(),
  ]);
  const profile = checkProfile(rawProfile);
  const limit = limitRow?.mock_monthly_limit ?? 3;
  const since = Date.parse(monthStartKst());
  const used = (done ?? []).filter((e) => Date.parse(e.finished_at) >= since).length;
  const past: PastExam[] = (done ?? []).slice(0, 10).map((e) => ({
    id: e.id,
    finished_at: e.finished_at,
    report_status: e.report_status,
    grade: e.report?.grade ?? null,
  }));
  return (
    <MockSetup
      level={profile.level}
      limit={limit}
      left={Math.max(0, limit - used)}
      refill={nextRefillLabel()}
      lastSurvey={last?.survey ?? null}
      past={past}
    />
  );
}
