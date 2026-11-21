import { test } from "node:test";
import assert from "node:assert/strict";
import { finalize, needsReview, scriptProblem, splitSentences, type CheckedSentence } from "./script.ts";

test("문장 끝(. ? !)과 줄바꿈으로 나눈다", () => {
  assert.deepEqual(splitSentences("I live in Seoul. Do you?  Wow!\nNew line here"), [
    "I live in Seoul.",
    "Do you?",
    "Wow!",
    "New line here",
  ]);
});

test("줄임말과 이니셜에서는 나누지 않는다", () => {
  assert.deepEqual(splitSentences("I met Mr. Kim at 7 a.m. yesterday. It was J. K. Rowling's book."), [
    "I met Mr. Kim at 7 a.m. yesterday.",
    "It was J. K. Rowling's book.",
  ]);
});

test("따옴표로 끝나는 문장도 나눈다", () => {
  assert.deepEqual(splitSentences('He said "Hello." Then he left.'), ['He said "Hello."', "Then he left."]);
});

test("영어가 없는 조각은 버린다", () => {
  assert.deepEqual(splitSentences("1. 2. Hello there."), ["Hello there."]);
});

test("분량 검사", () => {
  assert.equal(scriptProblem("  "), "영어 답변을 붙여 넣어 주세요.");
  assert.equal(scriptProblem("Hi."), null);
  assert.match(scriptProblem("a. ".repeat(16)) ?? "", /15문장까지/);
  assert.match(scriptProblem("x".repeat(2001)) ?? "", /2,000자까지/);
});

const s = (over: Partial<CheckedSentence>): CheckedSentence => ({
  original: "I live in a apartment.",
  verdict: "wrong",
  fix: "I live in an apartment.",
  why: "an",
  original_pronunciation: "아이 리브 인 어 아파트먼트",
  original_ko: "아파트에 살아요.",
  fix_pronunciation: "아이 리브 인 언 아파트먼트",
  fix_ko: "아파트에 살아요.",
  ...over,
});

test("고칠 문장: ok 이거나 수정안이 같으면 묻지 않는다", () => {
  assert.equal(needsReview(s({})), true);
  assert.equal(needsReview(s({ verdict: "ok" })), false);
  assert.equal(needsReview(s({ fix: "I live in a apartment." })), false);
  assert.equal(needsReview(s({ fix: null })), false);
});

test("고른 문장만 수정안으로 바꾼다", () => {
  const list = [s({}), s({ verdict: "ok", fix: null }), s({ verdict: "awkward" })];
  const out = finalize(list, { 0: true, 1: true, 2: false });
  assert.deepEqual(out.map((x) => [x.en, x.edited]), [
    ["I live in an apartment.", true],
    ["I live in a apartment.", false],
    ["I live in a apartment.", false],
  ]);
  assert.equal(out[0].pronunciation, "아이 리브 인 언 아파트먼트");
});
