import "server-only";
import { redirect } from "next/navigation";
import { requireUser, type DB } from "./data";
import { krwPerUsd } from "./pricing";

// 운영자 메뉴 (DB: 0008_admin.sql). 운영자인지는 DB 함수 is_operator() 가 정한다.
// admin_* 함수도 첫 줄에서 다시 확인하므로, 화면을 건너뛰고 API 를 불러도 막힌다.

export async function isOperator(supabase: DB): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_operator");
  if (error) {
    // 0008 을 아직 실행하지 않은 경우 등: 운영자 메뉴를 숨긴다
    console.error("[admin] is_operator failed", error.message);
    return false;
  }
  return data === true;
}

/** 운영자가 아니면 내 정보 화면으로 보낸다 */
export async function requireOperator() {
  const u = await requireUser();
  if (!(await isOperator(u.supabase))) redirect("/me");
  return u;
}

/** 원/달러 환율 (환경 변수 KRW_PER_USD, 기본 1,400) */
export function rate() {
  return krwPerUsd(process.env.KRW_PER_USD);
}

// ───── DB 함수가 돌려주는 모양 ─────

export interface Overview {
  today: string;
  month_cost_usd: number;
  month_calls: number;
  total_users: number;
  studied_today: number;
  studied_week: number;
  week_practices: number;
  week_lessons: number;
  maxed: { user_id: string; display_name: string; family_name: string; used: number; daily_limit: number }[];
  families: { id: string; name: string; members: number; studied_today: number; month_cost_usd: number }[];
}

export interface FamilyDetail {
  id: string;
  name: string;
  created_at: string;
  owner_name: string | null;
  month_cost_usd: number;
  members: {
    user_id: string;
    display_name: string;
    is_owner: boolean;
    style: "memorize" | "vocab";
    level_label: string;
    used_today: number;
    daily_limit: number;
    streak: number;
    last_study_day: string | null;
    month_cost_usd: number;
  }[];
}

export interface MemberDetail {
  user_id: string;
  display_name: string;
  email: string | null;
  family_id: string;
  family_name: string;
  is_owner: boolean;
  level_label: string;
  daily_limit: number;
  used_today: number;
  days: { day: string; used: number }[];
  streak: number;
  last_study_day: string | null;
  month_lessons: number;
  month_practices: number;
  month_used: number;
  month_cost_usd: number;
  last_change: { old_limit: number; new_limit: number; changed_at: string } | null;
}

export interface CostDetail {
  month: string;
  total_usd: number;
  calls: number;
  first_call_at: string | null;
  days: { day: string; usd: number }[];
  kinds: { kind: string; usd: number; calls: number }[];
  families: { id: string | null; name: string; members: number; usd: number }[];
  models: { model: string; usd: number; calls: number }[];
}

// ───── 날짜 (한국 날짜 문자열 YYYY-MM-DD 기준) ─────

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function parseDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function weekdayKo(day: string) {
  return WEEKDAYS[parseDay(day).getUTCDay()];
}

/** 11월 20일 (목) */
export function dayLabel(day: string) {
  const d = parseDay(day);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}

/** 두 날짜 사이의 날 수 (b - a) */
export function daysBetween(a: string, b: string) {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000);
}

export function daysInMonth(day: string) {
  const d = parseDay(day);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/** "2026-11" 형식이 맞으면 그 달 1일, 아니면 null */
export function parseMonth(raw: string | undefined): string | null {
  if (!raw || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return null;
  return `${raw}-01`;
}

/** 달을 옮긴다: "2026-11-01", -1 → "2026-10" */
export function shiftMonth(monthStart: string, by: number) {
  const d = parseDay(monthStart);
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + by, 1));
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`;
}
