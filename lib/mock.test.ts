import { test } from "node:test";
import assert from "node:assert/strict";
import { monthStartKst, nextRefillLabel, normalizeReport } from "./mock.ts";
import { ACTIVITIES, buildExam, MIN_ACTIVITIES, questionsFor, shiftTier, tierFor, validSurvey } from "./mockBank.ts";

const survey = { job: "business", student: "no", living: "family", activities: ACTIVITIES.slice(0, MIN_ACTIVITIES).map((a) => a.id) };

test("배경 설문: 활동은 12개 이상, 목록에 있는 것만, 중복 없이", () => {
  assert.equal(validSurvey(survey), true);
  assert.equal(validSurvey({ ...survey, activities: survey.activities.slice(1) }), false);
  assert.equal(validSurvey({ ...survey, activities: [...survey.activities.slice(1), "nope"] }), false);
  assert.equal(validSurvey({ ...survey, activities: [...survey.activities, survey.activities[0]] }), false);
  assert.equal(validSurvey({ ...survey, job: "astronaut" }), false);
});

test("15문항: 자기소개 → 설문 → 사는 곳 → 설문 → 롤플레이 → 돌발, 번호 1~15", () => {
  let seed = 0.3;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280 / 233280);
  const qs = buildExam(survey, 4, rand);
  for (const adj of ["easier", "same", "harder"] as const) {
    const all = questionsFor(qs, adj);
    assert.deepEqual(all.map((x) => x.n), Array.from({ length: 15 }, (_, i) => i + 1));
    assert.deepEqual(
      all.map((x) => x.kind),
      ["intro", ...Array(9).fill("survey"), "roleplay", "roleplay", "roleplay", "unexpected", "unexpected"],
    );
    assert.ok(all.every((x) => x.en.length > 20 && !x.en.includes("undefined")));
  }
  // 설문 주제는 고른 활동에서, 2~4번과 8~10번은 서로 다른 활동
  const a = qs.first[1].topicId;
  const b = qs.rest.same[0].topicId;
  assert.ok(survey.activities.includes(a!) && survey.activities.includes(b!) && a !== b);
  // 1~7번은 난이도와 상관없이 같고, 8~15번은 난이도마다 다를 수 있다
  assert.notDeepEqual(qs.rest.easier.map((x) => x.en), qs.rest.harder.map((x) => x.en));
});

test("난이도: 자가 평가 1~2 쉬움, 3~4 중간, 5~6 어려움, 다시 고르면 한 단계", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(tierFor), ["low", "low", "mid", "mid", "high", "high"]);
  assert.equal(shiftTier("mid", "harder"), "high");
  assert.equal(shiftTier("high", "harder"), "high");
  assert.equal(shiftTier("low", "easier"), "low");
});

test("리포트 다듬기: 모르는 등급 · 넓은 범위 · 이상한 문항 번호 · 점수 범위", () => {
  const r = normalizeReport({
    grade: "IM2",
    low: "NH",
    high: "AL",
    headline: "좋아요",
    areas: [{ key: "length", score: 140 }, { key: "tense", score: -5 }],
    tips: ["a", "b", "c", "d"],
    items: [
      { n: 3, verdict: "weak", good: "", fix: "", better: "" },
      { n: 3, verdict: "good", good: "", fix: "", better: "" },
      { n: 99, verdict: "good", good: "", fix: "", better: "" },
      { n: 1, verdict: "great", good: "", fix: "", better: "" },
    ],
  });
  assert.equal(r.grade, "IM2");
  assert.equal(r.low, "IM1");
  assert.equal(r.high, "IM3");
  assert.deepEqual(r.areas.map((a) => a.score), [100, 0, 0, 0]);
  assert.deepEqual(r.items.map((i) => [i.n, i.verdict]), [[1, "ok"], [3, "weak"]]);
  assert.equal(r.tips.length, 3);
  assert.equal(normalizeReport({ ...r, grade: "S", low: "?", high: "?", areas: [], items: [] }).grade, "IL");
});

test("이번 달 1일(한국 시간)과 다시 채우는 날", () => {
  // 한국 시간 2026-12-01 00:30 = UTC 11-30 15:30
  const t = Date.parse("2026-11-30T15:30:00Z");
  assert.equal(monthStartKst(t), "2026-11-30T15:00:00.000Z");
  assert.equal(nextRefillLabel(t), "1월 1일");
  assert.equal(nextRefillLabel(Date.parse("2026-11-21T03:00:00Z")), "12월 1일");
});
