import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/data";
import type { MockAnswer, MockReport } from "@/lib/mock";
import { questionsFor, type Adjust, type MockQuestions } from "@/lib/mockBank";
import ReportView from "./ReportView";

/** 모의고사 리포트: 만드는 중이면 기다리고, 실패하면 다시 만들기 (추가 차감 없음) */
export default async function MockReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, userId } = await requireUser();
  const [{ data: exam }, { data: topics }] = await Promise.all([
    supabase
      .from("mock_exams")
      .select("id, status, questions, adjusted, answers, finished_at, report, report_status")
      .eq("id", id)
      .maybeSingle<{
        id: string;
        status: string;
        questions: MockQuestions;
        adjusted: Adjust | null;
        answers: MockAnswer[];
        finished_at: string | null;
        report: MockReport | null;
        report_status: "none" | "pending" | "ready" | "failed";
      }>(),
    supabase.from("topics").select("id").returns<{ id: string }[]>(),
  ]);
  if (!exam || !userId) notFound();
  if (exam.status !== "done") redirect(`/mock/${id}`);
  const known = new Set((topics ?? []).map((t) => t.id));
  const qs = questionsFor(exam.questions, exam.adjusted).map((q) => ({ ...q, topicId: q.topicId && known.has(q.topicId) ? q.topicId : null }));
  const spoke = exam.answers.reduce((s, a) => s + (a.sec || 0), 0);
  return (
    <ReportView
      id={exam.id}
      status={exam.report_status}
      report={exam.report}
      questions={qs}
      answers={exam.answers}
      finishedAt={exam.finished_at ?? ""}
      spokeSec={spoke}
    />
  );
}
