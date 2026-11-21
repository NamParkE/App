"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { playSfx } from "@/lib/sfx";
import { CheckIcon, CloseIcon, MicIcon, SpinnerIcon } from "@/components/Icons";
import Words from "@/components/Words";
import { canListen, listen, stopSpeaking, type Listener } from "@/lib/speech";
import { nextRecallLabel, sinceLabel, type RecallItem, type RecallResponse } from "@/lib/recall";

type Phase = "ready" | "rec" | "checking" | "result";
type Outcome = { item: RecallItem; passed: boolean };

/**
 * 오늘의 복습: 한글 뜻만 보고 영어로 말한다. 영어 문장은 가리고 소리도 들려주지 않는다.
 * 90점 이상이면 기억함(다음 간격으로), 아니면 외움 표시를 푼다. 결과는 받는 즉시 보여 준다.
 */
export default function RecallRunner({
  items,
  remaining,
  titles,
  today,
}: {
  items: RecallItem[];
  remaining: number;
  titles: Record<string, string>;
  today: string;
}) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [partial, setPartial] = useState("");
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<RecallResponse | null>(null);
  const [retryScore, setRetryScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [listenOk, setListenOk] = useState(true);
  const listener = useRef<Listener | null>(null);
  const retrying = useRef(false);
  const item = items[idx];
  const title = (id: string) => titles[id] ?? id;

  useEffect(() => {
    setListenOk(canListen());
    stopSpeaking();
    return () => listener.current?.abort();
  }, []);

  async function send(said: string, opts: { gaveUp?: boolean } = {}) {
    const retry = retrying.current;
    setPhase("checking");
    setError(null);
    const res = await fetch("/api/recall", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sentenceId: item.id, said, gaveUp: !!opts.gaveUp, retry }),
    }).catch(() => null);
    if (!res?.ok) {
      const msg = (await res?.json().catch(() => null))?.message as string | undefined;
      setError(msg ?? "인터넷 연결을 확인하고 다시 말해 보세요.");
      setPhase(retry ? "result" : "ready");
      return;
    }
    const data = (await res.json()) as RecallResponse;
    playSfx(data.passed ? "good" : "retry");
    if (retry) {
      setRetryScore(data.score);
      setResult((r) => (r ? { ...r, diff: data.diff } : data));
    } else {
      setResult(data);
      setOutcomes((o) => [...o, { item, passed: data.passed }]);
    }
    setPhase("result");
  }

  function onMic(asRetry = false) {
    if (phase === "rec") {
      listener.current?.stop();
      return;
    }
    retrying.current = asRetry;
    setError(null);
    setPartial("");
    const l = listen({
      onPartial: setPartial,
      onDone: (t) => {
        listener.current = null;
        if (!t.trim()) {
          setError("잘 들리지 않았어요. 다시 말해 보세요.");
          setPhase(asRetry ? "result" : "ready");
          return;
        }
        setPartial(t);
        void send(t.trim());
      },
      onError: () => {
        listener.current = null;
        setError("음성 인식이 멈췄어요. 다시 시도해 주세요.");
        setPhase(asRetry ? "result" : "ready");
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
    retrying.current = false;
    setResult(null);
    setRetryScore(null);
    setPartial("");
    setTyped("");
    setError(null);
    setPhase("ready");
    setIdx((i) => i + 1);
  }

  const close = (
    <Link href="/home" className="icon-btn" aria-label="복습 닫기">
      <CloseIcon />
    </Link>
  );

  // ───── 복습할 문장이 없음 ─────
  if (items.length === 0) {
    return (
      <main className="screen">
        <div className="pad">
          <div className="topbar">{close}<h1>오늘의 복습</h1></div>
          <div className="card" style={{ alignItems: "center", textAlign: "center", gap: 10, padding: 24 }}>
            <div className="logo" style={{ background: "var(--ok-soft)" }}>
              <CheckIcon size={30} color="var(--ok-ink)" />
            </div>
            <h2 className="section-title">오늘 복습할 문장이 없어요</h2>
            <p className="subtitle" style={{ fontSize: 14 }}>외운 문장은 1 · 3 · 7 · 14일 뒤에 다시 물어봐요.</p>
          </div>
        </div>
        <div className="bottom">
          <Link href="/home" className="btn btn-primary">홈으로</Link>
        </div>
      </main>
    );
  }

  // ───── 복습 끝 · 요약 ─────
  if (!item) {
    const forgot = outcomes.filter((o) => !o.passed).map((o) => o.item);
    const kept = outcomes.length - forgot.length;
    const first = forgot[0];
    const href = (it: RecallItem) => `/practice/${it.topicId}?v=${it.source}&start=${it.position}`;
    return (
      <main className="screen">
        <div className="pad">
          <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 12 }}>
            <span className="label">오늘의 복습 끝</span>
            <h1 className="title">
              {outcomes.length}문장 중 {kept}문장을 기억했어요
            </h1>
          </div>
          <div className="track" role="img" aria-label={`${outcomes.length}문장 중 ${kept}문장 기억`}>
            <div style={{ width: `${outcomes.length ? (kept / outcomes.length) * 100 : 0}%`, background: "var(--ok-ink)" }} />
          </div>
          {forgot.length > 0 && (
            <>
              <h2 className="label" style={{ margin: "6px 0 0" }}>다시 외울 문장 {forgot.length}개 · 누르면 그 문장부터 연습해요</h2>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {forgot.map((it) => (
                  <li key={it.id}>
                    <Link href={href(it)} className="sentence" style={{ textDecoration: "none", color: "inherit" }}>
                      <span className="num" style={{ background: "var(--warn-soft)", color: "var(--warn-ink)" }}>{it.position + 1}</span>
                      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{title(it.topicId)}</span>
                        <span className="ko-line">{it.ko}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
            기억한 문장은 다음 간격(3 · 7 · 14일)에 다시 물어봐요.
            {remaining > 0 ? ` 오늘 복습할 문장이 ${remaining}개 더 있어요.` : ""}
          </p>
        </div>
        <div className="bottom" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          {first ? (
            <Link href={href(first)} className="btn btn-primary">
              {forgot.length === 1 ? "이 문장 다시 외우기" : `${title(first.topicId)}부터 다시 외우기`}
            </Link>
          ) : remaining > 0 ? (
            <a href="/recall" className="btn btn-primary">이어서 {Math.min(remaining, 20)}문장 더 복습</a>
          ) : (
            <Link href="/home" className="btn btn-primary">홈으로</Link>
          )}
          {(first || remaining > 0) && (
            <Link href="/home" className="text-link">홈으로</Link>
          )}
        </div>
      </main>
    );
  }

  const header = (
    <>
      <div className="topbar" style={{ gap: 12 }}>
        {close}
        <h1 style={{ fontSize: 16 }}>오늘의 복습</h1>
        <span className="en muted" style={{ fontSize: 14, fontWeight: 600 }}>
          {idx + 1} / {items.length}
        </span>
      </div>
      <div className="track" role="progressbar" aria-valuenow={idx + 1} aria-valuemin={1} aria-valuemax={items.length}>
        <div style={{ width: `${((idx + (phase === "result" ? 1 : 0)) / items.length) * 100}%` }} />
      </div>
    </>
  );

  // ───── 결과 ─────
  if (phase === "result" && result) {
    const passed = result.passed;
    return (
      <main className="screen">
        <div className="pad" style={{ gap: 14 }}>
          {header}
          <section className="card" style={{ gap: 12, padding: "20px 18px" }}>
            <span className="label">
              {title(item.topicId)} · {item.position + 1}번 문장
            </span>
            <span className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>{item.ko}</span>
            {passed || !result.diff ? (
              <span className="model-en" lang="en" style={{ fontSize: 18 }}>{item.en}</span>
            ) : (
              <>
                <Words tokens={result.diff.model} />
                <span className="muted" style={{ fontSize: 12 }}>빠진 단어 · 틀린 단어를 칠했어요</span>
              </>
            )}
          </section>
          {passed ? (
            <section className="card" style={{ alignItems: "center", gap: 8, padding: 20 }}>
              <span className="score" style={{ color: "var(--ok-ink)" }}>{result.score}</span>
              <span className="notice" style={{ background: "var(--ok-soft)", color: "var(--ok-ink)", fontWeight: 700 }}>
                기억하고 있어요
              </span>
              <span className="muted" style={{ fontSize: 13 }}>{nextRecallLabel(today, result.saved?.nextRecallOn ?? null)}</span>
            </section>
          ) : (
            <section
              className="card"
              style={{ alignItems: "center", gap: 8, padding: 18, background: "var(--warn-soft)", borderColor: "var(--warn-ring)", color: "var(--warn-ink)" }}
            >
              {result.diff ? <span className="score" style={{ color: "var(--warn-ink)" }}>{result.score}</span> : null}
              <span style={{ fontSize: 14, fontWeight: 700 }}>외움 표시를 풀었어요</span>
              <span style={{ fontSize: 13, textAlign: "center", lineHeight: 1.5 }}>
                이 문장은 다시 외울 목록으로 돌아가요. 다시 외우면 1일 뒤부터 복습해요.
              </span>
              {retryScore !== null && (
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  한 번 더: {retryScore}점{retryScore >= 90 ? " · 다시 외우기 연습에서 외움으로 돌아와요" : ""}
                </span>
              )}
            </section>
          )}
          {partial && !passed && (
            <div className="bubble" aria-live="polite">
              <div className="label">{phase === "result" ? "내가 말한 것" : "듣는 중…"}</div>
              <div className="en" style={{ fontSize: 15 }}>{partial}</div>
            </div>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
        <div className="bottom" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <button type="button" className="btn btn-primary" onClick={next}>
            {idx + 1 >= items.length ? "복습 마치기" : "다음 문장"}
          </button>
          {!passed && listenOk && (
            <button type="button" className="text-link" onClick={() => onMic(true)}>
              한 번 더 말해 보기
            </button>
          )}
        </div>
      </main>
    );
  }

  // ───── 한글 뜻 보고 말하기 (듣는 중 · 채점 중) ─────
  const retryRec = phase === "rec" && retrying.current;
  return (
    <main className="screen">
      <div className="pad" style={{ gap: 14 }}>
        {header}
        <section className="card" style={{ gap: 12, padding: "20px 18px" }}>
          <div className="row" style={{ alignItems: "center" }}>
            <span className="label">
              {title(item.topicId)} · {item.position + 1}번 문장
            </span>
            <span className="muted" style={{ fontSize: 12 }}>{sinceLabel(item.step)}</span>
          </div>
          <span style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.45 }}>{item.ko}</span>
          <span className="hidden-lines" aria-label="영어 문장은 가려져 있어요">
            <span style={{ width: "92%" }} />
            <span style={{ width: "64%" }} />
          </span>
        </section>
        <p className="muted" style={{ margin: 0, fontSize: 13, textAlign: "center" }}>
          {retryRec ? "한 번 더 말해 보세요 (점수만 봐요)" : "영어로 말해 보세요. 들려주지 않아요."}
        </p>
        {phase === "rec" && (
          <div className="bubble" aria-live="polite">
            <div className="label">듣는 중…</div>
            <div className="en" style={{ fontSize: 16, lineHeight: 1.45 }}>{partial || "…"}</div>
          </div>
        )}
        {phase === "checking" && (
          <div className="muted" style={{ alignSelf: "center", display: "flex", alignItems: "center", gap: 10, fontSize: 14, padding: 12 }}>
            <SpinnerIcon color="var(--accent)" />
            채점하고 있어요
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        {!listenOk && phase === "ready" && (
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.trim()) void send(typed.trim());
            }}
          >
            <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
              이 브라우저는 음성 인식을 지원하지 않아요. 안드로이드 크롬에서 열거나, 아래에 영어 문장을 입력해 보세요.
            </p>
            <label className="sr-only" htmlFor="typed">영어 문장 입력</label>
            <textarea id="typed" className="input en" lang="en" value={typed} onChange={(e) => setTyped(e.target.value)} />
            <button type="submit" className="btn btn-dark" disabled={!typed.trim()}>채점하기</button>
          </form>
        )}
      </div>
      <div className="bottom" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, paddingTop: 16 }}>
        <div className="mic-row">
          <button
            type="button"
            className="text-btn"
            style={{ justifySelf: "start" }}
            onClick={() => void send("", { gaveUp: true })}
            disabled={phase !== "ready"}
          >
            모르겠어요
          </button>
          <button
            type="button"
            className={`mic${phase === "rec" ? " rec" : ""}${phase === "checking" ? " thinking" : ""}`}
            aria-label={phase === "rec" ? "녹음 멈추기" : "녹음 시작"}
            onClick={() => onMic(retrying.current)}
            disabled={phase === "checking" || !listenOk}
          >
            {phase === "rec" ? (
              <span style={{ width: 28, height: 28, borderRadius: 6, background: "#fff" }} />
            ) : (
              <MicIcon size={36} color="#FFFFFF" />
            )}
          </button>
          <span />
        </div>
        <div className="muted" style={{ fontSize: 14 }}>
          {phase === "rec" ? "다 말했으면 버튼을 눌러 멈추세요" : phase === "checking" ? "잠시만 기다려 주세요" : "버튼을 누르고 말해 보세요"}
        </div>
      </div>
    </main>
  );
}
