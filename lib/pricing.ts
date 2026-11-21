// AI 비용 계산 (운영자 메뉴). 화면과 서버 어디서나 쓸 수 있는 순수 함수만 둔다.
// 금액은 토큰 수에 모델 가격을 곱한 추정치다. 실제 청구액은 Anthropic 콘솔에서 확인한다.

/** AI 호출 종류 (DB: ai_calls.kind) */
export const AI_KINDS = ["answer", "coach", "plan", "turn", "hint", "sos", "report"] as const;
export type AiKind = (typeof AI_KINDS)[number];

export const AI_KIND_LABEL: Record<AiKind, string> = {
  turn: "전화영어 대화",
  coach: "오픽 코치 한마디",
  report: "수업 리포트",
  answer: "오픽 답변 만들기",
  hint: "수업 힌트",
  sos: "한국어로 묻기",
  plan: "수업 계획",
};

/** 응답의 usage 중 비용에 쓰는 칸 (SDK 응답의 usage 를 그대로 넘겨도 된다) */
export interface TokenUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

interface Price {
  /** 100만 토큰당 달러 */
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

// 100만 토큰당 달러 (2026-11 기준 Anthropic 가격). 캐시 쓰기는 입력의 1.25배(5분 캐시).
// Haiku 5.5 는 프롬프트가 10만 토큰을 넘으면 비싸지지만, 이 앱의 요청은 그보다 훨씬 짧다.
export const PRICES: Record<string, Price> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

/** 가격표에 없는 모델은 Opus 가격으로 계산한다 (비용을 적게 보이지 않도록) */
const UNKNOWN_MODEL_PRICE = PRICES["claude-opus-5-5"];

export function priceFor(model: string): Price {
  return PRICES[model] ?? UNKNOWN_MODEL_PRICE;
}

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** 토큰 수 → 달러. input_tokens 에는 캐시 토큰이 들어 있지 않다. */
export function costUsd(model: string, usage: TokenUsage): number {
  const p = priceFor(model);
  const usd =
    (n(usage.input_tokens) * p.input +
      n(usage.output_tokens) * p.output +
      n(usage.cache_read_input_tokens) * p.cacheRead +
      n(usage.cache_creation_input_tokens) * p.cacheWrite) /
    1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000; // DB numeric(12,6) 에 맞춘다
}

// ───── 원화 ─────

export const DEFAULT_KRW_PER_USD = 1400;
/** 운영자 메뉴의 월 비용 목표 (원) */
export const MONTHLY_BUDGET_KRW = 20000;

/** 환율. 환경 변수 KRW_PER_USD 가 올바르지 않으면 기본값 */
export function krwPerUsd(raw: string | undefined): number {
  const v = Number(raw);
  return Number.isFinite(v) && v >= 100 && v <= 10000 ? v : DEFAULT_KRW_PER_USD;
}

export function toKrw(usd: number, rate: number): number {
  return Math.round(usd * rate);
}

export function formatKrw(won: number): string {
  return `${Math.round(won).toLocaleString("ko-KR")}원`;
}

export function formatUsd(usd: number): string {
  return `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`;
}

/** 이번 달을 이 속도로 쓰면 월말에 얼마인지. day 는 오늘 날짜(1~31), daysInMonth 는 그 달의 날 수 */
export function projectMonth(spent: number, day: number, daysInMonth: number): number {
  if (day <= 0 || daysInMonth <= 0) return spent;
  return (spent / Math.min(day, daysInMonth)) * daysInMonth;
}
