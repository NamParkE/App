import { test } from "node:test";
import assert from "node:assert/strict";
import { compareSentences, normalizeWord, pairKey } from "./diff.ts";

const MODEL = "What I like most about my place is the living room.";

test("완전히 같은 문장은 100점", () => {
  const r = compareSentences(MODEL, "what i like most about my place is the living room");
  assert.equal(r.score, 100);
  assert.ok(r.model.every((t) => t.status === "ok"));
});

test("빠뜨린 단어와 바꿔 말한 단어를 찾는다", () => {
  const r = compareSentences(MODEL, "What I like most about my house is living room.");
  assert.deepEqual(r.missing, ["the"]);
  assert.deepEqual(r.replacements, [{ said: "house", model: "place" }]);
  assert.equal(r.model.find((t) => t.text === "the")?.status, "missing");
  assert.equal(r.model.find((t) => t.text === "place")?.status, "replaced");
  assert.equal(r.said.find((t) => t.text === "house")?.status, "replaced");
  // "is" 와 "living" 사이에 빈칸이 들어간다
  const texts = r.said.map((t) => (t.status === "gap" ? "_" : t.text));
  assert.deepEqual(texts.slice(7, 10), ["is", "_", "living"]);
});

test("괜찮은 바꿔 말하기는 점수에 반영된다", () => {
  const before = compareSentences(MODEL, "What I like most about my house is the living room.");
  const after = compareSentences(
    MODEL,
    "What I like most about my house is the living room.",
    new Set([pairKey({ said: "house", model: "place" })]),
  );
  assert.ok(after.score > before.score);
  assert.equal(after.score, 100);
  assert.equal(after.model.find((t) => t.text === "place")?.status, "swap_ok");
});

test("숫자와 축약형을 맞춰 비교한다", () => {
  assert.deepEqual(normalizeWord("12th"), ["twelfth"]);
  assert.deepEqual(normalizeWord("21st"), ["twenty", "first"]);
  assert.deepEqual(normalizeWord("It's"), ["it", "is"]);
  const r = compareSentences(
    "I live on the twelfth floor, and it is quiet.",
    "I live on the 12th floor and it's quiet",
  );
  assert.equal(r.score, 100);
});

test("빈 입력은 0점", () => {
  assert.equal(compareSentences(MODEL, "").score, 0);
});
