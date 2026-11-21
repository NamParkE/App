import { after, NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/data";
import { adminClient, MISSING_SERVICE_KEY } from "@/lib/supabase/admin";
import { MOCK_COUNT } from "@/lib/mock";
import { makeMockReport } from "@/lib/mockReport";

/**
 * 15번을 마치거나 40분이 지나면 시험을 마친다. 이때 이번 달 횟수를 1회 센다 (DB 함수 finish_mock_exam).
 * 리포트는 응답을 보낸 뒤 만든다 (Sonnet, 수십 초). 화면은 리포트 화면에서 기다린다.
 */
export const maxDuration = 300;

const Body = z.object({
  adjusted: z.enum(["easier", "same", "harder"]).nullable(),
  answers: z
    .array(
      z.object({
        n: z.number().int().min(1).max(MOCK_COUNT),
        said: z.string().max(3000),
        sec: z.number().min(0).max(3600),
        replays: z.number().int().min(0).max(5),
      }),
    )
    .max(MOCK_COUNT),
});

function fail(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail(404, "시험을 찾을 수 없어요.");
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "잘못된 요청이에요.");

  const { userId } = await currentUser();
  if (!userId) return fail(401, "다시 로그인해 주세요.");
  const admin = adminClient();
  if (!admin) return fail(500, MISSING_SERVICE_KEY);

  const { data: left, error } = await admin.rpc("finish_mock_exam", {
    p_uid: userId,
    p_exam: id,
    p_adjusted: parsed.data.adjusted,
    p_answers: parsed.data.answers,
  });
  if (error) {
    if (error.code === "53400") return fail(409, "이번 달 모의고사 횟수를 다 썼어요. 이번 시험은 저장하지 않았어요.");
    if (error.code === "P0002") return fail(404, "시험을 찾을 수 없어요.");
    console.error("[mock] finish failed", error);
    return fail(500, "시험을 저장하지 못했어요. 다시 눌러 주세요.");
  }
  after(() => makeMockReport(admin, id));
  return NextResponse.json({ left: left as number });
}
