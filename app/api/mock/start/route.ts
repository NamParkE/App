import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/data";
import { adminClient, MISSING_SERVICE_KEY } from "@/lib/supabase/admin";
import { monthStartKst } from "@/lib/mock";
import { buildExam, validSurvey } from "@/lib/mockBank";

/**
 * 모의고사 시작: 배경 설문 · 자가 평가로 15문항을 만들어 둔다 (8~15번은 난이도 세 벌).
 * 시작만으로는 횟수를 세지 않는다. 이번 달 남은 횟수가 없으면 시작하지 않는다.
 */
const Body = z.object({
  survey: z.object({
    job: z.string().max(40),
    student: z.string().max(40),
    living: z.string().max(40),
    activities: z.array(z.string().max(40)).max(40),
  }),
  selfLevel: z.number().int().min(1).max(6),
});

function fail(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !validSurvey(parsed.data.survey)) return fail(400, "배경 설문을 끝까지 골라 주세요.");
  const { survey, selfLevel } = parsed.data;

  const { supabase, userId } = await currentUser();
  if (!userId) return fail(401, "다시 로그인해 주세요.");
  const admin = adminClient();
  if (!admin) return fail(500, MISSING_SERVICE_KEY);

  const [{ data: profile }, { count }] = await Promise.all([
    supabase.from("profiles").select("mock_monthly_limit").eq("id", userId).maybeSingle<{ mock_monthly_limit: number }>(),
    supabase
      .from("mock_exams")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "done")
      .gte("finished_at", monthStartKst()),
  ]);
  if (!profile) return fail(401, "다시 로그인해 주세요.");
  if ((count ?? 0) >= profile.mock_monthly_limit) return fail(409, "이번 달 모의고사 횟수를 다 썼어요.");

  const { data, error } = await admin
    .from("mock_exams")
    .insert({ user_id: userId, survey, self_level: selfLevel, questions: buildExam(survey, selfLevel) })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    console.error("[mock] start failed", error);
    return fail(500, "시험을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  return NextResponse.json({ id: data.id });
}
