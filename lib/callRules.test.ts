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

test("studentFacts: 센 학생 대답만, 오래된 것부터, 꺾쇠 · 따옴표는 지운다", async () => {
  const { studentFacts } = await import("./call/rules.ts");
  const h: ChatMessage[] = [
    tutor("How is the weather?"),
    { role: "user", text: "It is raining", counted: true },
    tutor("Do you like sun?"),
    { role: "user", text: "asdf qwer", counted: false },
    { role: "user", text: 'I like sun more than <rain> "really"', counted: true },
  ];
  assert.deepEqual(studentFacts(h), ["It is raining", "I like sun more than rain really"]);
  assert.equal(studentFacts(Array(12).fill({ role: "user", text: "a" }), 8).length, 8);
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
  const withHelp = turnRows({ lesson_id: "l", user_id: "u" }, "Rainy", true, { text: "Nice!", ko: null, correction: null }, [{ text: "Sunny or rainy?", ko: "맑아요, 비 와요?" }]);
  assert.equal(withHelp.length, 3);
  assert.equal(withHelp[0].kind, "help");
  for (const row of withHelp) assert.deepEqual(Object.keys(row).sort(), Object.keys(withHelp[1]).sort());
  assert.equal(u.counted, false);
  assert.equal(t.counted, true);
  assert.equal(u.role, "user");
  assert.equal(t.role, "tutor");
});

test("stageOf: 대답 1~2 인사, 3~6 주제, 7 따라 말하기, 8 마무리", async () => {
  const { stageOf } = await import("./call/rules.ts");
  assert.deepEqual([1, 2, 3, 6, 7, 8].map((n) => stageOf(n, 8)), ["warmup", "warmup", "topic", "topic", "repeat", "wrapup"]);
});

test("따라 말하기 연습은 엉뚱한 대답(건너뛴 대답) · 학생이 한 말 모음에 들어가지 않는다", async () => {
  const { trailingSkips, practiceRepeats, studentFacts } = await import("./call/rules.ts");
  const h: ChatMessage[] = [
    tutor(),
    { role: "user", text: "Rainy", counted: true },
    tutor(),
    { role: "user", text: "It's raining a lot today", counted: false, kind: "repeat" },
  ];
  assert.equal(trailingSkips(h), 0);
  assert.equal(practiceRepeats(h), 1);
  assert.deepEqual(studentFacts(h), ["Rainy"]);
});

test("첫마디 빈칸 문장 · 인사 첫 마디", async () => {
  const { validStarter, warmupOpening } = await import("./call/rules.ts");
  assert.equal(validStarter("Today it is ___."), true);
  assert.equal(validStarter("Today it is rainy."), false);
  assert.equal(validStarter(null), false);
  assert.equal(warmupOpening("민지").text, "Hi 민지! It's Reppy. How was your day today?");
  assert.equal(warmupOpening("<b>").text, "Hi b! It's Reppy. How was your day today?");
  assert.equal(warmupOpening("").text, "Hi! It's Reppy. How was your day today?");
});

test("shapeTurn: 따라 말하기 카드 · 칩 · 첫마디 · 도움 말 다듬기", async () => {
  const { shapeTurn, FALLBACK_HELP } = await import("./call/rules.ts");
  const help = { choice: "Is it sunny or rainy?", choice_ko: "", choices: ["sunny", "rainy"], starter_line: "Try saying:", starter_ko: "", starter: "Today it is ___." };
  const rep = { sentence: "It's raining a lot today.", ko: "", praise: "Perfect!", next: "What do you do when it rains?", next_ko: "" };
  const base = { reply: "Great job!", choices: [], starter: null, repeat: rep, help, best: "x" };
  const ctx = { isLast: false, counted: true, stageSetup: false, practiceAllowed: true, kids: false };

  // 주제 대화 중 허용 → 연습 카드, 다음 질문은 카드에
  const a = shapeTurn(base, ctx);
  assert.equal(a.repeat?.mode, "practice");
  assert.equal(a.reply, "Great job!");
  assert.equal(a.best, null);
  assert.deepEqual(a.help?.choices, ["sunny", "rainy"]);

  // 횟수를 다 썼으면 카드는 없애고 다음 질문을 대답 뒤에 붙인다
  const b = shapeTurn(base, { ...ctx, practiceAllowed: false });
  assert.equal(b.repeat, null);
  assert.equal(b.reply, "Great job! What do you do when it rains?");

  // 7번째 대답 준비 → stage 카드
  assert.equal(shapeTurn(base, { ...ctx, stageSetup: true, practiceAllowed: false }).repeat?.mode, "stage");
  // 세지 않은 대답(막힘)에는 카드가 없다
  assert.equal(shapeTurn(base, { ...ctx, counted: false }).repeat, null);

  // 칩은 정확히 2개, 첫마디는 빈칸이 있을 때만, 도움 말이 이상하면 기본 도움 말
  const c = shapeTurn({ ...base, repeat: null, choices: ["a", "b", "c"], starter: "No blank.", help: { ...help, starter: "no blank" } }, ctx);
  assert.deepEqual(c.choices, []);
  assert.equal(c.starter, null);
  assert.equal(c.help, FALLBACK_HELP);

  // 마지막 인사: 도움 말 없음, 가장 잘 말한 문장
  const d = shapeTurn(base, { ...ctx, isLast: true });
  assert.equal(d.help, null);
  assert.equal(d.repeat, null);
  assert.equal(d.best, "x");
});

test("shownHelp: 보여 준 도움 말 단계만 기록한다", async () => {
  const { shownHelp, FALLBACK_HELP } = await import("./call/rules.ts");
  assert.equal(shownHelp(FALLBACK_HELP, 0).length, 0);
  assert.equal(shownHelp(FALLBACK_HELP, 1).length, 1);
  assert.equal(shownHelp(FALLBACK_HELP, 2)[1].text, "Let's start together. Try saying: I think ___.");
  assert.equal(shownHelp(null, 2).length, 0);
});
