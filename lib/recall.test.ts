import { test } from "node:test";
import assert from "node:assert/strict";
import { countByTopic, nextRecallLabel, pickDue, sinceLabel, type DueRow } from "./recall.ts";

function row(id: string, due: string, set: { topic_id: string; source: "ai" | "mine"; level: string | null; archived_at?: string | null }, position = 0): DueRow {
  return {
    sentence_id: id,
    recall_step: 0,
    next_recall_on: due,
    sentences: { id, en: `en ${id}`, ko: `ko ${id}`, position, answer_sets: { archived_at: null, ...set } },
  };
}

test("지금 쓰는 답변의 문장만 복습한다 (보관된 내 스크립트 · 다른 등급 AI 답변은 빼고)", () => {
  const items = pickDue(
    [
      row("a", "2026-11-21", { topic_id: "home", source: "ai", level: "IH" }),
      row("b", "2026-11-21", { topic_id: "home", source: "ai", level: "AL" }),
      row("c", "2026-11-21", { topic_id: "cafe", source: "mine", level: null }),
      row("d", "2026-11-21", { topic_id: "cafe", source: "mine", level: null, archived_at: "2026-11-01" }),
    ],
    "IH",
  );
  assert.deepEqual(items.map((i) => i.id), ["c", "a"]);
});

test("오래 밀린 것 먼저, 같은 날이면 주제 · 문장 순서", () => {
  const items = pickDue(
    [
      row("x2", "2026-11-21", { topic_id: "home", source: "ai", level: "IH" }, 2),
      row("x1", "2026-11-21", { topic_id: "home", source: "ai", level: "IH" }, 1),
      row("old", "2026-11-18", { topic_id: "park", source: "ai", level: "IH" }),
    ],
    "IH",
  );
  assert.deepEqual(items.map((i) => i.id), ["old", "x1", "x2"]);
});

test("주제별 개수는 많은 것 먼저", () => {
  const items = pickDue(
    [
      row("a", "2026-11-21", { topic_id: "home", source: "ai", level: "IH" }),
      row("b", "2026-11-21", { topic_id: "cafe", source: "ai", level: "IH" }),
      row("c", "2026-11-21", { topic_id: "cafe", source: "ai", level: "IH" }, 1),
    ],
    "IH",
  );
  assert.deepEqual(countByTopic(items), [
    { topicId: "cafe", count: 2 },
    { topicId: "home", count: 1 },
  ]);
});

test("다음 복습 안내", () => {
  assert.equal(nextRecallLabel("2026-11-21", "2026-12-05"), "다음 복습: 14일 뒤 (12월 5일)");
  assert.equal(nextRecallLabel("2026-11-30", "2026-12-01"), "다음 복습: 내일 (12월 1일)");
  assert.equal(nextRecallLabel("2026-11-21", null), "네 번 모두 기억했어요 · 복습 끝");
});

test("외운 지 며칠째 복습인지 (1 · 3 · 7 · 14일 간격을 더한 값)", () => {
  assert.equal(sinceLabel(0), "외운 지 1일째 복습");
  assert.equal(sinceLabel(2), "외운 지 11일째 복습");
});
