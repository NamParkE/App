import { test } from "node:test";
import assert from "node:assert/strict";
import { compareLine, mmss, parseOnly, scoreRecital } from "./recite.ts";

const S = [
  { position: 0, en: "I live in an apartment in Seoul." },
  { position: 1, en: "It has three rooms." },
  { position: 2, en: "My favorite place is the living room, which gets a lot of sunlight." },
];

test("다 말하면 100점, 막힌 문장 없음", () => {
  const r = scoreRecital(S, "I live in an apartment in Seoul. It has three rooms. My favorite place is the living room which gets a lot of sunlight");
  assert.equal(r.score, 100);
  assert.deepEqual(r.stuck, []);
  assert.deepEqual(r.sentences.map((s) => s.pct), [100, 100, 100]);
});

test("한 문장을 통째로 빼먹으면 그 문장만 막힘", () => {
  const r = scoreRecital(S, "I live in an apartment in Seoul. My favorite place is the living room which gets a lot of sunlight");
  assert.deepEqual(r.stuck, [1]);
  assert.equal(r.sentences[1].pct, 0);
  assert.ok(r.score < 100 && r.score > 70);
});

test("몇 단어만 빠지면 비율로 판단 (80% 미만이면 막힘)", () => {
  const r = scoreRecital(S, "I live in an apartment in Seoul. It has three rooms. My favorite place is the living room which gets sunlight");
  // 13단어 중 3단어(a lot of) 빠짐 → 77%
  assert.equal(r.sentences[2].pct, 77);
  assert.deepEqual(r.stuck, [2]);
  assert.deepEqual(
    r.sentences[2].tokens.filter((t) => t.status === "missing").map((t) => t.text),
    ["a", "lot", "of"],
  );
});

test("위치 순서대로 나눈다 (들어온 순서와 상관없이)", () => {
  const r = scoreRecital([S[2], S[0], S[1]], "I live in an apartment in Seoul");
  assert.deepEqual(r.sentences.map((s) => s.position), [0, 1, 2]);
  assert.deepEqual(r.stuck, [1, 2]);
});

test("아무 말도 안 하면 0점, 모두 막힘", () => {
  const r = scoreRecital(S, "");
  assert.equal(r.score, 0);
  assert.deepEqual(r.stuck, [0, 1, 2]);
});

test("시간 · 비교 문구 · ?only=", () => {
  assert.equal(mmss(114), "1:54");
  assert.equal(mmss(5), "0:05");
  assert.equal(compareLine({ score: 87 }, { score: 79, durationSec: 141 }), "지난번 79% · 2:21 보다 나아졌어요");
  assert.match(compareLine({ score: 87 }, null), /첫 이어 말하기/);
  assert.deepEqual(parseOnly("2,5,x,2,-1"), [2, 5]);
  assert.deepEqual(parseOnly(undefined), []);
});
