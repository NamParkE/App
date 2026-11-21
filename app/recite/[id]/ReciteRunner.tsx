"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { playSfx } from "@/lib/sfx";
import { CloseIcon, MicIcon, SpeakerIcon, SpinnerIcon } from "@/components/Icons";
import Words from "@/components/Words";
import { canListen, listen, speak, stopSpeaking, type Listener } from "@/lib/speech";
import { compareLine, mmss, RECITE_GOAL, RECITE_MAX_SEC, type ReciteResponse } from "@/lib/recite";
import type { AnswerSource, Topic } from "@/lib/types";

type Phase = "ready" | "rec" | "checking" | "result";

/**
 * 답변 전체 이어 말하기: 답변을 모두 가리고(한글 뜻도 없이) 처음부터 끝까지 한 번에 말한다.
 * 문장 사이에서 멈추면 음성 인식이 끊길 수 있어, 사용자가 "다 말했어요"를 누를 때까지 조용히 다시 이어 듣는다.
 */
export default function ReciteRunner({
  topic,
  source,
  sentences,
}: {
  topic: Topic;
  source: AnswerSource;
  sentences: { position: number; en: string; ko: string }[];
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [live, setLive] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<ReciteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listenOk, setListenOk] = useState(true);

  const listener = useRef<Listener | null>(null);
  const chunks = useRef<string[]>([]);
  const stopped = useRef(false);
  const startedAt = useRef(0);
  const duration = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setListenOk(canListen());
    speak(topic.question_en);
    return () => {
      stopSpeaking();
      listener.current?.abort();
      if (timer.current) clearInterval(timer.current);
    };
  }, [topic.question_en]);

  const heard = (extra = "") => [...chunks.current, extra.trim()].filter(Boolean).join(" ");

  async function submit(said: string, durationSec: number) {
    setPhase("checking");
    setError(null);
    const res = await fetch("/api/recite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topicId: topic.id, source, said, durationSec: Math.min(600, Math.round(durationSec)) }),
    }).catch(() => null);
    if (!res?.ok) {
      const msg = (await res?.json().catch(() => null))?.message as string | undefined;
      setError(msg ?? "채점하지 못했어요. 인터넷 연결을 확인하고 다시 해 보세요.");
      setPhase("ready");
      return;
    }
    const data = (await res.json()) as ReciteResponse;
    playSfx(data.stuck.length === 0 ? "good" : "retry");
    setResult(data);
    setPhase("result");
  }

  function finish() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    listener.current = null;
    const said = heard();
    if (!said) {
      setError("잘 들리지 않았어요. 다시 해 보세요.");
      setPhase("ready");
      return;
    }
    setLive(said);
    void submit(said, duration.current);
  }

  function listenOnce(quiet: boolean) {
    const l = listen({
      quiet,
      onPartial: (t) => setLive(heard(t)),
      onDone: (t) => {
        if (t.trim()) chunks.current.push(t.trim());
        setLive(heard());
        // 사용자가 멈추지 않았는데 인식이 끝났으면(문장 사이 침묵 등) 조용히 다시 듣는다
        if (!stopped.current) listenOnce(true);
        else finish();
      },
      onError: () => {
        if (!stopped.current && chunks.current.length === 0) {
          stopped.current = true;
          if (timer.current) clearInterval(timer.current);
          setError("음성 인식이 멈췄어요. 다시 시도해 주세요.");
          setPhase("ready");
          return;
        }
        stopped.current = true;
        duration.current = duration.current || (Date.now() - startedAt.current) / 1000;
        finish();
      },
    });
    if (!l) {
      setError("이 브라우저는 음성 인식을 지원하지 않아요. 크롬에서 열어 주세요.");
      setPhase("ready");
      return;
    }
    listener.current = l;
  }

  function start() {
    stopSpeaking();
    setError(null);
    setLive("");
    chunks.current = [];
    stopped.current = false;
    duration.current = 0;
    startedAt.current = Date.now();
    setElapsed(0);
    timer.current = setInterval(() => {
      const sec = (Date.now() - startedAt.current) / 1000;
      setElapsed(sec);
      if (sec >= RECITE_MAX_SEC && !stopped.current) stop();
    }, 250);
    setPhase("rec");
    listenOnce(false);
  }

  function stop() {
    if (stopped.current) return;
    stopped.current = true;
    duration.current = (Date.now() - startedAt.current) / 1000;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (listener.current) listener.current.stop();
    else finish();
  }

  function again() {
    setResult(null);
    setLive("");
    setTyped("");
    setElapsed(0);
    setPhase("ready");
  }

  const header = (title: string) => (
    <div className="topbar" style={{ gap: 4 }}>
      <Link href={`/topic/${topic.id}?v=${source}`} className="icon-btn" aria-label="이어 말하기 닫기">
        <CloseIcon />
      </Link>
      <h1 style={{ fontSize: 16 }}>{title}</h1>
    </div>
  );

  // ───── 결과 ─────
  if (phase === "result" && result) {
    const stuck = result.stuck;
    const goalOk = result.durationSec >= RECITE_GOAL.min && result.durationSec <= RECITE_GOAL.max;
    const byPos = new Map(sentences.map((s) => [s.position, s]));
    const stat = (label: string, value: string, color?: string) => (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <span className="label">{label}</span>
        <span className="en" style={{ fontSize: 24, fontWeight: 700, color }}>{value}</span>
      </div>
    );
    return (
      <main className="screen">
        <div className="pad" style={{ gap: 10 }}>
          {header("이어 말하기 결과")}
          <section className="card" style={{ flexDirection: "row", gap: 0, padding: "14px 8px" }} aria-label="결과 요약">
            {stat("일치도", `${result.score}%`, "var(--accent)")}
            {stat("걸린 시간", mmss(result.durationSec))}
            {stat("막힌 문장", String(stuck.length), stuck.length ? "var(--warn-ink)" : "var(--ok-ink)")}
          </section>
          <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
            {compareLine(result, result.previous)}
            {goalOk ? " · 목표 시간(2분 안팎) 안이에요" : result.durationSec < RECITE_GOAL.min ? " · 목표(2분 안팎)보다 짧아요" : " · 목표(2분 안팎)보다 길어요"}
          </p>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {result.sentences.map((r) => (
              <li
                key={r.position}
                className="sentence"
                style={r.stuck ? { border: "2px solid var(--warn)", padding: 13 } : undefined}
              >
                <span
                  className={`num${r.stuck ? "" : " memorized"}`}
                  style={r.stuck ? { background: "var(--warn-soft)", color: "var(--warn-ink)" } : undefined}
                >
                  {r.position + 1}
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  {r.stuck ? (
                    <>
                      <Words tokens={r.tokens} />
                      <span className="ko-line">{byPos.get(r.position)?.ko}</span>
                    </>
                  ) : (
                    <span className="en-line" lang="en" style={{ fontSize: 14 }}>{byPos.get(r.position)?.en}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          {stuck.length > 0 && <span className="muted" style={{ fontSize: 12 }}>빠진 단어 · 틀린 단어를 칠했어요. 외움 표시는 그대로예요.</span>}
        </div>
        <div className="bottom" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          {stuck.length > 0 ? (
            <>
              <Link href={`/practice/${topic.id}?v=${source}&only=${stuck.join(",")}`} className="btn btn-primary">
                막힌 문장 {stuck.length}개만 다시 연습
              </Link>
              <button type="button" className="text-link" onClick={again}>처음부터 다시 이어 말하기</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={again}>처음부터 다시 이어 말하기</button>
              <Link href={`/topic/${topic.id}?v=${source}`} className="text-link">주제로 돌아가기</Link>
            </>
          )}
        </div>
      </main>
    );
  }

  // ───── 말하는 중 · 채점 중 ─────
  if (phase === "rec" || phase === "checking") {
    const pct = Math.min(100, (elapsed / RECITE_GOAL.max) * 100);
    return (
      <main className="screen">
        <div className="pad" style={{ gap: 12 }}>
          {header(`이어 말하기 · ${topic.title_ko}`)}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "18px 0 6px" }}>
            <span className="en" style={{ fontSize: 48, fontWeight: 700, letterSpacing: -1, fontVariantNumeric: "tabular-nums" }}>
              {mmss(phase === "checking" ? duration.current : elapsed)}
            </span>
            <span className="muted" style={{ fontSize: 13 }}>목표 2분 안팎 · 3분이 되면 자동으로 끝나요</span>
          </div>
          <div className="track" aria-hidden="true">
            <div style={{ width: `${pct}%` }} />
          </div>
          <section className="card" style={{ gap: 8, minHeight: 200 }} aria-live="polite">
            <span className="label">{phase === "checking" ? "내가 말한 것" : "받아 적는 중"}</span>
            <span className="en" lang="en" style={{ fontSize: 15, lineHeight: 1.6, color: "var(--muted)" }}>{live || "…"}</span>
          </section>
          {phase === "checking" && (
            <div className="muted" style={{ alignSelf: "center", display: "flex", alignItems: "center", gap: 10, fontSize: 14, padding: 12 }}>
              <SpinnerIcon color="var(--accent)" />
              답변과 비교하고 있어요
            </div>
          )}
        </div>
        <div className="bottom" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, paddingTop: 16 }}>
          <button
            type="button"
            className={`mic${phase === "rec" ? " rec" : " thinking"}`}
            aria-label="다 말했어요"
            onClick={stop}
            disabled={phase === "checking"}
          >
            <span style={{ width: 28, height: 28, borderRadius: 6, background: "#fff" }} />
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--warn-ink)" }}>
            {phase === "rec" ? "다 말했으면 눌러요" : "잠시만 기다려 주세요"}
          </div>
        </div>
      </main>
    );
  }

  // ───── 시작 전 ─────
  return (
    <main className="screen">
      <div className="pad" style={{ gap: 12 }}>
        {header(`이어 말하기 · ${topic.title_ko}`)}
        <button type="button" className="card q-card" onClick={() => speak(topic.question_en)} aria-label="질문 다시 듣기">
          <span className="row" style={{ alignItems: "center" }}>
            <span className="label">질문 · 눌러서 다시 듣기</span>
            <SpeakerIcon size={16} color="var(--muted)" />
          </span>
          <span className="en" lang="en" style={{ fontSize: 15, lineHeight: 1.5, fontWeight: 500 }}>{topic.question_en}</span>
        </button>
        <section className="card" style={{ gap: 14 }}>
          <span className="label">답변 {sentences.length}문장 · 모두 가려져 있어요</span>
          <span className="hidden-lines" aria-hidden="true">
            {sentences.map((s, i) => (
              <span key={s.position} style={{ width: `${[90, 70, 96, 60, 84, 74, 92, 50][i % 8]}%` }} />
            ))}
          </span>
        </section>
        <p className="notice" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <b>목표: 2분 안팎, 끊기지 않게</b>
          <span style={{ fontSize: 13 }}>문장 사이에서 멈춰도 괜찮아요. 다 말하면 &quot;다 말했어요&quot;를 눌러요.</span>
        </p>
        {error && <p className="error" role="alert">{error}</p>}
        {!listenOk && (
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.trim()) void submit(typed.trim(), 0);
            }}
          >
            <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
              이 브라우저는 음성 인식을 지원하지 않아요. 안드로이드 크롬에서 열거나, 아래에 답변을 입력해 보세요.
            </p>
            <label className="sr-only" htmlFor="typed">답변 입력</label>
            <textarea id="typed" className="input en" lang="en" value={typed} onChange={(e) => setTyped(e.target.value)} />
            <button type="submit" className="btn btn-dark" disabled={!typed.trim()}>채점하기</button>
          </form>
        )}
      </div>
      <div className="bottom" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingTop: 16 }}>
        <button type="button" className="mic" aria-label="이어 말하기 시작" onClick={start} disabled={!listenOk}>
          <MicIcon size={36} color="#FFFFFF" />
        </button>
        <div className="muted" style={{ fontSize: 14 }}>눌러서 시작</div>
      </div>
    </main>
  );
}
