// 전화영어 예외 처리 규칙 (서버·화면·테스트가 같이 쓴다. DB·AI 없이 동작한다)
import { LESSON_TURNS, RESUME_MINUTES } from "./levels.ts";
import type { ChatMessage, HelpLines, LessonStage, MessageKind, RepeatCard } from "./types.ts";

/** 맨 뒤에서부터 연속으로 대답 수에 넣지 않은 학생 대답 수 (따라 말하기 연습은 빼고) */
export function trailingSkips(history: ChatMessage[]) {
  let n = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== "user" || m.kind === "repeat") continue;
    if (m.counted !== false) break;
    n++;
  }
  return n;
}

/** 마지막으로 주고받은 지 30분이 안 지났으면 이어서 할 수 있다 */
export function isResumable(lastActiveAt: string, now = Date.now()) {
  return now - new Date(lastActiveAt).getTime() < RESUME_MINUTES * 60_000;
}

export interface ActiveLessonRow {
  id: string;
  topic_id: string;
  turns: number;
  started_at: string;
  last_active_at: string;
}

/** 진행 중인 수업을 이어서 할 것(가장 최근 하나)과 닫을 것으로 나눈다 */
export function splitActive(rows: ActiveLessonRow[], now = Date.now()) {
  const fresh = rows
    .filter((r) => isResumable(r.last_active_at, now))
    .sort((a, b) => b.last_active_at.localeCompare(a.last_active_at));
  const resumable = fresh[0] ?? null;
  // 이어서 할 하나만 남기고 나머지(시간이 지난 것, 혹시 여러 개 열린 것)는 닫는다
  return { resumable, stale: rows.filter((r) => r !== resumable) };
}

// ───── 같은 질문 되풀이 막기 ─────

/** 대화 기록이 선생님 첫 마디로 시작하지 않으면(첫 마디 저장이 늦거나 실패) 첫 마디를 앞에 붙인다 */
export function withOpening(history: ChatMessage[], opening: string): ChatMessage[] {
  if (history[0]?.role === "tutor") return history;
  return [{ role: "tutor", text: opening }, ...history];
}

/**
 * 학생이 지금까지 한 말 (대답 수에 넣은 것만, 오래된 것부터). 선생님이 이미 들은 내용을 다시 묻거나
 * 그 내용과 어긋나는 질문(비가 온다고 했는데 "맑아요?")을 하지 않도록 매 턴 따로 모아 보여 준다.
 */
export function studentFacts(history: ChatMessage[], max = 8): string[] {
  return history
    .filter((m) => m.role === "user" && m.counted !== false && m.kind !== "repeat")
    .map((m) => m.text.replace(/[<>"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200))
    .filter(Boolean)
    .slice(-max);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** 선생님의 새 말이 바로 앞 선생님 말과 사실상 같은지 (문장부호 · 대소문자 무시) */
export function repeatsLastTutor(history: ChatMessage[], reply: string) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "tutor") return norm(history[i].text) === norm(reply);
  }
  return false;
}

/**
 * 한 턴의 대화 두 줄 (학생 말 + 선생님 말). lesson_messages 에 한 번에 넣는다.
 * 두 줄의 칸이 같아야 한다: supabase-js 는 한쪽에만 있는 칸을 다른 줄에 NULL 로 넣어서,
 * 선생님 줄에 counted(NOT NULL)가 빠졌을 때 대화가 한 번도 저장되지 않았다.
 */
export function turnRows(
  base: { lesson_id: string; user_id: string },
  said: string,
  counted: boolean,
  reply: { text: string; ko: string | null; correction: unknown },
  /** 학생이 말하기 전에 리피가 먼저 건 도움 말 (말이 없을 때) */
  helpShown: { text: string; ko: string | null }[] = [],
  userKind: MessageKind = "talk",
) {
  return [
    ...helpShown.map((h) => ({ ...base, role: "tutor" as const, text: h.text, ko: h.ko, correction: null, counted: true, kind: "help" as MessageKind })),
    { ...base, role: "user" as const, text: said, ko: null, correction: null, counted, kind: userKind },
    { ...base, role: "tutor" as const, text: reply.text, ko: reply.ko, correction: reply.correction ?? null, counted: true, kind: "talk" as MessageKind },
  ];
}

/** 미리 준비한 도움 말 중 화면에 보여 준 것 (0~2단계) */
export function shownHelp(help: HelpLines | null | undefined, shown: number) {
  if (!help || shown <= 0) return [];
  const lines = [{ text: help.choice, ko: help.choice_ko }];
  if (shown >= 2) lines.push({ text: `${help.starter_line} ${help.starter}`, ko: help.starter_ko });
  return lines;
}

// ───── 코칭: 수업 단계 · 따라 말하기 ─────

/** n번째 대답이 속한 단계: 1~2 인사 · 근황, 3~6 주제 대화, 7 따라 말하기, 8 마무리 */
export function stageOf(answerNumber: number, total: number = LESSON_TURNS): LessonStage {
  if (answerNumber <= 2) return "warmup";
  if (answerNumber >= total) return "wrapup";
  if (answerNumber === total - 1) return "repeat";
  return "topic";
}

/** 지금까지 한 따라 말하기 연습 수 */
export function practiceRepeats(history: ChatMessage[]) {
  return history.filter((m) => m.role === "user" && m.kind === "repeat").length;
}

/** 첫마디 빈칸 문장이 제대로 된 모양인지 (빈칸 ___ 이 하나 이상) */
export function validStarter(s: string | null | undefined) {
  return !!s && /_{2,}/.test(s) && s.length <= 120;
}

/** 리피 첫 마디: 인사 · 근황 (계획의 첫 질문 대신. AI 호출 없이) */
export function warmupOpening(name: string) {
  const n = name.replace(/[^\p{L}\p{N} ]/gu, "").trim().slice(0, 20);
  return {
    text: `Hi${n ? ` ${n}` : ""}! It's Reppy. How was your day today?`,
    ko: `안녕${n ? ` ${n}` : ""}! 리피야. 오늘 하루 어땠어?`,
  };
}

export type RawTurn = {
  reply: string;
  choices: string[];
  starter: string | null;
  repeat: { sentence: string; ko: string; praise: string; next: string; next_ko: string } | null;
  help: { choice: string; choice_ko: string; choices: string[]; starter_line: string; starter_ko: string; starter: string } | null;
  best: string | null;
};

/** 첫 마디(인사 · 근황) 뒤 말이 없을 때 (AI 호출 없이) */
export const WARMUP_HELP: HelpLines = {
  choice: "Take your time! Was your day good, or was it busy?",
  choice_ko: "천천히 해요! 오늘 하루 좋았어요, 아니면 바빴어요?",
  choices: ["good", "busy"],
  starter_line: "Let's start together. Try saying:",
  starter_ko: "같이 시작해 봐요. 이렇게 말해 보세요:",
  starter: "My day was ___.",
};

/** 말이 없을 때 쓸 도움 말을 AI 가 제대로 주지 않았을 때 */
export const FALLBACK_HELP: HelpLines = {
  choice: "Take your time! Just a few words is fine.",
  choice_ko: "천천히 해요! 몇 단어만 말해도 괜찮아요.",
  choices: [],
  starter_line: "Let's start together. Try saying:",
  starter_ko: "같이 시작해 봐요. 이렇게 말해 보세요:",
  starter: "I think ___.",
};

const okChoices = (c: string[] | null | undefined) =>
  Array.isArray(c) && c.length === 2 && c.every((x) => typeof x === "string" && x.trim() && x.length <= 30) ? c.map((x) => x.trim()) : [];

/**
 * AI 대답을 화면에 쓸 모양으로 다듬는다.
 * - 따라 말하기: 7번째 대답 준비(stageSetup)면 stage 카드, 주제 대화 중 허용(practiceAllowed)이면 practice 카드, 아니면 없앤다.
 *   practice 를 없앨 때 AI 가 다음 질문을 카드에 넣어 뒀으면 대답 뒤에 붙인다 (질문 없이 끝나지 않게).
 * - 고르기 칩은 정확히 2개, 첫마디는 빈칸(___)이 있을 때만, 마지막 인사 뒤에는 도움 말 없음.
 */
export function shapeTurn(
  out: RawTurn,
  ctx: { isLast: boolean; counted: boolean; stageSetup: boolean; practiceAllowed: boolean; kids: boolean },
) {
  let reply = out.reply.trim();
  let repeat: RepeatCard | null = null;
  const r = out.repeat;
  const sentence = r?.sentence?.trim();
  if (r && sentence && ctx.counted && !ctx.isLast && ctx.stageSetup) {
    repeat = { mode: "stage", sentence, ko: r.ko };
  } else if (r && sentence && r.next?.trim() && ctx.counted && !ctx.isLast && ctx.practiceAllowed && !ctx.kids) {
    repeat = { mode: "practice", sentence, ko: r.ko, praise: r.praise?.trim() || "Great job!", next: r.next.trim(), next_ko: r.next_ko };
  } else if (r?.next?.trim() && !ctx.isLast && !reply.includes(r.next.trim())) {
    reply = `${reply} ${r.next.trim()}`;
  }
  let help: HelpLines | null = null;
  if (!ctx.isLast) {
    const h = out.help;
    help =
      h && h.choice?.trim() && h.starter_line?.trim() && validStarter(h.starter)
        ? { ...h, choices: okChoices(h.choices) }
        : FALLBACK_HELP;
  }
  return {
    reply,
    choices: okChoices(out.choices),
    starter: validStarter(out.starter) ? out.starter : null,
    repeat,
    help,
    best: ctx.isLast && out.best?.trim() ? out.best.trim() : null,
  };
}
