import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/data";
import { MOCK_TOTAL_SEC } from "@/lib/mock";
import type { MockQuestions } from "@/lib/mockBank";
import MockExam from "./MockExam";

/** 모의고사 보는 중. 끝낸 시험이면 리포트로, 시간이 지난 시험이면 안내만 */
export default async function MockExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireUser();
  const { data: exam } = await supabase
    .from("mock_exams")
    .select("id, status, questions, started_at")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string; questions: MockQuestions; started_at: string }>();
  if (!exam) notFound();
  if (exam.status === "done") redirect(`/mock/${id}/report`);
  const now = Date.now();
  const elapsed = (now - Date.parse(exam.started_at)) / 1000;
  // 새로고침 · 앱 다시 열기: 끝내지 않은 시험은 이어 보지 않는다 (횟수도 세지 않음)
  if (elapsed > 60) {
    return (
      <main className="screen">
        <div className="pad" style={{ justifyContent: "center", alignItems: "center", textAlign: "center", gap: 12 }}>
          <h1 className="title" style={{ fontSize: 20 }}>이 시험은 이어서 볼 수 없어요</h1>
          <p className="subtitle" style={{ fontSize: 14 }}>
            중간에 나간 시험은 저장하지 않고, 이번 달 횟수도 차감하지 않았어요.
          </p>
        </div>
        <div className="bottom">
          <Link href="/mock" className="btn btn-primary">새로 시작하기</Link>
        </div>
      </main>
    );
  }
  return <MockExam id={exam.id} questions={exam.questions} totalSec={MOCK_TOTAL_SEC} elapsedAtLoad={elapsed} />;
}
