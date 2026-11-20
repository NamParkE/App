"use client";

import { playSfx } from "@/lib/sfx";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, MicIcon, SpeakerIcon, SpinnerIcon } from "./Icons";
import { canListen, listen, speak, stopSpeaking, type Listener } from "@/lib/speech";
import type { ReviewItem } from "@/lib/call/types";

type Result = { score: number; passed: boolean };

/**
 * 표현 복습: 듣고 따라 말하기. 채점은 서버의 단어 비교(AI 없음).
 * 다음 표현으로 넘어갈 때 기다림이 없도록 결과를 받는 즉시 보여 준다.
 */
export default function ReviewRunner({
  items,
  onDone,
  doneLabel = "다 했어요",
}: {
  items: ReviewItem[];
  onDone: () => void;
  doneLabel?: string;
}) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"ready" | "rec" | "checking" | "result">("ready");
  const [partial, setPartial] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passedCount, setPassedCount] = useState(0);
  const [listenOk, setListenOk] = useState(true);
  const listener = useRef<Listener | null>(null);
  const item = items[idx];

  useEffect(() => setListenOk(canListen()), []);

  useEffect(() => {
    if (item) speak(item.en);
    return () => stopSpeaking();
  }, [item]);

  useEffect(() => () => listener.current?.abort(), []);

  async function check(said: string) {
    setPhase("checking");
    const res = await fetch("/api/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expressionId: item.id, said }),
    }).catch(() => null);
    if (!res?.ok) {
      setError("채점하지 못했어요. 다시 말해 보세요.");
      setPhase("ready");
      return;
    }
    const data = (await res.json()) as { diff: { score: number }; passed: boolean };
    playSfx(data.passed ? "good" : "retry");
    setResult({ score: data.diff.score, passed: data.passed });
    if (data.passed) setPassedCount((n) => n + 1);
    setPhase("result");
  }

  function mic() {
    if (phase === "rec") {
      listener.current?.stop();
      return;
    }
    stopSpeaking();
    setError(null);
    setPartial("");
    const l = listen({
      onPartial: setPartial,
      onDone: (t) => {
        listener.current = null;
        if (!t.trim()) {
          setError("잘 들리지 않았어요. 다시 말해 보세요.");
          setPhase("ready");
          return;
        }
        setPartial(t);
        void check(t);
      },
      onError: () => {
        listener.current = null;
        setError("음성 인식이 멈췄어요. 다시 시도해 주세요.");
        setPhase("ready");
      },
    });
    if (!l) {
      setError("이 브라우저는 음성 인식을 지원하지 않아요. 크롬에서 열어 주세요.");
      return;
    }
    listener.current = l;
    setPhase("rec");
  }

  function next() {
    setResult(null);
    setPartial("");
    setPhase("ready");
    setIdx((i) => i + 1);
  }

  if (!item) {
    return (
      <div className="card" style={{ alignItems: "center", textAlign: "center", gap: 12 }}>
        <div className="logo" style={{ background: "var(--ok-soft)" }}>
          <CheckIcon size={30} color="var(--ok-ink)" />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>복습 끝!</div>
        <div className="muted" style={{ fontSize: 14 }}>
          {items.length}개 중 {passedCount}개를 잘 말했어요.
        </div>
        <button type="button" className="btn btn-primary" onClick={onDone}>
          {doneLabel}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        표현 복습 <span className="en">{idx + 1} / {items.length}</span> · 듣고 따라 말해 보세요
      </div>
      <section className="card" style={{ gap: 8 }}>
        <div className="row" style={{ alignItems: "center" }}>
          <div className="model-en" lang="en" style={{ fontSize: 22 }}>{item.en}</div>
          <button type="button" className="round-btn" aria-label="표현 듣기" onClick={() => speak(item.en)}>
            <SpeakerIcon />
          </button>
        </div>
        <div className="ko-line" style={{ fontSize: 14 }}>{item.ko}</div>
        {item.example && <div className="en muted" lang="en" style={{ fontSize: 13 }}>{item.example}</div>}
      </section>

      {partial && (
        <div className="bubble" aria-live="polite">
          <div className="label">{phase === "rec" ? "듣는 중…" : "내가 말한 것"}</div>
          <div className="en" style={{ fontSize: 16 }}>{partial}</div>
        </div>
      )}
      {result && (
        <p className="notice" style={result.passed ? { background: "var(--ok-soft)", color: "var(--ok-ink)" } : undefined}>
          {result.passed ? `잘했어요! ${result.score}점` : `${result.score}점 · 한 번 더 들어 보고 말해 봐요`}
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      <div className="btn-row">
        <button type="button" className="btn btn-outline" onClick={next} disabled={phase === "checking" || phase === "rec"}>
          {phase === "result" ? "다음" : "건너뛰기"}
        </button>
        <button
          type="button"
          className={`btn ${phase === "rec" ? "btn-dark" : "btn-primary"}`}
          onClick={mic}
          disabled={phase === "checking" || !listenOk}
        >
          {phase === "checking" ? (
            <SpinnerIcon color="#fff" />
          ) : (
            <>
              <MicIcon size={20} color="#FFFFFF" />
              {phase === "rec" ? "멈추기" : phase === "result" ? "다시 말하기" : "말하기"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
