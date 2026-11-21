import { test } from "node:test";
import assert from "node:assert/strict";
import { isResumable, splitActive, trailingSkips } from "./call/rules.ts";
import type { ChatMessage } from "./call/types.ts";

const tutor = (text = "Q?"): ChatMessage => ({ role: "tutor", text });
const user = (counted = true): ChatMessage => ({ role: "user", text: "a", counted });

test("trailingSkips: 맨 뒤의 세지 않은 대답만 센다", () => {
  assert.equal(trailingSkips([]), 0);
  assert.equal(trailingSkips([tutor(), user(), tutor()]), 0);
  assert.equal(trailingSkips([tutor(), user(false), tutor()]), 1);
  assert.equal(trailingSkips([tutor(), user(false), tutor(), user(false), tutor()]), 2);
  // 중간에 센 대답이 있으면 거기서 멈춘다
  assert.equal(trailingSkips([tutor(), user(false), tutor(), user(), tutor(), user(false), tutor()]), 1);
  // 예전 기록(counted 없음)은 센 것으로 본다
  assert.equal(trailingSkips([tutor(), { role: "user", text: "a" }, tutor()]), 0);
});

test("isResumable: 30분 경계", () => {
  const now = Date.parse("2026-11-20T10:00:00Z");
  assert.equal(isResumable("2026-11-20T09:31:00Z", now), true);
  assert.equal(isResumable("2026-11-20T09:30:00Z", now), false);
});

test("splitActive: 가장 최근 하나만 이어하고 나머지는 닫는다", () => {
  const now = Date.parse("2026-11-20T10:00:00Z");
  const row = (id: string, last: string) => ({ id, topic_id: "t", turns: 0, started_at: last, last_active_at: last });
  const old = row("old", "2026-11-20T08:00:00Z");
  const a = row("a", "2026-11-20T09:50:00Z");
  const b = row("b", "2026-11-20T09:55:00Z");
  const { resumable, stale } = splitActive([old, a, b], now);
  assert.equal(resumable?.id, "b");
  assert.deepEqual(stale.map((r) => r.id).sort(), ["a", "old"]);
  assert.deepEqual(splitActive([old], now), { resumable: null, stale: [old] });
});

test("withOpening: 기록이 학생 말로 시작하면 선생님 첫 마디를 앞에 붙인다", async () => {
  const { withOpening } = await import("./call/rules.ts");
  assert.deepEqual(withOpening([user()], "Hi! How are you?").map((m) => m.role), ["tutor", "user"]);
  assert.equal(withOpening([], "Hi!")[0].text, "Hi!");
  const h = [tutor("Hello"), user()];
  assert.equal(withOpening(h, "Hi!"), h);
});

test("nextQuestionIndex: 센 대답 수만큼 질문이 지나간다 (끝을 넘지 않음)", async () => {
  const { nextQuestionIndex } = await import("./call/rules.ts");
  assert.equal(nextQuestionIndex([tutor()], 6), 0);
  assert.equal(nextQuestionIndex([tutor(), user(), tutor(), user(false), tutor()], 6), 1);
  assert.equal(nextQuestionIndex(Array(20).fill(user()), 6), 5);
});

test("repeatsLastTutor: 바로 앞 선생님 말과 같은 말인지 (문장부호 · 대소문자 무시)", async () => {
  const { repeatsLastTutor } = await import("./call/rules.ts");
  const h = [tutor("What do you like to eat?"), user()];
  assert.equal(repeatsLastTutor(h, "what do you like to eat"), true);
  assert.equal(repeatsLastTutor(h, "Nice! What did you eat yesterday?"), false);
  assert.equal(repeatsLastTutor([user()], "Hi"), false);
});

test("turnRows: 학생 · 선생님 두 줄의 칸이 같고 counted 가 비지 않는다 (빠지면 저장이 매번 실패했다)", async () => {
  const { turnRows } = await import("./call/rules.ts");
  const [u, t] = turnRows({ lesson_id: "l", user_id: "u" }, "I like it", false, { text: "Great!", ko: "좋아요", correction: null });
  assert.deepEqual(Object.keys(u).sort(), Object.keys(t).sort());
  assert.equal(u.counted, false);
  assert.equal(t.counted, true);
  assert.equal(u.role, "user");
  assert.equal(t.role, "tutor");
});
