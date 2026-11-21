// 실전 모의고사 (오픽 준비 고도화 ③): 화면 · 서버가 함께 쓰는 값과 순수 함수.
import type { Level } from "./types.ts";

/** 실제 시험처럼 전체 40분 */
export const MOCK_TOTAL_SEC = 40 * 60;
/** 문항마다 질문 다시 듣기 횟수 */
export const MOCK_REPLAYS = 1;
/** 문항 수, 난이도를 다시 고르는 문항 */
export const MOCK_COUNT = 15;
export const MOCK_ADJUST_AFTER = 7;

export const SELF_LEVELS = [
  "단어 몇 개로만 말할 수 있어요.",
  "익숙한 것을 짧은 문장으로 말할 수 있어요.",
  "나와 가까운 주제를 간단한 문장으로 말할 수 있어요.",
  "익숙한 주제는 자신 있게 말하고, 경험도 이야기할 수 있어요.",
  "여러 주제를 자세히, 과거 · 현재 · 미래를 섞어 말할 수 있어요.",
  "낯선 주제도 의견과 근거를 들어 길게 말할 수 있어요.",
] as const;

/** 앱 등급 → 자가 평가 추천 범위 */
export const SELF_RECOMMEND: Record<Level, [number, number]> = { IM2: [3, 4], IH: [4, 5], AL: [5, 6] };

export const GRADES = ["NL", "NM", "NH", "IL", "IM1", "IM2", "IM3", "IH", "AL"] as const;
export type Grade = (typeof GRADES)[number];

export type MockAnswer = { n: number; said: string; sec: number; replays: number };

export const AREAS = [
  { key: "length", label: "답변 길이 · 끊김 없이 말하기" },
  { key: "tense", label: "시제 섞어 쓰기 (과거 경험)" },
  { key: "accuracy", label: "문법 정확도" },
  { key: "roleplay", label: "롤플레이 질문하기" },
] as const;
export type AreaKey = (typeof AREAS)[number]["key"];

export type MockReport = {
  grade: Grade;
  low: Grade;
  high: Grade;
  headline: string;
  areas: { key: AreaKey; score: number }[];
  tips: string[];
  items: { n: number; verdict: "good" | "ok" | "weak"; good: string; fix: string; better: string }[];
};

export function areaWord(score: number): "좋음" | "보통" | "아쉬움" {
  return score >= 70 ? "좋음" : score >= 45 ? "보통" : "아쉬움";
}
export const VERDICT_LABEL = { good: "좋음", ok: "보통", weak: "아쉬움" } as const;

const gi = (g: string) => GRADES.indexOf(g as Grade);

/** AI 가 준 리포트를 화면에 쓸 수 있게 다듬는다 (등급 순서 · 범위 · 문항 번호 · 점수 범위) */
export function normalizeReport(raw: {
  grade: string;
  low: string;
  high: string;
  headline: string;
  areas: { key: string; score: number }[];
  tips: string[];
  items: { n: number; verdict: string; good: string; fix: string; better: string }[];
}): MockReport {
  const g = gi(raw.grade) >= 0 ? gi(raw.grade) : gi("IL");
  let lo = gi(raw.low) >= 0 ? gi(raw.low) : g;
  let hi = gi(raw.high) >= 0 ? gi(raw.high) : g;
  lo = Math.min(lo, g);
  hi = Math.max(hi, g);
  // 범위는 위아래 한 칸까지만
  lo = Math.max(lo, g - 1);
  hi = Math.min(hi, g + 1);
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));
  const areas = AREAS.map((a) => ({ key: a.key, score: clamp(raw.areas.find((x) => x.key === a.key)?.score ?? 0) }));
  const seen = new Set<number>();
  const items = raw.items
    .filter((it) => Number.isInteger(it.n) && it.n >= 1 && it.n <= MOCK_COUNT && !seen.has(it.n) && seen.add(it.n))
    .map((it) => ({
      n: it.n,
      verdict: (["good", "ok", "weak"].includes(it.verdict) ? it.verdict : "ok") as "good" | "ok" | "weak",
      good: it.good,
      fix: it.fix,
      better: it.better,
    }))
    .sort((a, b) => a.n - b.n);
  return { grade: GRADES[g], low: GRADES[lo], high: GRADES[hi], headline: raw.headline, areas, tips: raw.tips.slice(0, 3), items };
}

/** 한국 시간 이번 달 1일 0시 (DB 의 month_start_kst 와 같은 순간) */
export function monthStartKst(now = Date.now()): string {
  const kst = new Date(now + 9 * 3600 * 1000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - 9 * 3600 * 1000).toISOString();
}

/** 다음 달 1일 ("12월 1일") */
export function nextRefillLabel(now = Date.now()): string {
  const kst = new Date(now + 9 * 3600 * 1000);
  return `${((kst.getUTCMonth() + 1) % 12) + 1}월 1일`;
}

/** 남은 시간 "31:40" */
export function clock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
