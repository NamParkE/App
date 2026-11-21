import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/data";
import { adminClient, MISSING_SERVICE_KEY } from "@/lib/supabase/admin";
import { makeMockReport } from "@/lib/mockReport";

/** 리포트 다시 만들기 (실패했거나 너무 오래 걸릴 때). 횟수는 더 세지 않는다 */
export const maxDuration = 300;
/** 만드는 중인 리포트는 이만큼 지나야 다시 만들 수 있다 (같은 시험을 겹쳐 만들지 않게) */
const STUCK_MS = 3 * 60 * 1000;

function fail(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail(404, "시험을 찾을 수 없어요.");
  const { supabase, userId } = await currentUser();
  if (!userId) return fail(401, "다시 로그인해 주세요.");
  const admin = adminClient();
  if (!admin) return fail(500, MISSING_SERVICE_KEY);

  // RLS 로 내 시험인지 확인
  const { data: exam } = await supabase
    .from("mock_exams")
    .select("id, status, report_status, finished_at")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string; report_status: string; finished_at: string | null }>();
  if (!exam || exam.status !== "done") return fail(404, "시험을 찾을 수 없어요.");
  if (exam.report_status === "ready") return NextResponse.json({ ok: true });
  const stuck = exam.report_status === "pending" && Date.now() - Date.parse(exam.finished_at ?? "") < STUCK_MS;
  if (stuck) return fail(409, "리포트를 만들고 있어요. 조금만 기다려 주세요.");

  await admin.from("mock_exams").update({ report_status: "pending", finished_at: exam.finished_at }).eq("id", id);
  const ok = await makeMockReport(admin, id);
  if (!ok) return fail(502, "리포트를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
  return NextResponse.json({ ok: true });
}
