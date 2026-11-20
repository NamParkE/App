"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BackIcon, MicIcon, SpeakerIcon, SpinnerIcon } from "@/components/Icons";
import { speak } from "@/lib/speech";
import type { Level, Sentence, SentenceStatus, Topic } from "@/lib/types";

const HELP_KEY = "showHelp";

const STATE_LABEL: Record<SentenceStatus, string> = {
  todo: "아직 안 함",
  practicing: "연습 중",
  memorized: "외움",
};

export default function TopicView({
  topic,
  level,
  sentences,
  statuses,
  usageLeft,
}: {
  topic: Topic;
  level: Level;
  sentences: Sentence[];
  statuses: Record<string, SentenceStatus>;
  usageLeft: number;
}) {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(HELP_KEY) === "0") setShowHelp(false);
    } catch {}
  }, []);

  function toggleHelp(v: boolean) {
    setShowHelp(v);
    try {
      localStorage.setItem(HELP_KEY, v ? "1" : "0");
    } catch {}
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

  return (
    <main className="screen">
      <div className="pad" style={{ gap: 12 }}>
        <div className="topbar" style={{ gap: 4 }}>
          <Link href="/home" className="icon-btn" aria-label="홈으로">
            <BackIcon />
          </Link>
          <h1>{topic.title_ko}</h1>
          <span className="badge">{level} 답변</span>
        </div>

        <section className="card" aria-label="질문">
          <div className="label">질문</div>
          <div className="en" style={{ fontSize: 16, lineHeight: 1.5, fontWeight: 500 }}>{topic.question_en}</div>
          <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>{topic.question_ko}</div>
        </section>

        {sentences.length === 0 ? (
          <section className="card" style={{ alignItems: "flex-start", gap: 12 }}>
            <h2 className="section-title">아직 핵심 답변이 없어요</h2>
            <p className="subtitle" style={{ fontSize: 14 }}>
              {level} 수준에 맞는 답변 문장을 만들어 드려요. 연습 1회가 차감돼요 (오늘 {usageLeft}회 남음).
            </p>
            {error && <p className="error" role="alert">{error}</p>}
            <button
              type="button"
              className="btn btn-primary"
              onClick={generate}
              disabled={busy || usageLeft <= 0}
            >
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
          </section>
        ) : (
          <>
            <div className="row" style={{ alignItems: "center", padding: "6px 0 0" }}>
              <h2 className="section-title" style={{ fontSize: 16 }}>핵심 답변 {sentences.length}문장</h2>
              <label className="check">
                <input type="checkbox" checked={showHelp} onChange={(e) => toggleHelp(e.target.checked)} />
                발음·번역 보기
              </label>
            </div>
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {sentences.map((s, i) => {
                const st = statuses[s.id] ?? "todo";
                const current = i === startIdx && !allDone;
                return (
                  <li key={s.id} className={`sentence${current ? " current" : ""}`}>
                    <div className={`num ${current ? "practicing" : st}`}>{i + 1}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flexGrow: 1, minWidth: 0 }}>
                      <div className="en-line" lang="en">{s.en}</div>
                      {showHelp && (
                        <>
                          <div className="pr-line">{s.pronunciation}</div>
                          <div className="ko-line">{s.ko}</div>
                        </>
                      )}
                      <div className={`state ${st}`}>{STATE_LABEL[st]}</div>
                    </div>
                    <button type="button" className="round-btn" aria-label={`${i + 1}번 문장 듣기`} onClick={() => speak(s.en)}>
                      <SpeakerIcon />
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>

      {sentences.length > 0 && (
        <div className="bottom">
          <Link href={`/practice/${topic.id}?start=${allDone ? 0 : startIdx}`} className="btn btn-primary">
            <MicIcon size={20} color="#FFFFFF" />
            {allDone ? "처음부터 복습하기" : `문장 ${startIdx + 1}부터 말하기 연습`}
          </Link>
        </div>
      )}
    </main>
  );
}
