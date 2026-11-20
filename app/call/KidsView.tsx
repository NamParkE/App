"use client";

// 어린이 모드(영상통화 화면). 승인된 시안: https://claude.ai/artifact/Qf1NSyEBvXBRqNPMcTFr7Q
// 리피가 크게 나오고, 리피 말은 말풍선(영어 + 한글 뜻 항상)으로, 표정은 말의 감정을 따라간다.

import Reppy, { type ReppyMood } from "@/components/Reppy";
import { BulbIcon, CloseIcon, MicIcon, ReplayIcon, SendIcon, SpeakerIcon } from "@/components/Icons";
import { speak } from "@/lib/speech";
import { LESSON_TURNS } from "@/lib/call/levels";
import type { ChatMessage, Emotion, HintResponse, LessonReport } from "@/lib/call/types";

type Mic = "idle" | "rec" | "confirm" | "waiting";

const EMOTION_STYLE: Record<Emotion, { label: string; color: string; sky: string; mood: ReppyMood }> = {
  happy: { label: "기쁨", color: "#0F7B6C", sky: "#DDF3FF", mood: "happy" },
  surprised: { label: "놀람", color: "#C2410C", sky: "#FFF0DD", mood: "surprised" },
  curious: { label: "궁금", color: "#2F5BEA", sky: "#E5ECFF", mood: "curious" },
  proud: { label: "칭찬", color: "#B45309", sky: "#FFF6D6", mood: "proud" },
  comfort: { label: "괜찮아", color: "#B4235A", sky: "#FFE8EF", mood: "comfort" },
  neutral: { label: "말하는 중", color: "#2F5BEA", sky: "#DDF3FF", mood: "talk" },
};

/** 점수 → 별 (80 이상 3개, 60 이상 2개, 그 아래 1개. 0개는 없다) */
export function starsFor(score: number) {
  return score >= 80 ? 3 : score >= 60 ? 2 : 1;
}

function Star({ size, on }: { size: number; on: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"
        fill={on ? "#FFC93D" : "rgba(255,255,255,0.75)"}
        stroke={on ? "#E59A00" : "#C9D6F2"}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function KidsCall({
  lastTutor,
  speaking,
  mic,
  partial,
  pending,
  onRetry,
  onSendNow,
  confirmMs,
  turns,
  elapsed,
  hint,
  hintBusy,
  hintsLeft,
  error,
  ending,
  listenOk,
  rate,
  onMic,
  onReplay,
  onHint,
  onEnd,
}: {
  lastTutor: ChatMessage | undefined;
  speaking: boolean;
  mic: Mic;
  partial: string;
  pending: string | null;
  onRetry: () => void;
  onSendNow: () => void;
  confirmMs: number;
  turns: number;
  elapsed: string;
  hint: HintResponse | null;
  hintBusy: boolean;
  hintsLeft: number;
  error: string | null;
  ending: boolean;
  listenOk: boolean;
  rate: number;
  onMic: () => void;
  onReplay: () => void;
  onHint: () => void;
  onEnd: () => void;
}) {
  const emo = EMOTION_STYLE[lastTutor?.emotion ?? "happy"];
  let mood: ReppyMood = emo.mood;
  if (mic === "rec" || mic === "confirm") mood = "listen";
  else if (mic === "waiting" || ending) mood = "think";
  else if (!speaking && mood === "talk") mood = "idle";
  // 감정 표정은 그대로 두고, 말하는 동안만 부리를 뻐끔거린다
  const talking = speaking && mood !== "talk";

  const confirming = mic === "confirm" && !!pending;
  const listening = mic === "rec" || confirming;
  const thinking = mic === "waiting" || ending;

  return (
    <main className="kids-screen" style={{ background: listening ? "#DDF3FF" : emo.sky }}>
      <div className="kids-hill" aria-hidden="true" />
      <header className="kids-top">
        <div className="kids-live">
          <span className="dot" aria-hidden="true" />
          리피와 영상통화 <span className="en muted">{elapsed}</span>
        </div>
        <button type="button" className="kids-end" aria-label="통화 끝내기" onClick={onEnd} disabled={ending}>
          <CloseIcon color="#FFFFFF" />
        </button>
      </header>

      <div className="kids-stars" role="img" aria-label={`대답 ${LESSON_TURNS}번 중 ${turns}번`}>
        {Array.from({ length: LESSON_TURNS }, (_, i) => (
          <Star key={i} size={26} on={i < turns} />
        ))}
      </div>

      {/* 리피 말풍선 (아이가 말하는 동안에는 숨긴다) */}
      {!listening && (
        <div className="kids-say" aria-live="polite">
          {thinking ? (
            <div className="kids-bubble">
              <div className="typing" aria-label="리피가 생각하고 있어요">
                <span /><span /><span />
              </div>
            </div>
          ) : lastTutor ? (
            <div className="kids-bubble" key={lastTutor.text}>
              <div className="kids-emo" style={{ color: emo.color }}>
                <span style={{ background: emo.color }} />
                {emo.label}
              </div>
              <div className="kids-line en" lang="en">{lastTutor.text}</div>
              {lastTutor.ko && <div className="kids-ko">{lastTutor.ko}</div>}
            </div>
          ) : null}
          <div className="kids-tail" aria-hidden="true" />
        </div>
      )}
      {listening && (
        <div className="kids-listening">
          <span className="dot" aria-hidden="true" />
          리피가 듣고 있어요
        </div>
      )}

      <div className="kids-reppy">
        <Reppy mood={mood} talking={talking} size={listening ? 240 : 270} />
      </div>

      {hint && !listening && (
        <div className="kids-hints">
          <div className="kids-hints-title">
            <BulbIcon /> 이렇게 말해 볼까?
          </div>
          {hint.answers.map((a) => (
            <button key={a.en} type="button" className="kids-hint" onClick={() => speak(a.en, { rate })}>
              <SpeakerIcon size={20} color="var(--accent-ink)" />
              <span>
                <b className="en" lang="en">{a.en}</b>
                <small>{a.ko}</small>
              </span>
            </button>
          ))}
        </div>
      )}

      {listening && (
        <div className="kids-me">
          <div className="kids-me-tail" aria-hidden="true" />
          <div className="kids-me-bubble">
            <small>{confirming ? "이렇게 말했어요" : "내가 하는 말"}</small>
            <span className="en" lang="en">{(confirming ? pending : partial) || "…"}</span>
            {confirming && (
              <span className="countdown light" aria-hidden="true">
                <i style={{ animationDuration: `${confirmMs}ms` }} />
              </span>
            )}
          </div>
        </div>
      )}

      {error && <p className="error kids-error" role="alert">{error}</p>}

      <div className="kids-controls">
        {confirming ? (
          <button type="button" className="kids-side warm" onClick={onRetry} aria-label="다시 말하기">
            <ReplayIcon size={24} color="#9A3F0B" />
            다시 말해
          </button>
        ) : (
          <button type="button" className="kids-side" onClick={onReplay} disabled={!lastTutor || listening || thinking} aria-label="다시 듣기">
            <ReplayIcon size={24} color="var(--accent-ink)" />
            다시
          </button>
        )}
        {confirming ? (
          <button type="button" className="kids-mic send" onClick={onSendNow} aria-label="보내기">
            <SendIcon size={38} color="#FFFFFF" />
            보내기
          </button>
        ) : (
          <button
            type="button"
            className={`kids-mic${listening ? " rec" : ""}`}
            onClick={onMic}
            disabled={thinking || !listenOk}
            aria-label={listening ? "다 말했어" : "말하기"}
          >
            {listening ? <span className="stop" aria-hidden="true" /> : <MicIcon size={38} color="#FFFFFF" />}
            {listening ? "다 말했어" : "말하기"}
          </button>
        )}
        <button type="button" className="kids-side warm" onClick={onHint} disabled={hintBusy || hintsLeft <= 0 || listening || thinking} aria-label="도와줘">
          <BulbIcon size={24} color="#9A3F0B" />
          도와줘
        </button>
      </div>
    </main>
  );
}

export function KidsReport({
  report,
  onDone,
  onFull,
  rate,
}: {
  report: LessonReport | null;
  onDone: () => void;
  onFull: () => void;
  rate: number;
}) {
  const stars = report ? starsFor(report.score) : 0;
  return (
    <main className="kids-done">
      <Reppy mood={report ? "proud" : "comfort"} size={200} />
      <h1 className="kids-done-title">{report ? "통화 끝! 정말 잘했어!" : "짧게 끝났어요"}</h1>
      {report ? (
        <div className="kids-done-stars" role="img" aria-label={`별 3개 중 ${stars}개`}>
          {[44, 56, 44].map((size, i) => (
            <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"
                fill={i < stars ? "#FFC93D" : "#FFFFFF"}
                stroke={i < stars ? "#E59A00" : "#E8D9A8"}
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
          ))}
        </div>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 16, textAlign: "center" }}>다음엔 리피랑 끝까지 이야기해 보자!</p>
      )}
      {report && report.expressions.length > 0 && (
        <section className="kids-words">
          <h2>오늘 배운 말</h2>
          {report.expressions.slice(0, 3).map((e) => (
            <div key={e.en} className="kids-word">
              <button type="button" className="round-btn" aria-label={`${e.en} 듣기`} onClick={() => speak(e.en, { rate })}>
                <SpeakerIcon size={22} color="var(--accent-ink)" />
              </button>
              <span>
                <b className="en" lang="en">{e.en}</b>
                <small>{e.ko}</small>
              </span>
            </div>
          ))}
        </section>
      )}
      <div style={{ flexGrow: 1 }} />
      <button type="button" className="kids-big-btn" onClick={onDone}>
        끝!
      </button>
      {report && (
        <button type="button" className="text-btn" onClick={onFull}>
          어른이 보는 자세한 리포트
        </button>
      )}
    </main>
  );
}
