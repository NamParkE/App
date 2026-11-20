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
  /** false 면 엉뚱한 대답이라 대답 수에 넣지 않았다 (학생 말에만) */
  counted?: boolean;
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
  /** 방금 대답을 대답 수에 넣었는지 */
  counted: boolean;
}

/** 끊긴 통화 이어하기: 시작 응답 + 지금까지의 대화 */
export interface ResumeResponse extends StartResponse {
  history: ChatMessage[];
  turns: number;
  hintsLeft: number;
  sosLeft: number;
}

/** 한국어로 묻기 */
export interface SosResponse {
  answer: { en: string; ko: string };
  sosLeft: number;
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
  /** 대답 없이 끝나 연습 횟수를 돌려줬는지 */
  refunded: boolean;
}

export interface ReviewItem {
  id: string;
  en: string;
  ko: string;
  example: string;
  stage: number;
}
