"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BackIcon, MicIcon, SpeakerIcon, SpinnerIcon } from "@/components/Icons";
import { speak } from "@/lib/speech";
import type { AnswerSource, Level, Sentence, SentenceStatus, Topic } from "@/lib/types";

export interface AnswerView {
  sentences: Sentence[];
  statuses: Record<string, SentenceStatus>;
}

/**
 * 주제 화면. 화면마다 큰 버튼은 하나만 둔다 (유저 테스트: 갈래가 많으면 뭘 눌러야 할지 모름).
 * - 답변이 있으면: 문장 목록(줄을 누르면 듣기) + 큰 버튼 "말하기 연습"
 * - 없으면: 큰 버튼 "내 스크립트 넣기" 또는 "핵심 답변 만들기" + 다른 방식은 작은 링크
 * - 내 스크립트와 AI 답변이 둘 다 있을 때만 위에 전환 탭
 */
export default function TopicView({
  topic,
  level,
  usageLeft,
  initial,
  ai,
  mine,
}: {
  topic: Topic;
  level: Level;
  usageLeft: number;
  /** 처음 보여 줄 답변 */
  initial: AnswerSource;
  ai: AnswerView;
  mine: AnswerView;
}) {
  const router = useRouter();
  const [view, setView] = useState<AnswerSource>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAi = ai.sentences.length > 0;
  const hasMine = mine.sentences.length > 0;
  const current = view === "mine" ? mine : ai;
  const { sentences, statuses } = current;

  function switchTo(v: AnswerSource) {
    setView(v);
    setError(null);
    // 새로고침하거나 연습에서 돌아와도 같은 답변이 보이도록 주소에 남긴다
    router.replace(`/topic/${topic.id}?v=${v}`, { scroll: false });
  }

  async function generate() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topicId: topic.id }),
    }).catch(() => null);
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => ({})) : {};
      setError(body.message ?? "답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
      setBusy(false);
      return;
    }
    // 성공하면 새로고침으로 문장 목록이 나타날 때까지 로딩 표시를 유지한다
    router.refresh();
  }

  // 처음으로 아직 못 외운 문장부터 연습
  const startIdx = Math.max(0, sentences.findIndex((s) => statuses[s.id] !== "memorized"));
  const allDone = sentences.length > 0 && sentences.every((s) => statuses[s.id] === "memorized");
  const doneCount = sentences.filter((s) => statuses[s.id] === "memorized").length;
  const scriptHref = `/topic/${topic.id}/script`;

  return (
    <main className="screen">
      <div className="pad" style={{ gap: 12 }}>
        <div className="topbar" style={{ gap: 4 }}>
          <Link href="/home" className="icon-btn" aria-label="홈으로">
            <BackIcon />
          </Link>
          <h1>{topic.title_ko}</h1>
        </div>

        {hasAi && hasMine && (
          <div className="seg" role="tablist" aria-label="연습할 답변">
            <button type="button" role="tab" aria-selected={view === "mine"} onClick={() => switchTo("mine")}>
              내 스크립트
            </button>
            <button type="button" role="tab" aria-selected={view === "ai"} onClick={() => switchTo("ai")}>
              AI 답변 · <span className="en">{level}</span>
            </button>
          </div>
        )}

        <button type="button" className="card q-card" onClick={() => speak(topic.question_en)} aria-label="질문 듣기">
          <span className="row" style={{ alignItems: "center" }}>
            <span className="label">질문</span>
            <SpeakerIcon size={16} color="var(--muted)" />
          </span>
          <span className="en" lang="en" style={{ fontSize: 16, lineHeight: 1.5, fontWeight: 500 }}>{topic.question_en}</span>
          <span className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>{topic.question_ko}</span>
        </button>

        {sentences.length === 0 ? (
          view === "mine" ? (
            <div className="empty-answer">
              <h2 className="section-title">이 주제의 내 스크립트가 아직 없어요</h2>
              <p className="subtitle" style={{ fontSize: 14 }}>갖고 있는 답변을 붙여 넣으면 문장마다 나눠서 연습할 수 있어요.</p>
            </div>
          ) : (
            <div className="empty-answer">
              <h2 className="section-title">아직 핵심 답변이 없어요</h2>
              <p className="subtitle" style={{ fontSize: 14 }}>
                <span className="en">{level}</span> 수준에 맞는 답변 문장을 만들어 드려요. 연습 1회가 차감돼요 (오늘 {usageLeft}회 남음).
              </p>
              {error && <p className="error" role="alert">{error}</p>}
            </div>
          )
        ) : (
          <>
            <div className="row" style={{ alignItems: "baseline", paddingTop: 4 }}>
              <h2 className="section-title" style={{ fontSize: 16 }}>
                {sentences.length}문장 · 외움 {doneCount}
              </h2>
              <span className="muted" style={{ fontSize: 12 }}>문장을 누르면 들려요</span>
            </div>
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {sentences.map((s, i) => {
                const st = statuses[s.id] ?? "todo";
                const isCurrent = i === startIdx && !allDone;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`sentence sentence-btn${isCurrent ? " current" : ""}`}
                      onClick={() => speak(s.en)}
                      aria-label={`${i + 1}번 문장 듣기${st === "memorized" ? " (외움)" : ""}`}
                    >
                      <span className={`num ${isCurrent ? "practicing" : st}`}>{i + 1}</span>
                      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, textAlign: "left" }}>
                        <span className="en-line" lang="en">{s.en}</span>
                        <span className="ko-line">{s.ko}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {(view === "mine" || !hasMine) && (
              <Link href={scriptHref} className="text-link">
                {view === "mine" ? "스크립트 다시 넣기" : "내 스크립트도 넣기"}
              </Link>
            )}
          </>
        )}
      </div>

      <div className="bottom" style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
        {sentences.length > 0 ? (
          <Link href={`/practice/${topic.id}?v=${view}&start=${allDone ? 0 : startIdx}`} className="btn btn-primary">
            <MicIcon size={20} color="#FFFFFF" />
            {allDone ? "처음부터 복습하기" : `문장 ${startIdx + 1}부터 말하기 연습`}
          </Link>
        ) : view === "mine" ? (
          <>
            <Link href={scriptHref} className="btn btn-primary">내 스크립트 넣기</Link>
            <button type="button" className="text-link" onClick={() => switchTo("ai")}>
              {hasAi ? "AI 답변으로 연습하기" : "스크립트가 없어요 · AI 답변으로 연습하기"}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={generate} disabled={busy || usageLeft <= 0}>
              {busy ? (
                <>
                  <SpinnerIcon color="#fff" /> 답변을 만드는 중…
                </>
              ) : usageLeft <= 0 ? (
                "오늘 한도를 다 썼어요"
              ) : (
                "핵심 답변 만들기"
              )}
            </button>
            <Link href={hasMine ? `/topic/${topic.id}?v=mine` : scriptHref} className="text-link" onClick={hasMine ? () => setView("mine") : undefined}>
              {hasMine ? "내 스크립트로 연습하기" : "내 스크립트가 있어요 · 직접 넣기"}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
