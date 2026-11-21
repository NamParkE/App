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
  /** talk: 보통 대화 · help: 말이 없을 때 리피가 먼저 건 말 · repeat: 학생이 따라 말한 것 */
  kind?: MessageKind;
  /** 리피 말에 붙는 고르기 칩 (예: sunny / rainy) */
  choices?: string[] | null;
  /** 리피 말에 붙는 첫마디 빈칸 문장 (예: "Today it is ___.") */
  starter?: string | null;
}

export type MessageKind = "talk" | "help" | "repeat";

/** 수업 단계 (대답 8번 안에서): 인사 · 근황 → 주제 대화 → 따라 말하기 → 마무리 */
export type LessonStage = "warmup" | "topic" | "repeat" | "wrapup";

/** 말이 없을 때 리피가 먼저 할 말 (지난 대답과 함께 미리 만든다) */
export interface HelpLines {
  /** 1단계: 쉬운 말로 다시 묻고 고르게 하기 */
  choice: string;
  choice_ko: string;
  choices: string[];
  /** 2단계: 첫마디 열어 주기 */
  starter_line: string;
  starter_ko: string;
  starter: string;
}

/** 따라 말하기: practice 는 수업 중 연습(대답 수에 넣지 않음, 서버 /api/call/repeat), stage 는 7번째 대답(보통 대답으로 보냄) */
export interface RepeatCard {
  mode: "practice" | "stage";
  sentence: string;
  ko: string;
  /** practice: 따라 말한 뒤 리피의 칭찬 한마디와 이어 갈 질문 */
  praise?: string;
  next?: string;
  next_ko?: string;
}

/** 서버가 lessons.pending_help 에 저장해 두는 것 */
export interface PendingHelp {
  help: HelpLines | null;
  repeat: RepeatCard | null;
}

export interface RepeatResponse {
  score: number;
  passed: boolean;
  skipped: boolean;
  reply: ChatMessage;
}

export interface StartResponse {
  lessonId: string;
  topic: { id: string; title_ko: string; title_en: string };
  level: number;
  expressions: PlanExpression[];
  opening: ChatMessage;
  usageLeft: number;
  /** 첫 마디 뒤 말이 없을 때 리피가 먼저 할 말 (이어하기에서는 지난 대답 때 준비한 것) */
  help?: HelpLines | null;
}

export interface TurnResponse {
  reply: ChatMessage;
  turns: number;
  done: boolean;
  /** 방금 대답을 대답 수에 넣었는지 */
  counted: boolean;
  /** 다음 대답이 속한 단계 (머리의 단계 표시) */
  stage: LessonStage;
  /** 말이 없을 때 리피가 먼저 할 말 (마지막 인사 뒤에는 null) */
  help: HelpLines | null;
  /** 따라 말하기 카드 */
  repeat: RepeatCard | null;
  /** 마지막 인사 때: 오늘 가장 잘 말한 문장 */
  best: string | null;
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
