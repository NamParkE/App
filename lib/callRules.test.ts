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
