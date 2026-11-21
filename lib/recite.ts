// 답변 전체 이어 말하기 (오픽 준비 고도화 ①): 채점은 단어 비교 (AI 없음).
// 답변 전체를 한 번에 비교한 뒤(문장 경계를 넘어 말해도 맞게 정렬되도록), 모범 단어를 문장별로 다시 나눠 문장마다 맞힌 비율을 낸다.
import { compareSentences, type Token } from "./diff.ts";

/** 이 비율(%) 미만으로 맞힌 문장은 "막힌 문장" */
export const STUCK_PCT = 80;
/** 이만큼(초) 말하면 자동으로 끝낸다 */
export const RECITE_MAX_SEC = 180;
/** 목표 시간 (2분 안팎) */
export const RECITE_GOAL = { min: 90, max: 150 } as const;

export type ReciteSentence = { position: number; en: string };

export type ReciteSentenceResult = {
  position: number;
  pct: number; // 이 문장의 모범 단어 중 맞힌 비율
  stuck: boolean;
  tokens: Token[]; // 이 문장의 모범 단어 (빠뜨림 · 틀림 표시)
};

export type ReciteResult = {
  score: number; // 전체 일치도 (단어 비교 점수, 더 말한 단어도 깎는다)
  sentences: ReciteSentenceResult[];
  stuck: number[]; // 막힌 문장 위치
};

export function scoreRecital(sentences: ReciteSentence[], said: string): ReciteResult {
  const sorted = sentences.slice().sort((a, b) => a.position - b.position);
  const words = sorted.map((s) => s.en.trim().split(/\s+/).filter(Boolean));
  const diff = compareSentences(words.map((w) => w.join(" ")).join(" "), said);
  let at = 0;
  const out: ReciteSentenceResult[] = sorted.map((s, i) => {
    const tokens = diff.model.slice(at, at + words[i].length);
    at += words[i].length;
    const good = tokens.filter((t) => t.status === "ok" || t.status === "swap_ok").length;
    const pct = tokens.length ? Math.round((100 * good) / tokens.length) : 100;
    return { position: s.position, pct, stuck: pct < STUCK_PCT, tokens };
  });
  return { score: diff.score, sentences: out, stuck: out.filter((s) => s.stuck).map((s) => s.position) };
}

/** 초 → "1:54" */
export function mmss(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 지난번과 비교 한 줄 ("지난번 79% · 2:21 보다 나아졌어요") */
export function compareLine(now: { score: number }, prev: { score: number; durationSec: number } | null) {
  if (!prev) return "첫 이어 말하기예요. 다음엔 지난번과 비교해 드려요.";
  const base = `지난번 ${prev.score}% · ${mmss(prev.durationSec)}`;
  if (now.score > prev.score) return `${base} 보다 나아졌어요`;
  if (now.score === prev.score) return `${base} 와 같아요`;
  return `${base} · 이번엔 조금 아쉬워요`;
}

/** /api/recite 응답 */
export type ReciteResponse = ReciteResult & {
  durationSec: number;
  previous: { score: number; durationSec: number } | null;
};

/** ?only=2,5 → 위치 목록. 이상한 값은 버린다 */
export function parseOnly(v: string | undefined): number[] {
  if (!v) return [];
  return [...new Set(v.split(",").map((x) => parseInt(x, 10)).filter((n) => Number.isInteger(n) && n >= 0 && n < 100))];
}
