import { test } from "node:test";
import assert from "node:assert/strict";
import { parentOf } from "./backParent.ts";

const href = (p: string, s = "") => {
  const t = parentOf(p, s);
  return t.kind === "to" ? t.href : t.kind;
};

test("홈은 종료, 로그인 · 가입은 기본 동작", () => {
  assert.equal(href("/home"), "exit");
  assert.equal(href("/home/"), "exit");
  for (const p of ["/", "/login", "/join", "/setup", "/password", "/auth/callback"]) assert.equal(href(p), "default");
});

test("탭 · 한 단계 화면은 홈으로", () => {
  for (const p of ["/family", "/me", "/recall", "/mock", "/phrasebook", "/history", "/call", "/topic/home"]) assert.equal(href(p), "/home");
});

test("연습 · 이어 말하기 · 스크립트는 그 주제 화면으로 (보던 답변 그대로)", () => {
  assert.equal(href("/practice/cafe", "?v=mine&start=2"), "/topic/cafe?v=mine");
  assert.equal(href("/practice/cafe", "?only=1,3"), "/topic/cafe");
  assert.equal(href("/recite/home", "?v=ai"), "/topic/home?v=ai");
  assert.equal(href("/practice/cafe", "?v=<script>"), "/topic/cafe");
  assert.equal(href("/topic/cafe/script"), "/topic/cafe");
});

test("모의고사 · 내 정보 · 운영자", () => {
  assert.equal(href("/mock/abc/report"), "/mock");
  assert.equal(href("/me/sound"), "/me");
  assert.equal(href("/me/family"), "/me");
  assert.equal(href("/admin"), "/me");
  assert.equal(href("/admin/cost"), "/admin");
  assert.equal(href("/admin/family/abc"), "/admin");
});
