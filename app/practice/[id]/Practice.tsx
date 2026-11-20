"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, CloseIcon, MicIcon, ReplayIcon, SpeakerIcon, SpinnerIcon } from "@/components/Icons";
import { canListen, listen, speak, stopSpeaking, type Listener } from "@/lib/speech";
import type { Token } from "@/lib/diff";
import type { FeedbackResponse, Mode, Sentence, SentenceStatus, Topic } from "@/lib/types";

type Phase = "ready" | "rec" | "thinking" | "result" | "finished";

const MODE_KEY = "practiceMode";

const MIC_ERRORS: Record<string, string> = {
  "not-allowed": "마이크 권한이 꺼져 있어요. 브라우저 설정에서 이 사이트의 마이크를 허용해 주세요.",
  "service-not-allowed": "마이크 권한이 꺼져 있어요. 브라우저 설정에서 이 사이트의 마이크를 허용해 주세요.",
  "audio-capture": "마이크를 찾을 수 없어요.",
  network: "음성 인식에 인터넷 연결이 필요해요.",
};

function Words({ tokens }: { tokens: Token[] }) {
  return (
    <div className="words" lang="en">
      {tokens.map((t, i) =>
        t.status === "gap" ? (
          <span key={i} className="w-gap" role="img" aria-label="빠뜨린 자리" />
        ) : (
          <span key={i} className={t.status === "ok" ? undefined : `w-${t.status}`}>
            {t.text}
          </span>
        ),
      )}
    </div>
  );
}

// "**the** living room" → 굵은 영어 단어
function TipText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return <span>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</span>;
}

export default function Practice({
  topic,
  sentences,
  initialStatuses,
  startIdx,
  initialUsageLeft,
}: {
  topic: Topic;
  sentences: Sentence[];
  initialStatuses: Record<string, SentenceStatus>;
  startIdx: number;
  initialUsageLeft: number;
}) {
  const [idx, setIdx] = useState(startIdx);
  const [mode, setMode] = useState<Mode>("see");
  const [phase, setPhase] = useState<Phase>("ready");
  const [partial, setPartial] = useState("");
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<FeedbackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState(initialStatuses);
  const [usageLeft, setUsageLeft] = useState(initialUsageLeft);
  const [listenSupported, setListenSupported] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const listener = useRef<Listener | null>(null);

  const sentence = sentences[idx];
  const total = sentences.length;

  useEffect(() => {
    setListenSupported(canListen());
    try {
      if (localStorage.getItem(MODE_KEY) === "hide") setMode("hide");
    } catch {}
    setLoaded(true);
    return () => {
      listener.current?.abort();
      stopSpeaking();
    };
  }, []);

  // 보면서 말하기: 새 문장이 나오면 모범 문장을 한 번 들려준다
  useEffect(() => {
    if (loaded && phase === "ready" && mode === "see") speak(sentence.en);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, loaded]);

  function changeMode(m: Mode) {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  }

  const submit = useCallback(
    async (said: string) => {
      setPhase("thinking");
      setError(null);
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sentenceId: sentence.id, said, mode }),
      }).catch(() => null);
      if (!res || !res.ok) {
        const body = res ? await res.json().catch(() => ({})) : {};
        setError(body.message ?? "결과를 받지 못했어요. 다시 말해 보세요.");
        setPhase("ready");
        return;
      }
      const data = (await res.json()) as FeedbackResponse;
      setResult(data);
      if (data.usageLeft !== null) setUsageLeft(data.usageLeft);
      setStatuses((s) => ({ ...s, [sentence.id]: data.status }));
      setPhase("result");
    },
    [sentence.id, mode],
  );

  function startRec() {
    stopSpeaking();
    setError(null);
    setPartial("");
    const l = listen({
      onPartial: setPartial,
      onDone: (text) => {
        listener.current = null;
        if (!text.trim()) {
          setError("잘 들리지 않았어요. 버튼을 누르고 다시 말해 보세요.");
          setPhase("ready");
          return;
        }
        setPartial(text);
        void submit(text);
      },
      onError: (code) => {
        listener.current = null;
        setError(MIC_ERRORS[code] ?? "음성 인식이 멈췄어요. 다시 시도해 주세요.");
        setPhase("ready");
      },
    });
    if (!l) {
      setListenSupported(false);
      return;
    }
    listener.current = l;
    setPhase("rec");
  }

  function onMic() {
    if (phase === "ready") startRec();
    else if (phase === "rec") listener.current?.stop();
  }

  function goTo(next: number) {
    listener.current?.abort();
    listener.current = null;
    stopSpeaking();
    setResult(null);
    setPartial("");
    setTyped("");
    setError(null);
    if (next >= total) {
      setPhase("finished");
      return;
    }
    setPhase("ready");
    setIdx(next);
  }

  function retry() {
    setResult(null);
    setPartial("");
    setTyped("");
    setPhase("ready");
  }

  const progressPct = Math.round(((idx + 1) / total) * 100);
  const header = (
    <div className="topbar" style={{ gap: 12 }}>
      <Link href={`/topic/${topic.id}`} className="icon-btn" aria-label="연습 닫기">
        <CloseIcon />
      </Link>
      <div className="track thick" role="progressbar" aria-valuenow={idx + 1} aria-valuemin={1} aria-valuemax={total}>
        <div style={{ width: `${progressPct}%` }} />
      </div>
      <div className="en muted" style={{ fontSize: 14, fontWeight: 600 }}>
        {idx + 1} / {total}
      </div>
    </div>
  );

  // ───── 다 끝남 ─────
  if (phase === "finished") {
    const memorized = sentences.filter((s) => statuses[s.id] === "memorized").length;
    return (
      <main className="screen">
        <div className="pad" style={{ justifyContent: "center", alignItems: "center", textAlign: "center", gap: 14 }}>
          <div className="logo" style={{ background: "var(--ok-soft)" }}>
            <CheckIcon size={30} color="var(--ok-ink)" />
          </div>
          <h1 className="title">{topic.title_ko} 한 바퀴 끝!</h1>
          <p className="subtitle">
            {total}문장 중 {memorized}문장을 외웠어요.
            <br />
            가리고 말하기에서 {90}점 이상이면 "외움"이 돼요.
          </p>
        </div>
        <div className="bottom btn-row">
          <Link href={`/topic/${topic.id}`} className="btn btn-outline">문장 목록</Link>
          <Link href="/home" className="btn btn-primary">다른 주제</Link>
        </div>
      </main>
    );
  }

  // ───── 피드백 ─────
  if (phase === "result" && result) {
    const { diff } = result;
    return (
      <main className="screen">
        <div className="pad" style={{ gap: 12 }}>
          {header}
          <section className="card" style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1 }}>
              <div className="muted" style={{ fontSize: 13 }}>모범 문장과 일치도</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{result.headline}</div>
            </div>
            <div className="score">
              {diff.score}
              <span style={{ fontSize: 18 }}>%</span>
            </div>
          </section>

          <section className="card" style={{ gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="label">내가 말한 문장</div>
              <Words tokens={diff.said} />
            </div>
            <div className="divider" />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="row" style={{ alignItems: "center" }}>
                <div className="label">모범 문장</div>
                <button type="button" className="round-btn" aria-label="모범 문장 듣기" onClick={() => speak(sentence.en)}>
                  <SpeakerIcon size={18} />
                </button>
              </div>
              <Words tokens={diff.model} />
              <div className="pr-line">{sentence.pronunciation}</div>
              <div className="ko-line">{sentence.ko}</div>
            </div>
            <div className="legend">
              <span><i style={{ background: "var(--warn)" }} />빠뜨림·틀림</span>
              <span><i style={{ background: "var(--accent)" }} />바꿔 말함 (괜찮아요)</span>
            </div>
          </section>

          {result.tips.length > 0 && (
            <section className="card">
              <div className="label">코치 한마디</div>
              {result.tips.map((t, i) => (
                <div key={i} className="tip">
                  <span className="tip-n">{i + 1}</span>
                  <TipText text={t} />
                </div>
              ))}
            </section>
          )}
          {result.coachSkipped === "limit" && (
            <p className="notice">오늘 AI 코치 횟수를 다 썼어요. 비교 결과는 계속 볼 수 있어요.</p>
          )}
          {result.coachSkipped === "error" && (
            <p className="notice">코치 한마디를 불러오지 못했어요. 비교 결과만 보여 드려요.</p>
          )}
          {result.status === "memorized" && (
            <p className="notice" style={{ background: "var(--ok-soft)", color: "var(--ok-ink)" }}>
              이 문장은 외웠어요!
            </p>
          )}
        </div>
        <div className="bottom btn-row">
          <button type="button" className="btn btn-outline" onClick={retry}>
            <ReplayIcon />
            다시 말하기
          </button>
          <button type="button" className="btn btn-primary" onClick={() => goTo(idx + 1)}>
            {idx + 1 >= total ? "마치기" : "다음 문장"}
          </button>
        </div>
      </main>
    );
  }

  // ───── 말하기 ─────
  const hidden = mode === "hide";
  return (
    <main className="screen">
      <div className="pad" style={{ gap: 14 }}>
        {header}
        <div className="muted" style={{ fontSize: 14 }}>
          {topic.title_ko} · {hidden ? "한글 뜻을 보고 영어로 말해 보세요" : "모범 문장을 듣고 따라 말해 보세요"}
        </div>

        <section className="card" style={{ padding: 18 }}>
          <div className="row" style={{ alignItems: "center" }}>
            <div className="label">모범 문장</div>
            <button
              type="button"
              className="chip"
              style={{ height: 36, gap: 6 }}
              onClick={() => speak(sentence.en)}
            >
              <SpeakerIcon size={16} />
              다시 듣기
            </button>
          </div>
          {hidden ? (
            <div className="hidden-lines" aria-label="영어 문장이 가려져 있어요">
              <div style={{ width: "92%" }} />
              <div style={{ width: "60%" }} />
              <div className="muted" style={{ height: "auto", background: "none", fontSize: 13, marginTop: 4 }}>
                외워서 말하기 모드 · 한글 뜻만 보여요
              </div>
            </div>
          ) : (
            <>
              <div className="model-en" lang="en">{sentence.en}</div>
              <div className="pr-line" style={{ fontSize: 14 }}>{sentence.pronunciation}</div>
            </>
          )}
          <div className="ko-line" style={{ fontSize: 14 }}>{sentence.ko}</div>
        </section>

        <div className="btn-row" role="group" aria-label="연습 방식">
          <button type="button" className="toggle" aria-pressed={!hidden} onClick={() => changeMode("see")} disabled={phase !== "ready"}>
            보면서 말하기
          </button>
          <button type="button" className="toggle" aria-pressed={hidden} onClick={() => changeMode("hide")} disabled={phase !== "ready"}>
            가리고 말하기
          </button>
        </div>

        {(phase === "rec" || (phase === "thinking" && partial)) && (
          <div className="bubble" aria-live="polite">
            <div className="label">{phase === "rec" ? "듣는 중…" : "내가 말한 문장"}</div>
            <div className="en" style={{ fontSize: 16, lineHeight: 1.45 }}>
              {partial || "…"}
            </div>
          </div>
        )}
        {phase === "thinking" && (
          <div className="muted" style={{ alignSelf: "center", display: "flex", alignItems: "center", gap: 10, fontSize: 14, padding: 12 }}>
            <SpinnerIcon color="var(--accent)" />
            모범 문장과 비교하고 있어요
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}

        {!listenSupported && phase === "ready" && (
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.trim()) void submit(typed.trim());
            }}
          >
            <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
              이 브라우저는 음성 인식을 지원하지 않아요. 안드로이드 크롬에서 열거나, 아래에 말할 문장을 입력해 보세요.
            </p>
            <label className="sr-only" htmlFor="typed">영어 문장 입력</label>
            <textarea id="typed" className="input en" lang="en" value={typed} onChange={(e) => setTyped(e.target.value)} />
            <button type="submit" className="btn btn-dark" disabled={!typed.trim()}>비교하기</button>
          </form>
        )}
      </div>

      <div className="bottom" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, paddingTop: 16 }}>
        <div className="mic-row">
          <button type="button" className="text-btn" style={{ justifySelf: "end" }} onClick={() => goTo(idx + 1)} disabled={phase === "thinking"}>
            건너뛰기
          </button>
          <button
            type="button"
            className={`mic${phase === "rec" ? " rec" : ""}${phase === "thinking" ? " thinking" : ""}`}
            aria-label={phase === "rec" ? "녹음 멈추기" : "녹음 시작"}
            onClick={onMic}
            disabled={phase === "thinking" || !listenSupported}
          >
            {phase === "rec" ? (
              <span style={{ width: 28, height: 28, borderRadius: 6, background: "#fff" }} />
            ) : (
              <MicIcon size={36} color="#FFFFFF" />
            )}
          </button>
          <div className="en muted" style={{ fontSize: 12, justifySelf: "start" }}>
            오늘 {usageLeft}회
          </div>
        </div>
        <div className="muted" style={{ fontSize: 14 }}>
          {phase === "rec"
            ? "다 말했으면 버튼을 눌러 멈추세요"
            : phase === "thinking"
              ? "잠시만 기다려 주세요"
              : "버튼을 누르고 말해 보세요"}
        </div>
      </div>
    </main>
  );
}
