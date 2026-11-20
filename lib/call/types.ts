// 전화영어 API 가 주고받는 모양

export interface PlanExpression {
  en: string;
  ko: string;
  example: string;
}

export interface LessonPlan {
  goal: string;
  expressions: PlanExpression[];
  opening: string;
  opening_ko: string;
  questions: string[];
}

export interface Correction {
  wrong: string;
  right: string;
  note: string;
}

/** 리피가 말할 때의 감정 (어린이 모드에서 표정으로 보여 준다) */
export const EMOTIONS = ["happy", "surprised", "curious", "proud", "comfort", "neutral"] as const;
export type Emotion = (typeof EMOTIONS)[number];

export interface ChatMessage {
  role: "tutor" | "user";
  text: string;
  ko?: string | null;
  correction?: Correction | null;
  emotion?: Emotion;
}

export interface StartResponse {
  lessonId: string;
  topic: { id: string; title_ko: string; title_en: string };
  level: number;
  expressions: PlanExpression[];
  opening: ChatMessage;
  usageLeft: number;
}

export interface TurnResponse {
  reply: ChatMessage;
  turns: number;
  done: boolean;
}

export interface HintResponse {
  answers: { en: string; ko: string }[];
  hintsLeft: number;
}

export interface LessonReport {
  score: number;
  parts: { listening: number; expression: number; accuracy: number; amount: number };
  headline: string;
  corrections: { said: string; better: string; note: string }[];
  expressions: PlanExpression[];
}

export interface EndResponse {
  report: LessonReport | null;
  streak: number;
  /** 이번 수업으로 연속 학습일이 늘어 기준일(3, 7, 14…)에 닿았으면 그 값 */
  milestone: number | null;
  levelProgress: { level: number; good: number; needed: number };
  suggest: "up" | "down" | null;
}

export interface ReviewItem {
  id: string;
  en: string;
  ko: string;
  example: string;
  stage: number;
}
