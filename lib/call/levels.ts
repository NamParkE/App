// 전화영어 레벨 (화면과 서버가 같이 쓴다). 설계: docs/design/vocab-call-mode.md §2

export interface CallLevel {
  n: number;
  name: string;
  band: string;
  sample: string;
  /** 선생님 말 기본 듣기 속도 (사용자가 속도를 따로 고르지 않았을 때) */
  rate: number;
  /** 자막(영어 글자) 기본으로 보이기 */
  captions: boolean;
  /** 힌트에 한글 설명을 붙인다 */
  koreanHints: boolean;
  /** 선생님에게 주는 말하기 규칙 (영어) */
  guide: string;
}

export const CALL_LEVELS: CallLevel[] = [
  {
    n: 1, name: "첫걸음", band: "아이 수준", sample: "I like apples.", rate: 0.7, captions: true, koreanHints: true,
    guide: "Pre-A1, like talking to a young child. Use 3-6 word sentences and only very common words (colors, food, family, animals, numbers). Ask yes/no or either-or questions. Praise often. Speak one idea at a time.",
  },
  {
    n: 2, name: "기초", band: "A1", sample: "I get up at seven every day.", rate: 0.75, captions: true, koreanHints: true,
    guide: "A1. Use 6-9 word sentences in the simple present. Everyday words only. Ask one simple question at a time and give a model answer if the student struggles.",
  },
  {
    n: 3, name: "초급", band: "A2", sample: "Last weekend, I went to the park with my sister.", rate: 0.8, captions: true, koreanHints: true,
    guide: "A2. Use 8-12 word sentences. Use simple past and future. Ask about short experiences. Keep vocabulary common and concrete.",
  },
  {
    n: 4, name: "중급", band: "B1", sample: "I prefer coffee because it helps me focus at work.", rate: 0.85, captions: false, koreanHints: true,
    guide: "B1. Use 10-15 word sentences. Ask for reasons and opinions (why, how). Introduce one useful expression at a time.",
  },
  {
    n: 5, name: "중급+", band: "B1+", sample: "Compared to last year, I have been cooking at home a lot more.", rate: 0.9, captions: false, koreanHints: false,
    guide: "B1+. Natural sentences up to about 18 words. Ask follow-up questions, comparisons and details about experiences.",
  },
  {
    n: 6, name: "중상급", band: "B2", sample: "I ended up putting off the trip until things calmed down.", rate: 1, captions: false, koreanHints: false,
    guide: "B2. Natural conversational English at normal speed, including phrasal verbs and some abstract topics. Challenge the student to explain and justify.",
  },
  {
    n: 7, name: "고급", band: "C1", sample: "Honestly, it was a blessing in disguise that the plan fell through.", rate: 1, captions: false, koreanHints: false,
    guide: "C1. Rich, nuanced English with idioms and collocations. Debate gently, ask for nuance, and expect extended answers.",
  },
  {
    n: 8, name: "원어민", band: "C2", sample: "Yeah, no, that whole thing was kind of a mess, to be fair.", rate: 1.1, captions: false, koreanHints: false,
    guide: "C2 / native. Talk exactly like a native friend: fast, casual, idioms, humor, contractions and slang where natural. Do not simplify.",
  },
];

export function callLevel(n: number): CallLevel {
  return CALL_LEVELS[Math.min(Math.max(Math.round(n), 1), 8) - 1];
}

/** 수업 규칙 (설계 §2, §3) */
export const LESSON_TURNS = 8; // 사용자 대답 수
export const MIN_TURNS_FOR_REPORT = 4;
export const MAX_HINTS = 3;
export const LESSON_USAGE_COST = 5; // 수업 시작 때 하루 사용량에서 차감
export const LEVEL_UP_SCORE = 80;
export const LEVEL_UP_COUNT = 3;
export const LEVEL_DOWN_SCORE = 50;
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100];
/** 엉뚱한 대답을 연속으로 세지 않는 최대 횟수. 그다음 대답은 그냥 센다 (무한 반복 방지) */
export const MAX_SKIPS = 2;
/** 수업당 "한국어로 묻기" 횟수 (힌트와 따로) */
export const MAX_SOS = 2;
/** 끊긴 통화를 이어서 할 수 있는 시간 (마지막으로 주고받은 때부터) */
export const RESUME_MINUTES = 30;
