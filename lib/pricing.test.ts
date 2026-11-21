import { test } from "node:test";
import assert from "node:assert/strict";
import { costUsd, krwPerUsd, projectMonth, toKrw, formatKrw, DEFAULT_KRW_PER_USD } from "./pricing.ts";

test("Haiku 5.5: 입력 $0.10 / 출력 $0.50 (100만 토큰당)", () => {
  assert.equal(costUsd("claude-haiku-5-5", { input_tokens: 1_000_000 }), 0.1);
  assert.equal(costUsd("claude-haiku-5-5", { output_tokens: 1_000_000 }), 0.5);
  // 수업 한 턴 정도: 입력 3천, 출력 150
  assert.equal(costUsd("claude-haiku-5-5", { input_tokens: 3000, output_tokens: 150 }), 0.000375);
});

test("캐시 읽기는 입력의 0.1배, 캐시 쓰기는 1.25배", () => {
  assert.equal(costUsd("claude-haiku-5-5", { cache_read_input_tokens: 1_000_000 }), 0.01);
  assert.equal(costUsd("claude-haiku-5-5", { cache_creation_input_tokens: 1_000_000 }), 0.125);
});

test("가격표에 없는 모델은 Opus 가격으로 계산한다", () => {
  assert.equal(costUsd("claude-unknown", { input_tokens: 1_000_000 }), 4);
});

test("비어 있거나 이상한 값은 0으로 본다", () => {
  assert.equal(costUsd("claude-haiku-5-5", {}), 0);
  assert.equal(costUsd("claude-haiku-5-5", { input_tokens: null, output_tokens: -5 }), 0);
});

test("환율: 환경 변수가 이상하면 기본 1,400원", () => {
  assert.equal(krwPerUsd(undefined), DEFAULT_KRW_PER_USD);
  assert.equal(krwPerUsd("abc"), DEFAULT_KRW_PER_USD);
  assert.equal(krwPerUsd("0"), DEFAULT_KRW_PER_USD);
  assert.equal(krwPerUsd("1350"), 1350);
  assert.equal(toKrw(3.44, 1400), 4816);
  assert.equal(formatKrw(4816), "4,816원");
});

test("월말 예상: 지금까지 쓴 돈을 날 수로 늘린다", () => {
  assert.equal(projectMonth(3000, 10, 30), 9000);
  assert.equal(projectMonth(3000, 0, 30), 3000);
});
