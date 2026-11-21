// 실전 모의고사 문항 은행 (오픽 준비 고도화 ③). 실제 시험의 형식만 따르고 문구는 새로 썼다.
// 15문항: 1 자기소개 · 2~4 설문 활동 A · 5~7 사는 곳 · 8~10 설문 활동 B · 11~13 롤플레이 · 14~15 돌발.
// 8~15번은 7번 뒤 고른 난이도(쉽게 / 비슷하게 / 어렵게)에 따라 세 벌을 미리 만들어 둔다.

export type Tier = "low" | "mid" | "high";
export type Adjust = "easier" | "same" | "harder";
export const ADJUSTS: Adjust[] = ["easier", "same", "harder"];

export type MockKind = "intro" | "survey" | "unexpected" | "roleplay";
export type MockQuestion = {
  n: number; // 1~15
  kind: MockKind;
  /** 앱의 연습 주제 (리포트에서 "이 주제 외우기 연습으로"). 없으면 null */
  topicId: string | null;
  label: string; // 화면 표시: "설문 주제 · 카페 가기"
  en: string;
};
export type MockQuestions = { first: MockQuestion[]; rest: Record<Adjust, MockQuestion[]> };

// ───── 배경 설문 ─────

export const JOBS = [
  { id: "business", label: "사업 · 회사" },
  { id: "home-office", label: "재택근무 · 재택사업" },
  { id: "teacher", label: "교사 · 교육자" },
  { id: "none", label: "일 경험 없음" },
] as const;
export const STUDENT = [
  { id: "yes", label: "네, 학생이에요" },
  { id: "no", label: "아니요" },
] as const;
export const LIVING = [
  { id: "alone", label: "개인 주택이나 아파트에 혼자" },
  { id: "roommates", label: "친구 · 룸메이트와 함께" },
  { id: "family", label: "가족과 함께" },
  { id: "dorm", label: "학교 기숙사" },
] as const;

type Activity = { id: string; label: string; doing: string };
/** 설문 활동 (id 는 앱의 오픽 주제 id). doing: 질문에 넣는 영어 동명사구 */
export const ACTIVITY_GROUPS: { title: string; items: Activity[] }[] = [
  {
    title: "여가 활동",
    items: [
      { id: "movies", label: "영화 보기", doing: "watching movies" },
      { id: "concerts", label: "공연 · 콘서트 보기", doing: "going to concerts" },
      { id: "cafe", label: "카페 가기", doing: "going to cafés" },
      { id: "park", label: "공원 가기", doing: "going to parks" },
      { id: "beach", label: "해변 가기", doing: "going to the beach" },
      { id: "camping", label: "캠핑", doing: "going camping" },
      { id: "sports-watching", label: "스포츠 관람", doing: "watching sports games" },
      { id: "shopping", label: "쇼핑하기", doing: "going shopping" },
      { id: "tv-shows", label: "TV · 예능 보기", doing: "watching TV shows" },
      { id: "games", label: "게임하기", doing: "playing video games" },
      { id: "sns", label: "SNS · 인터넷", doing: "using social media" },
    ],
  },
  {
    title: "취미 · 관심사",
    items: [
      { id: "music", label: "음악 감상", doing: "listening to music" },
      { id: "instrument", label: "악기 연주", doing: "playing a musical instrument" },
      { id: "cooking", label: "요리하기", doing: "cooking" },
      { id: "reading", label: "독서", doing: "reading books" },
      { id: "singing", label: "노래 부르기", doing: "singing" },
    ],
  },
  {
    title: "운동",
    items: [
      { id: "walking", label: "걷기 · 조깅", doing: "walking and jogging" },
      { id: "swimming", label: "수영", doing: "swimming" },
      { id: "biking", label: "자전거 타기", doing: "riding a bike" },
      { id: "working-out", label: "헬스 · 요가", doing: "working out" },
      { id: "hiking", label: "등산", doing: "hiking" },
    ],
  },
  {
    title: "휴가 · 출장",
    items: [
      { id: "travel-domestic", label: "국내 여행", doing: "traveling within your country" },
      { id: "travel-abroad", label: "해외 여행", doing: "traveling abroad" },
      { id: "staycation", label: "집에서 보내는 휴가", doing: "spending your vacation at home" },
      { id: "business-trip", label: "출장", doing: "going on business trips" },
    ],
  },
];
export const ACTIVITIES: Activity[] = ACTIVITY_GROUPS.flatMap((g) => g.items);
/** 실제 시험처럼 활동을 모두 합쳐 이만큼 이상 고른다 */
export const MIN_ACTIVITIES = 12;

export type Survey = { job: string; student: string; living: string; activities: string[] };

export function validSurvey(s: Survey): boolean {
  const ids = new Set(ACTIVITIES.map((a) => a.id));
  return (
    JOBS.some((j) => j.id === s.job) &&
    STUDENT.some((j) => j.id === s.student) &&
    LIVING.some((j) => j.id === s.living) &&
    new Set(s.activities).size === s.activities.length &&
    s.activities.length >= MIN_ACTIVITIES &&
    s.activities.every((a) => ids.has(a))
  );
}

// ───── 난이도 ─────

/** 자가 평가 1~6 → 문항 난이도 */
export function tierFor(selfLevel: number): Tier {
  return selfLevel <= 2 ? "low" : selfLevel <= 4 ? "mid" : "high";
}
const TIERS: Tier[] = ["low", "mid", "high"];
export function shiftTier(t: Tier, a: Adjust): Tier {
  const i = TIERS.indexOf(t) + (a === "easier" ? -1 : a === "harder" ? 1 : 0);
  return TIERS[Math.max(0, Math.min(2, i))];
}

// ───── 질문 ─────

type SurveyType = "describe" | "favorite" | "routine" | "experience" | "compare";
/** 설문 주제 묶음(3문항)의 질문 종류: 어려울수록 경험 · 비교 */
const SURVEY_TYPES: Record<Tier, SurveyType[]> = {
  low: ["describe", "favorite", "routine"],
  mid: ["describe", "routine", "experience"],
  high: ["describe", "experience", "compare"],
};

function activityQuestion(a: Activity, t: SurveyType): string {
  const d = a.doing;
  switch (t) {
    case "describe":
      return `You indicated in the survey that you enjoy ${d}. Why do you like ${d}? Tell me about it in as much detail as possible.`;
    case "favorite":
      return `Who do you usually enjoy ${d} with? Tell me about that person and why you like doing it together.`;
    case "routine":
      return `How often do you enjoy ${d}, and what do you usually do from beginning to end? Describe a typical time in detail.`;
    case "experience":
      return `Tell me about a memorable experience you had while ${d}. What happened, and why was it so memorable?`;
    case "compare":
      return `How has the way you enjoy ${d} changed over the years? Compare what it was like in the past with how it is now.`;
  }
}

const HOME: Record<SurveyType, { en: string; topicId: string }> = {
  describe: { topicId: "home", en: "Tell me about the place where you live. What does it look like, and which room do you like the most?" },
  favorite: { topicId: "neighborhood", en: "Describe your neighborhood. What kinds of places are there, and what do you like most about it?" },
  routine: { topicId: "home", en: "What do you usually do at home on weekdays and on weekends? Walk me through a typical day at home." },
  experience: { topicId: "neighbors", en: "Has anything special or unexpected ever happened at your home or in your neighborhood? Tell me the whole story." },
  compare: { topicId: "home", en: "How has your home changed since you first moved in? Compare what it was like then with how it is now." },
};

type UnexpectedType = "describe" | "experience" | "compare" | "issue";
const UNEXPECTED_TYPES: Record<Tier, UnexpectedType[]> = {
  low: ["describe", "experience"],
  mid: ["experience", "compare"],
  high: ["compare", "issue"],
};
const UNEXPECTED: { topicId: string; label: string; q: Record<UnexpectedType, string> }[] = [
  {
    topicId: "weather",
    label: "날씨 · 계절",
    q: {
      describe: "Tell me about the weather in your country. What are the seasons like, and which one do you like best?",
      experience: "Tell me about a time when the weather affected your plans. What happened, and what did you do?",
      compare: "How has the weather in your country changed compared to when you were a child? Describe the differences.",
      issue: "Many people are worried about climate change. What changes have people in your country noticed, and what do you think should be done?",
    },
  },
  {
    topicId: "recycling",
    label: "재활용",
    q: {
      describe: "How do people recycle in your country? Describe what you do with trash and recyclables at home.",
      experience: "Tell me about a time you had trouble sorting or throwing away trash. What happened?",
      compare: "How has recycling in your country changed over the years? Compare how it was done before with how it is done now.",
      issue: "Some people say recycling rules are too complicated. What problems do people have with recycling, and how could they be solved?",
    },
  },
  {
    topicId: "holidays",
    label: "명절 · 휴일",
    q: {
      describe: "Tell me about a holiday that people in your country celebrate. What do people usually do on that day?",
      experience: "Tell me about a memorable holiday you spent with your family or friends. What did you do, and why do you remember it?",
      compare: "How have holidays in your country changed compared to when you were young? Describe what is different now.",
      issue: "Some people feel that holidays have become too commercial or stressful. What do you think about that, and why?",
    },
  },
  {
    topicId: "transportation",
    label: "교통수단",
    q: {
      describe: "What kinds of transportation do people in your country use? How do you usually get around?",
      experience: "Tell me about a time you had a problem while using public transportation. What happened, and how did you deal with it?",
      compare: "How has transportation in your city changed over the past several years? Compare the past with the present.",
      issue: "Traffic is a serious problem in many cities. What causes it in your area, and what could be done to make it better?",
    },
  },
  {
    topicId: "technology",
    label: "기술 · 인터넷",
    q: {
      describe: "What kinds of technology do you use every day? Tell me how you use them in your daily life.",
      experience: "Tell me about a time when a device or a website did not work the way you expected. What did you do?",
      compare: "How has the technology you use changed compared to ten years ago? Describe the biggest differences.",
      issue: "Some people worry that we depend too much on technology. What concerns do people have, and what is your opinion?",
    },
  },
  {
    topicId: "health",
    label: "건강",
    q: {
      describe: "What do you do to stay healthy? Tell me about your habits in as much detail as possible.",
      experience: "Tell me about a time when you were sick or did not feel well. What happened, and how did you get better?",
      compare: "How have people's ideas about staying healthy changed over the years? Compare the past with today.",
      issue: "Many people say they are too busy to take care of their health. Why do you think that is, and what could help?",
    },
  },
  {
    topicId: "restaurants",
    label: "식당 · 외식",
    q: {
      describe: "Tell me about a restaurant you like to go to. What is it like, and what do you usually order?",
      experience: "Tell me about a memorable meal you had at a restaurant. Who were you with, and what made it special?",
      compare: "How has eating out in your country changed in recent years? Compare how people ate out before and now.",
      issue: "Food delivery has become very popular. What are the good and bad points of ordering food so often?",
    },
  },
  {
    topicId: "phones",
    label: "휴대폰",
    q: {
      describe: "Tell me about your phone. What do you use it for most, and what do you like about it?",
      experience: "Tell me about a time you lost your phone or it stopped working. What happened, and what did you do?",
      compare: "How have the ways people use their phones changed over the years? Describe the main differences.",
      issue: "Some people say we spend too much time on our phones. What problems does this cause, and what do you think about it?",
    },
  },
];

const RP_INTRO = "I'd like to give you a situation and ask you to act it out. ";
const ROLEPLAYS: { label: string; ask: [string, string]; problem: [string, string]; experience: [string, string] }[] = [
  {
    label: "카페 약속",
    ask: ["rp-ask-cafe", "You want to meet a friend at a new café. Call the café and ask three or four questions about it."],
    problem: ["rp-problem", "I'm sorry, but there is a problem. When you arrive, the café is closed for a private event. Call your friend, explain the situation, and suggest two or three other plans."],
    experience: ["rp-experience", "That is the end of the situation. Have you ever had plans fall through because a place was closed or full? Tell me what happened and how you handled it."],
  },
  {
    label: "호텔",
    ask: ["rp-hotel", "You are planning a trip and want to stay at a hotel. Call the hotel and ask three or four questions about the rooms and services."],
    problem: ["rp-problem", "I'm sorry, but there is a problem. When you check in, the hotel has no record of your reservation. Explain the situation to the front desk and offer two or three solutions."],
    experience: ["rp-experience", "That is the end of the situation. Tell me about a time you had a problem at a place you stayed while traveling. What happened, and how was it solved?"],
  },
  {
    label: "친구와 영화",
    ask: ["rp-movie-friend", "Your friend wants to see a movie with you this weekend. Call your friend and ask three or four questions to make plans."],
    problem: ["rp-cancel", "I'm sorry, but there is a problem. Something came up and you cannot meet your friend. Call your friend, explain what happened, and suggest two or three alternatives."],
    experience: ["rp-experience", "That is the end of the situation. Have you ever had to cancel plans with a friend at the last minute? Tell me the whole story."],
  },
  {
    label: "배달 주문",
    ask: ["rp-delivery", "You want to order food from a new restaurant. Call the restaurant and ask three or four questions about the menu and delivery."],
    problem: ["rp-delivery", "I'm sorry, but there is a problem. Your order arrives, but it is the wrong food. Call the restaurant, explain the problem, and suggest two or three ways to fix it."],
    experience: ["rp-experience", "That is the end of the situation. Tell me about a time something you ordered or bought turned out to be wrong or damaged. What did you do?"],
  },
  {
    label: "병원 예약",
    ask: ["rp-doctor", "You are not feeling well and want to see a doctor. Call the clinic and ask three or four questions to make an appointment."],
    problem: ["rp-cancel", "I'm sorry, but there is a problem. You cannot make it to your appointment because of something urgent. Call the clinic, explain, and suggest two or three options."],
    experience: ["rp-experience", "That is the end of the situation. Tell me about a time you had to change an important appointment. Why did it happen, and how did it turn out?"],
  },
  {
    label: "여행사",
    ask: ["rp-travel-agency", "You want to take a trip overseas. Call a travel agency and ask three or four questions about a tour package."],
    problem: ["rp-problem", "I'm sorry, but there is a problem. Your flight has been canceled the day before your trip. Call the travel agency, explain the situation, and suggest two or three solutions."],
    experience: ["rp-experience", "That is the end of the situation. Have you ever had something go wrong while traveling? Tell me what happened from beginning to end."],
  },
];

export const INTRO_EN = "Let's start the interview now. Tell me a little bit about yourself.";

function pick<T>(list: T[], rand: () => number, not: T[] = []): T {
  const pool = list.filter((x) => !not.includes(x));
  const from = pool.length ? pool : list;
  return from[Math.floor(rand() * from.length) % from.length];
}

const q = (n: number, kind: MockKind, topicId: string | null, label: string, en: string): MockQuestion => ({ n, kind, topicId, label, en });

function surveyBlock(start: number, a: Activity, tier: Tier): MockQuestion[] {
  return SURVEY_TYPES[tier].map((t, i) => q(start + i, "survey", a.id, `설문 주제 · ${a.label}`, activityQuestion(a, t)));
}

/** 설문 · 자가 평가로 15문항을 만든다. 8~15번은 난이도 세 벌 */
export function buildExam(survey: Survey, selfLevel: number, rand: () => number = Math.random): MockQuestions {
  const base = tierFor(selfLevel);
  const chosen = ACTIVITIES.filter((a) => survey.activities.includes(a.id));
  const pool = chosen.length >= 2 ? chosen : ACTIVITIES;
  const actA = pick(pool, rand);
  const actB = pick(pool, rand, [actA]);
  const rp = pick(ROLEPLAYS, rand);
  const un = pick(UNEXPECTED, rand);

  const first: MockQuestion[] = [
    q(1, "intro", null, "자기소개", INTRO_EN),
    ...surveyBlock(2, actA, base),
    ...SURVEY_TYPES[base].map((t, i) => q(5 + i, "survey", HOME[t].topicId, "설문 주제 · 사는 곳", HOME[t].en)),
  ];
  const restFor = (a: Adjust): MockQuestion[] => {
    const tier = shiftTier(base, a);
    return [
      ...surveyBlock(8, actB, tier),
      q(11, "roleplay", rp.ask[0], `롤플레이 · ${rp.label}`, RP_INTRO + rp.ask[1]),
      q(12, "roleplay", rp.problem[0], `롤플레이 · ${rp.label}`, rp.problem[1]),
      q(13, "roleplay", rp.experience[0], `롤플레이 · ${rp.label}`, rp.experience[1]),
      ...UNEXPECTED_TYPES[tier].map((t, i) => q(14 + i, "unexpected", un.topicId, `돌발 · ${un.label}`, un.q[t])),
    ];
  };
  return { first, rest: { easier: restFor("easier"), same: restFor("same"), harder: restFor("harder") } };
}

/** 고른 난이도의 15문항 */
export function questionsFor(qs: MockQuestions, adjusted: Adjust | null): MockQuestion[] {
  return [...qs.first, ...qs.rest[adjusted ?? "same"]];
}
