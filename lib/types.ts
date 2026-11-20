export type Level = "IM2" | "IH" | "AL";
export type Style = "memorize" | "vocab";
export type Category = "survey" | "unexpected" | "roleplay";
export type Mode = "see" | "hide";

export interface Profile {
  id: string;
  family_id: string;
  display_name: string;
  level: Level;
  style: Style;
  daily_limit: number;
  setup_done: boolean;
}

export interface Topic {
  id: string;
  category: Category;
  title_ko: string;
  title_en: string;
  question_en: string;
  question_ko: string;
  sort: number;
}

export interface Sentence {
  id: string;
  position: number;
  en: string;
  pronunciation: string;
  ko: string;
}

export type SentenceStatus = "todo" | "practicing" | "memorized";

export const LEVELS: { id: Level; title: string; desc: string }[] = [
  { id: "IM2", title: "짧고 정확하게", desc: "한 답변 5문장, 기본 표현 위주" },
  { id: "IH", title: "자연스럽게 이어서", desc: "7문장, 연결어와 묘사 추가" },
  { id: "AL", title: "풍부하고 유창하게", desc: "9문장, 의견과 경험담 포함" },
];

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "survey", label: "설문 주제" },
  { id: "unexpected", label: "돌발" },
  { id: "roleplay", label: "롤플레이" },
];

// 가리고 말하기에서 이 점수 이상이면 "외움"
export const MEMORIZED_SCORE = 90;

export interface FeedbackResponse {
  diff: import("./diff").DiffResult;
  headline: string;
  tips: string[];
  /** 코치(AI)를 부르지 않은 이유: perfect = 다 맞음, limit = 오늘 한도 소진, error = AI 오류 */
  coachSkipped: "perfect" | "limit" | "error" | null;
  /** coachSkipped 가 error 일 때 이유 */
  coachError: string | null;
  usageLeft: number | null;
  status: SentenceStatus;
}

/** Supabase 의 관계 조회 결과는 객체이거나 배열일 수 있어 하나로 맞춘다 */
export function one<T>(v: unknown): T | undefined {
  return (Array.isArray(v) ? v[0] : v ?? undefined) as T | undefined;
}
