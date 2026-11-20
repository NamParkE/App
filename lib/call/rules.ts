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
