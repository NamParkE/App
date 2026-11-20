import { after, NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/data";
import { describeClaudeError } from "@/lib/claude";
import { chargeUsage, refundCharge } from "@/lib/usage";
import { adminClient, MISSING_SERVICE_KEY } from "@/lib/supabase/admin";
import { generatePlan } from "@/lib/call/claude";
import { LESSON_USAGE_COST } from "@/lib/call/levels";
import { closeStale, fail, saveOrLog, splitActive, type ActiveLessonRow } from "@/lib/call/server";
import type { LessonPlan, StartResponse } from "@/lib/call/types";

export const maxDuration = 60;

const Body = z.object({ topicId: z.string().max(64).optional() });

type TopicRow = { id: string; level_min: number; level_max: number; title_ko: string; title_en: string; scenario: string; sort: number };

/** 수업 시작: 사용량 차감 + 수업 계획(없을 때만 AI) + 수업 생성. 선생님 첫 마디는 계획에 있어 AI를 따로 부르지 않는다. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fail(400, "잘못된 요청이에요.");
  const { supabase, userId } = await currentUser();
  if (!userId) return fail(401, "다시 로그인해 주세요.");
  const admin = adminClient();
  if (!admin) return fail(500, MISSING_SERVICE_KEY);

  // 프로필 · 주제 목록 · 최근 수업 · 진행 중인 수업을 한꺼번에
  const [{ data: profile }, { data: topics }, { data: recent }, { data: active }] = await Promise.all([
    supabase.from("profiles").select("call_level, family_id").eq("id", userId).maybeSingle<{ call_level: number; family_id: string }>(),
    supabase.from("call_topics").select("*").order("sort").returns<TopicRow[]>(),
    supabase.from("lessons").select("topic_id, started_at").eq("user_id", userId).order("started_at", { ascending: false }).limit(40),
    supabase
      .from("lessons")
      .select("id, topic_id, turns, started_at, last_active_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .returns<ActiveLessonRow[]>(),
  ]);
  if (!profile) return fail(403, "가족 초대 코드로 먼저 가입해 주세요.");

  // 끊긴 통화가 30분 안이면 새 수업 대신 이어서 하게 한다. 시간이 지난 것은 닫는다 (대답 0번이면 환불)
  const { resumable, stale } = splitActive(active ?? []);
  if (resumable) return fail(409, "끊긴 통화가 있어요. 홈에서 이어서 하거나 그만둔 뒤 시작해 주세요.");
  if (stale.length) await closeStale(supabase, admin, stale);
  const level = profile.call_level;
  const forLevel = (topics ?? []).filter((t) => level >= t.level_min && level <= t.level_max);
  if (forLevel.length === 0) return fail(500, "이 레벨의 수업 주제가 없어요.");

  // 고른 주제, 아니면 아직 안 한 주제를 순서대로, 다 했으면 가장 오래전에 한 주제
  let topic = forLevel.find((t) => t.id === parsed.data.topicId);
  if (!topic) {
    const lastDone = new Map<string, string>();
    for (const r of recent ?? []) if (!lastDone.has(r.topic_id as string)) lastDone.set(r.topic_id as string, r.started_at as string);
    topic =
      forLevel.find((t) => !lastDone.has(t.id)) ??
      [...forLevel].sort((a, b) => (lastDone.get(a.id) ?? "").localeCompare(lastDone.get(b.id) ?? ""))[0];
  }

  // 사용량 차감과 계획 조회를 동시에
  const [charge, { data: existingPlan }] = await Promise.all([
    chargeUsage(supabase, LESSON_USAGE_COST),
    supabase.from("lesson_plans").select("id, plan").eq("topic_id", topic.id).eq("level", level).maybeSingle<{ id: string; plan: LessonPlan }>(),
  ]);
  if (!charge) return fail(500, "사용량을 확인하지 못했어요.");
  const left = charge.left;
  if (left < 0) {
    return fail(429, `오늘 남은 연습이 ${LESSON_USAGE_COST}회보다 적어요. 수업은 내일 다시 할 수 있어요.`);
  }

  let plan = existingPlan;
  if (!plan) {
    let generated: LessonPlan;
    try {
      generated = await generatePlan(topic, level);
    } catch (e) {
      console.error("plan failed", e);
      await refundCharge(supabase, charge.ticket);
      return fail(describeClaudeError(e).status, `수업을 준비하지 못했어요. ${describeClaudeError(e).message}`);
    }
    const { data: inserted } = await supabase
      .from("lesson_plans")
      .insert({ family_id: profile.family_id, topic_id: topic.id, level, plan: generated })
      .select("id, plan")
      .maybeSingle<{ id: string; plan: LessonPlan }>();
    plan =
      inserted ??
      // 가족이 동시에 같은 계획을 만든 경우: 먼저 만든 것을 쓴다
      (await supabase.from("lesson_plans").select("id, plan").eq("topic_id", topic.id).eq("level", level).maybeSingle<{ id: string; plan: LessonPlan }>()).data;
    if (!plan) {
      await refundCharge(supabase, charge.ticket);
      return fail(500, "수업을 저장하지 못했어요.");
    }
  }

  // 수업은 서버 연결로 만든다 (user_id 는 로그인 정보에서). 계획은 위에서 사용자 연결로 읽어 가족 것임을 확인했다
  const { data: lesson, error } = await admin
    .from("lessons")
    .insert({ user_id: userId, topic_id: topic.id, level, plan_id: plan.id })
    .select("id")
    .single();
  if (error || !lesson) {
    await refundCharge(supabase, charge.ticket);
    return fail(500, "수업을 시작하지 못했어요.");
  }

  const opening = { role: "tutor" as const, text: plan.plan.opening, ko: plan.plan.opening_ko, correction: null };
  // 첫 마디 저장 · 영수증을 수업에 묶기(대답 없이 끝나면 환불용)는 기다리지 않는다 (다음 턴까지 몇 초 여유가 있다)
  after(async () => {
    await saveOrLog(`link charge (lesson ${lesson.id})`, () =>
      supabase.rpc("link_charge", { p_ticket: charge.ticket, p_lesson: lesson.id }),
    );
    await saveOrLog(`opening (lesson ${lesson.id})`, () =>
      admin.from("lesson_messages").insert({ lesson_id: lesson.id, user_id: userId, role: "tutor", text: opening.text, ko: opening.ko }),
    );
  });

  const body: StartResponse = {
    lessonId: lesson.id as string,
    topic: { id: topic.id, title_ko: topic.title_ko, title_en: topic.title_en },
    level,
    expressions: plan.plan.expressions,
    opening,
    usageLeft: left,
  };
  return NextResponse.json(body);
}
