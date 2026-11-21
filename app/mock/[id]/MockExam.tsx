"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CloseIcon, SpeakerIcon, SpinnerIcon } from "@/components/Icons";
import { canListen, canSpeak, speak, stopSpeaking } from "@/lib/speech";
import { useLongListen } from "@/lib/useLongListen";
import { useBackOverride } from "@/lib/back";
import { clock, MOCK_ADJUST_AFTER, MOCK_COUNT, MOCK_REPLAYS, type MockAnswer } from "@/lib/mock";
import type { Adjust, MockQuestions } from "@/lib/mockBank";

type Stage = "listen" | "answer" | "adjust" | "finishing" | "failed";

/**
 * 모의고사 진행: 질문을 소리로 들려주고(글은 보여 주지 않음) 끝나면 바로 받아 적기 시작.
 * 문항마다 한 번 다시 듣기, 7번 뒤 난이도 다시 고르기, 전체 40분. 시험 중에는 점수 · 받아 적은 글을 보여 주지 않는다.
 */
export default function MockExam({
  id,
  questions,
  totalSec,
  elapsedAtLoad,
}: {
  id: string;
  questions: MockQuestions;
  totalSec: number;
  elapsedAtLoad: number;
}) {
  const router = useRouter();
  const rec = useLongListen();
  const [idx, setIdx] = useState(0);
  const [adjusted, setAdjusted] = useState<Adjust | null>(null);
  const [pick, setPick] = useState<Adjust>("same");
  const [stage, setStage] = useState<Stage>("listen");
  const [replays, setReplays] = useState(0);
  const [now, setNow] = useState(0);
  const [exit, setExit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [listenOk, setListenOk] = useState(true);
  const [speakOk, setSpeakOk] = useState(true);

  const loadedAt = useRef(0);
  const answerStart = useRef(0);
  const answers = useRef<MockAnswer[]>([]);
  const finishing = useRef(false);

  // 시험 중 휴대폰 뒤로가기: 바로 나가지 않고 "시험을 그만둘까요?" (창이 열려 있으면 닫는다)
  useBackOverride(stage !== "finishing", () => setExit((e) => !e));

  const list = [...questions.first, ...(adjusted ? questions.rest[adjusted] : [])];
  const q = list[idx];
  const remaining = loadedAt.current ? totalSec - elapsedAtLoad - (now - loadedAt.current) / 1000 : totalSec - elapsedAtLoad;

  const beginAnswer = useCallback(() => {
    answerStart.current = Date.now();
    setStage("answer");
    if (canListen()) rec.start();
  }, [rec]);

  const playQuestion = useCallback(
    (text: string, then: () => void) => {
      setStage("listen");
      if (!canSpeak()) {
        then();
        return;
      }
      speak(text, { rate: 0.95, onEnd: then });
    },
    [],
  );

  const finish = useCallback(
    async (adj: Adjust | null) => {
      if (finishing.current) return;
      finishing.current = true;
      stopSpeaking();
      setStage("finishing");
      setError(null);
      const res = await fetch(`/api/mock/${id}/finish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ adjusted: adj, answers: answers.current }),
      }).catch(() => null);
      if (!res?.ok) {
        const msg = (await res?.json().catch(() => null))?.message as string | undefined;
        setError(msg ?? "인터넷 연결을 확인하고 다시 눌러 주세요.");
        setStage("failed");
        finishing.current = false;
        return;
      }
      router.replace(`/mock/${id}/report`);
    },
    [id, router],
  );

  /** 지금 문항의 답을 저장하고 다음으로 (7번 뒤에는 난이도 고르기, 15번 뒤에는 마치기) */
  const saveAndNext = useCallback(
    async (timeUp = false) => {
      if (!q || finishing.current) return;
      stopSpeaking();
      const said = listenOk ? await rec.stop() : typed.trim();
      const sec = answerStart.current ? (Date.now() - answerStart.current) / 1000 : 0;
      answers.current = [...answers.current.filter((a) => a.n !== q.n), { n: q.n, said: said.slice(0, 3000), sec: Math.round(sec), replays }];
      setTyped("");
      answerStart.current = 0;
      if (timeUp || q.n >= MOCK_COUNT) {
        void finish(adjusted);
        return;
      }
      if (q.n === MOCK_ADJUST_AFTER && !adjusted) {
        setStage("adjust");
        return;
      }
      setReplays(0);
      setIdx((i) => i + 1);
    },
    [q, listenOk, rec, typed, replays, finish, adjusted],
  );

  // 처음 열 때
  useEffect(() => {
    loadedAt.current = Date.now();
    setNow(Date.now());
    setListenOk(canListen());
    setSpeakOk(canSpeak());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(t);
      stopSpeaking();
    };
  }, []);

  // 문항이 바뀌면 질문을 들려주고, 다 들려주면 받아 적기 시작
  useEffect(() => {
    if (!q || stage === "adjust" || finishing.current) return;
    playQuestion(q.en, beginAnswer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, adjusted]);

  // 40분이 지나면 지금 문항까지 저장하고 마친다
  useEffect(() => {
    if (now && remaining <= 0 && !finishing.current && stage !== "failed") void saveAndNext(true);
  }, [now, remaining, stage, saveAndNext]);

  // 시험 중에 창을 닫으려 하면 한 번 묻는다
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!finishing.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  async function replay() {
    if (!q || replays >= MOCK_REPLAYS || stage !== "answer") return;
    setReplays((r) => r + 1);
    if (listenOk) await rec.stop();
    playQuestion(q.en, () => {
      setStage("answer");
      if (listenOk) rec.resume();
    });
  }

  function chooseAdjust() {
    setAdjusted(pick);
    setReplays(0);
    setIdx((i) => i + 1);
    setStage("listen");
  }

  function quit() {
    finishing.current = true;
    stopSpeaking();
    void rec.stop();
    router.push("/home");
  }

  const n = q?.n ?? MOCK_COUNT;
  const header = (
    <>
      <div className="topbar" style={{ gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, flexGrow: 1 }}>
          문항 <span className="en">{stage === "adjust" ? MOCK_ADJUST_AFTER : n}</span>{" "}
          <span className="muted" style={{ fontWeight: 400 }}>/ {MOCK_COUNT}{stage === "adjust" ? " 끝" : ""}</span>
        </span>
        <span className="en" style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }} aria-label="남은 시간">
          남은 시간 {clock(remaining)}
        </span>
        <button type="button" className="icon-btn" style={{ justifyContent: "center" }} aria-label="시험 그만두기" onClick={() => setExit(true)}>
          <CloseIcon />
        </button>
      </div>
      <div className="track" aria-hidden="true">
        <div style={{ width: `${((stage === "adjust" ? MOCK_ADJUST_AFTER : n - 1) / MOCK_COUNT) * 100}%` }} />
      </div>
    </>
  );

  const exitSheet = exit ? (
    <div className="sheet-backdrop" onClick={() => setExit(false)}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="시험 그만두기" onClick={(e) => e.stopPropagation()}>
        <h2 className="section-title">시험을 그만둘까요?</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
          지금 나가면 이번 시험은 저장되지 않고 리포트도 만들지 않아요. 횟수는 차감하지 않아요.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setExit(false)}>계속 보기</button>
        <button type="button" className="btn btn-outline" onClick={quit}>그만두기</button>
      </div>
    </div>
  ) : null;

  // ───── 마치는 중 · 저장 실패 ─────
  if (stage === "finishing" || stage === "failed") {
    return (
      <main className="screen">
        <div className="pad" style={{ justifyContent: "center", alignItems: "center", textAlign: "center", gap: 14 }}>
          {stage === "finishing" ? <SpinnerIcon color="var(--accent)" /> : null}
          <h1 className="title" style={{ fontSize: 22 }}>{stage === "finishing" ? "수고했어요!" : "저장하지 못했어요"}</h1>
          <p className="subtitle" style={{ fontSize: 14 }}>
            {stage === "finishing" ? "답변을 저장하고 있어요." : error}
          </p>
        </div>
        {stage === "failed" && (
          <div className="bottom">
            <button type="button" className="btn btn-primary" onClick={() => void finish(adjusted)}>다시 저장하기</button>
          </div>
        )}
      </main>
    );
  }

  // ───── 7번 뒤 난이도 다시 고르기 ─────
  if (stage === "adjust") {
    const opts: { id: Adjust; label: string }[] = [
      { id: "easier", label: "더 쉬운 질문" },
      { id: "same", label: "비슷한 질문" },
      { id: "harder", label: "더 어려운 질문" },
    ];
    return (
      <main className="screen">
        <div className="pad" style={{ gap: 12 }}>
          {header}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 12 }}>
            <h1 className="title" style={{ fontSize: 22 }}>남은 문항의 난이도를 골라요</h1>
            <p className="subtitle" style={{ fontSize: 14 }}>지금까지 어땠는지 떠올려 보세요. 고른 대로 8번부터 문항이 바뀌어요.</p>
          </div>
          {opts.map((o) => (
            <button key={o.id} type="button" className="choice" aria-pressed={pick === o.id} onClick={() => setPick(o.id)} style={{ padding: "12px 14px", fontSize: 15 }}>
              {o.label}
            </button>
          ))}
          <section className="card" style={{ gap: 4, padding: 14 }}>
            <span className="label">남은 순서</span>
            <span style={{ fontSize: 13, lineHeight: 1.6 }}>8 ~ 10 설문 주제 · 11 ~ 13 롤플레이 · 14 ~ 15 돌발</span>
          </section>
        </div>
        <div className="bottom" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <button type="button" className="btn btn-primary" onClick={chooseAdjust}>이어서 8번 문항</button>
          <span className="muted" style={{ fontSize: 12 }}>고르는 동안에도 시간이 흘러요</span>
        </div>
        {exitSheet}
      </main>
    );
  }

  // ───── 문항 ─────
  const listening = stage === "listen";
  const answerSec = stage === "answer" && answerStart.current ? (now - answerStart.current) / 1000 : 0;
  return (
    <main className="screen">
      <div className="pad" style={{ gap: 12 }}>
        {header}
        <section className="card" style={{ alignItems: "center", gap: 14, padding: "22px 18px", textAlign: "center" }}>
          <span className="notice" style={{ padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>{q?.label}</span>
          <div
            aria-hidden="true"
            style={{ width: 76, height: 76, borderRadius: 999, background: listening ? "var(--accent-soft)" : "var(--line-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <SpeakerIcon size={34} color={listening ? "var(--accent)" : "var(--ink)"} />
          </div>
          <span className="muted" style={{ fontSize: 13 }} aria-live="polite">
            {listening ? "질문을 듣는 중이에요" : "질문은 소리로만 나와요"}
          </span>
          {!speakOk && q && (
            <span className="en" lang="en" style={{ fontSize: 14, lineHeight: 1.5 }}>{q.en}</span>
          )}
          <button
            type="button"
            className="btn btn-outline"
            style={{ height: 44 }}
            onClick={() => void replay()}
            disabled={!speakOk || listening || replays >= MOCK_REPLAYS}
          >
            {replays >= MOCK_REPLAYS ? "다시 듣기 끝" : `질문 다시 듣기 · ${MOCK_REPLAYS - replays}번 남음`}
          </button>
        </section>
        {!listenOk && stage === "answer" && (
          <form className="card" onSubmit={(e) => e.preventDefault()}>
            <label className="muted" htmlFor="typed" style={{ fontSize: 13, lineHeight: 1.5 }}>
              이 브라우저는 음성 인식을 지원하지 않아요. 안드로이드 크롬에서 보거나, 답을 입력해 주세요.
            </label>
            <textarea id="typed" className="input en" lang="en" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </form>
        )}
        {rec.error && <p className="error" role="alert">{rec.error}</p>}
        <div style={{ flexGrow: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span className="en" style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{clock(answerSec)}</span>
          <span className="muted" style={{ fontSize: 12 }}>{stage === "answer" ? (rec.on ? "말하는 중 · 이 문항에서 말한 시간" : "이 문항에서 말한 시간") : "질문이 끝나면 바로 말해요"}</span>
        </div>
      </div>
      <div className="bottom" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, paddingTop: 12 }}>
        <span
          className={`mic${stage === "answer" && rec.on ? " rec" : " thinking"}`}
          aria-hidden="true"
          style={{ width: 64, height: 64 }}
        >
          <span style={{ width: 22, height: 22, borderRadius: 6, background: "#fff" }} />
        </span>
        <button type="button" className="btn btn-primary" onClick={() => void saveAndNext()} disabled={listening}>
          {n >= MOCK_COUNT ? "시험 마치기" : "다음 문항"}
        </button>
      </div>
      {exitSheet}
    </main>
  );
}
