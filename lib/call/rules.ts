// 전화영어 예외 처리 규칙 (서버·화면·테스트가 같이 쓴다. DB·AI 없이 동작한다)
import { RESUME_MINUTES } from "./levels.ts";
import type { ChatMessage } from "./types.ts";

/** 맨 뒤에서부터 연속으로 대답 수에 넣지 않은 학생 대답 수 */
export function trailingSkips(history: ChatMessage[]) {
  let n = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== "user") continue;
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
    .filter((m) => m.role === "user" && m.counted !== false)
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
) {
  return [
    { ...base, role: "user" as const, text: said, ko: null, correction: null, counted },
    { ...base, role: "tutor" as const, text: reply.text, ko: reply.ko, correction: reply.correction ?? null, counted: true },
  ];
}
