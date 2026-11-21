"use client";

import { playSfx } from "@/lib/sfx";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBackOverride } from "@/lib/back";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { canListen, getSavedRate, listen, speak, stopSpeaking, type Listener } from "@/lib/speech";
import { callLevel, LESSON_TURNS, LESSON_USAGE_COST, MAX_HINTS, MAX_SOS, MIN_TURNS_FOR_REPORT } from "@/lib/call/levels";
import type {
  ChatMessage,
  EndResponse,
  HintResponse,
  PlanExpression,
  ResumeResponse,
  ReviewItem,
  SosResponse,
  StartResponse,
  TurnResponse,
} from "@/lib/call/types";
import ReviewRunner from "@/components/ReviewRunner";
import RateControl from "@/components/RateControl";
import Flame, { flameBadge } from "@/components/Flame";
import Reppy, { type ReppyMood } from "@/components/Reppy";
import { KidsCall, KidsReport } from "./KidsView";
import { BulbIcon, CheckIcon, CloseIcon, HelpIcon, InfoIcon, MicIcon, PhoneIcon, ReplayIcon, SendIcon, SpeakerIcon, SpinnerIcon } from "@/components/Icons";

const SCREEN_KEY = "callScreen";

type Phase = "review" | "starting" | "prep" | "call" | "ending" | "report" | "error";
type Mic = "idle" | "rec" | "confirm" | "waiting";

/** 녹음을 멈춘 뒤 자동으로 보내기까지 기다리는 시간 (그 사이 "다시 말하기" 가능) */
const CONFIRM_MS = 3000;

interface Shown extends ChatMessage {
  id: number;
  showText: boolean;
  showKo: boolean;
  /** "한국어로 묻기"로 한 말 (화면에만 보이고 서버 대화에는 없다) */
  sos?: boolean;
}

const MIC_ERRORS: Record<string, string> = {
  "not-allowed": "마이크 권한이 꺼져 있어요. 설정에서 이 앱의 마이크를 허용해 주세요.",
  "service-not-allowed": "마이크 권한이 꺼져 있어요. 설정에서 이 앱의 마이크를 허용해 주세요.",
  "audio-capture": "마이크를 찾을 수 없어요.",
  network: "음성 인식에 인터넷 연결이 필요해요.",
};

async function post<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) return { ok: false, message: "인터넷 연결을 확인해 주세요." };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, message: data.message ?? "잠시 후 다시 시도해 주세요." };
  return { ok: true, data: data as T };
}

function mmss(sec: number) {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

export default function CallSession({
  level,
  name,
  topicId,
  resumeId,
  reviewItems,
}: {
  level: number;
  name: string;
  topicId: string | null;
  /** 끊긴 통화 이어하기 */
  resumeId: string | null;
  reviewItems: ReviewItem[];
}) {
  const router = useRouter();
  const L = callLevel(level);
  const [phase, setPhase] = useState<Phase>(reviewItems.length && !resumeId ? "review" : "starting");
  const [error, setError] = useState<string | null>(null);
  const [lesson, setLesson] = useState<StartResponse | null>(null);
  const [messages, setMessages] = useState<Shown[]>([]);
  const [turns, setTurns] = useState(0);
  const [mic, setMic] = useState<Mic>("idle");
  const [partial, setPartial] = useState("");
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [hint, setHint] = useState<HintResponse | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [hintsLeft, setHintsLeft] = useState(MAX_HINTS);
  const [sos, setSos] = useState<SosResponse | null>(null);
  const [sosBusy, setSosBusy] = useState(false);
  const [sosLeft, setSosLeft] = useState(MAX_SOS);
  /** 지금 듣는 말이 한국어(한국어로 묻기)인지 */
  const [listenKo, setListenKo] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  // 도움 4가지(다시 듣기 · 천천히 · 대답 예시 · 한국어로 묻기)는 "도움" 버튼 하나 뒤의 시트로
  const [helpOpen, setHelpOpen] = useState(false);
  /** 방금 대답을 세지 않았을 때의 안내 */
  const [skipNote, setSkipNote] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<EndResponse | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [levelNote, setLevelNote] = useState<string | null>(null);
  const [listenOk, setListenOk] = useState(true);
  const [screen, setScreen] = useState<"chat" | "video">(level <= 2 ? "video" : "chat");
  const [showFullReport, setShowFullReport] = useState(false);
  const kids = screen === "video";
  const listener = useRef<Listener | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(1);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const finished = useRef(false);
  /** 이어하기: 통화 시작 때 보여 줄 지금까지의 대화 */
  const resumed = useRef<ChatMessage[] | null>(null);

  // 어린이 모드에서는 리피가 더 천천히 말한다 (직접 고른 속도가 있으면 그대로)
  const rate = useCallback(() => getSavedRate() ?? (kids ? Math.min(L.rate, 0.75) : L.rate), [L.rate, kids]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SCREEN_KEY);
      if (saved === "chat" || saved === "video") setScreen(saved);
    } catch {}
    setListenOk(canListen());
    return () => {
      listener.current?.abort();
      stopSpeaking();
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  // 통화 중 휴대폰 뒤로가기: 바로 나가지 않고 "통화를 끝낼까요?" (열린 창이 있으면 그 창을 닫는다)
  useBackOverride(phase === "call", () => {
    if (confirmEnd) setConfirmEnd(false);
    else if (helpOpen) setHelpOpen(false);
    else setConfirmEnd(true);
  });

  // 통화 시간
  useEffect(() => {
    if (phase !== "call") return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // 새 말풍선이 생기면 아래로
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, partial, mic, hint]);

  const sayTutor = useCallback(
    (m: Shown, after?: () => void) => {
      setSpeakingId(m.id);
      speak(m.text, {
        rate: rate(),
        onEnd: () => {
          setSpeakingId((cur) => (cur === m.id ? null : cur));
          after?.();
        },
      });
    },
    [rate],
  );

  function addMessage(m: ChatMessage): Shown {
    const shown: Shown = { ...m, id: nextId.current++, showText: m.role === "user" || L.captions, showKo: false };
    setMessages((list) => [...list, shown]);
    return shown;
  }

  // ───── 수업 시작 (사용량 차감 + 계획) · 또는 끊긴 통화 이어하기 ─────
  const start = useCallback(async () => {
    setPhase("starting");
    setError(null);
    if (resumeId) {
      const r = await post<ResumeResponse>("/api/call/resume", { lessonId: resumeId });
      if (!r.ok) {
        setError(r.message);
        setPhase("error");
        return;
      }
      resumed.current = r.data.history;
      setTurns(r.data.turns);
      setHintsLeft(r.data.hintsLeft);
      setSosLeft(r.data.sosLeft);
      setLesson(r.data);
      setPhase("prep");
      return;
    }
    const r = await post<StartResponse>("/api/call/start", { topicId });
    if (!r.ok) {
      setError(r.message);
      setPhase("error");
      return;
    }
    setLesson(r.data);
    setPhase("prep");
  }, [topicId, resumeId]);

  useEffect(() => {
    if (phase === "starting" && !lesson) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function beginCall() {
    if (!lesson) return;
    setPhase("call");
    playSfx("connect");
    const history = resumed.current;
    if (history?.length) {
      // 이어하기: 지금까지의 대화를 보여 주고 선생님 마지막 말을 다시 들려준다
      let last: Shown | null = null;
      for (const m of history) {
        const shown = addMessage(m);
        if (m.role === "tutor") last = shown;
      }
      const lastShown = last;
      if (lastShown) setTimeout(() => sayTutor(lastShown), 650);
      return;
    }
    const first = addMessage({ ...lesson.opening, emotion: "happy" });
    // 전화 연결음이 끝난 뒤 리피가 말한다
    setTimeout(() => sayTutor(first), 650);
  }

  // ───── 수업 끝내기 → 리포트 ─────
  const end = useCallback(
    async (expectedTurns: number) => {
      if (!lesson || finished.current) return;
      finished.current = true;
      listener.current?.abort();
      playSfx("hangup");
      setPhase("ending");
      const r = await post<EndResponse>("/api/call/end", { lessonId: lesson.lessonId, expectedTurns });
      if (!r.ok) {
        finished.current = false;
        setCallError(r.message);
        setPhase("call");
        return;
      }
      setResult(r.data);
      setPhase("report");
      if (r.data.milestone) {
        setShowCelebration(true);
        playSfx("streak");
      } else if (r.data.report) {
        playSfx("lessonDone");
      }
    },
    [lesson],
  );

  // ───── 내 대답 보내기 ─────
  async function send(said: string) {
    if (!lesson) return;
    setMic("waiting");
    setHint(null);
    setSos(null);
    setSkipNote(false);
    setCallError(null);
    const mine = addMessage({ role: "user", text: said });
    setPartial("");
    const r = await post<TurnResponse>("/api/call/turn", { lessonId: lesson.lessonId, said, kids });
    if (!r.ok) {
      // 내 말풍선은 남기고, 다시 말할 수 있게 한다
      setCallError(r.message);
      setMessages((list) => list.slice(0, -1));
      setMic("idle");
      return;
    }
    setTurns(r.data.turns);
    if (!r.data.counted) {
      setMessages((list) => list.map((m) => (m.id === mine.id ? { ...m, counted: false } : m)));
      setSkipNote(true);
    }
    const shown = addMessage(r.data.reply);
    setMic("idle");
    // 짹짹 소리로 대답 도착을 알리고, 이어서 리피가 말한다. 마지막 대답이면 인사가 끝난 뒤 리포트로
    playSfx("chirp");
    setTimeout(() => sayTutor(shown, r.data.done ? () => void end(r.data.turns) : undefined), 220);
    if (r.data.done) setTimeout(() => void end(r.data.turns), 15000); // 소리가 안 나는 기기 대비
  }

  function onMic(korean?: boolean) {
    // 이벤트 객체가 넘어와도 한국어 모드가 켜지지 않게 true 일 때만
    const ko = korean === true;
    if (mic === "rec") {
      listener.current?.stop();
      return;
    }
    if (mic === "confirm" && pending) {
      sendPending(pending);
      return;
    }
    if (mic !== "idle") return;
    startRecording(ko);
  }

  function startRecording(ko: boolean) {
    stopSpeaking();
    setSpeakingId(null);
    setCallError(null);
    setPartial("");
    setListenKo(ko);
    const l = listen({
      lang: ko ? "ko-KR" : "en-US",
      onPartial: setPartial,
      onDone: (text) => {
        listener.current = null;
        if (!text.trim()) {
          setCallError("잘 들리지 않았어요. 버튼을 누르고 다시 말해 보세요.");
          setMic("idle");
          return;
        }
        if (ko) {
          void askSos(text.trim());
          return;
        }
        // 바로 보내지 않고 3초 동안 보여 준다. 그 사이 "다시 말하기"로 취소할 수 있다
        const said = text.trim();
        setPartial(said);
        setPending(said);
        setMic("confirm");
        if (confirmTimer.current) clearTimeout(confirmTimer.current);
        confirmTimer.current = setTimeout(() => sendPending(said), CONFIRM_MS);
      },
      onError: (code) => {
        listener.current = null;
        setCallError(MIC_ERRORS[code] ?? "음성 인식이 멈췄어요. 다시 시도해 주세요.");
        setMic("idle");
      },
    });
    if (!l) {
      setListenOk(false);
      return;
    }
    listener.current = l;
    setMic("rec");
  }

  function sendPending(said: string) {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = null;
    setPending(null);
    void send(said);
  }

  /** 방금 말한 것을 버리고 바로 다시 녹음 */
  function retrySpeak() {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = null;
    setPending(null);
    setPartial("");
    setMic("idle");
    playSfx("tap");
    // 상태가 idle 로 바뀐 다음 녹음을 시작한다
    setTimeout(() => startRecording(false), 0);
  }

  // ───── 한국어로 묻기 (대답 수에는 넣지 않는다) ─────
  async function askSos(said: string) {
    if (!lesson) return;
    setMic("waiting");
    setSosBusy(true);
    setHint(null);
    setSos(null);
    setPartial("");
    const mine = addMessage({ role: "user", text: said });
    setMessages((list) => list.map((m) => (m.id === mine.id ? { ...m, sos: true } : m)));
    const r = await post<SosResponse>("/api/call/sos", { lessonId: lesson.lessonId, said });
    setSosBusy(false);
    setMic("idle");
    if (!r.ok) {
      setCallError(r.message);
      setMessages((list) => list.filter((m) => m.id !== mine.id));
      return;
    }
    setSos(r.data);
    setSosLeft(r.data.sosLeft);
    speak(r.data.answer.en, { rate: rate() });
  }

  function onEndPress() {
    if (turns >= MIN_TURNS_FOR_REPORT) void end(turns);
    else setConfirmEnd(true);
  }

  async function askHint() {
    if (!lesson || hintBusy || hintsLeft <= 0) return;
    setHintBusy(true);
    const r = await post<HintResponse>("/api/call/hint", { lessonId: lesson.lessonId, kids });
    setHintBusy(false);
    if (!r.ok) {
      setCallError(r.message);
      return;
    }
    playSfx("hint");
    setHint(r.data);
    setHintsLeft(r.data.hintsLeft);
  }

  const lastTutor = [...messages].reverse().find((m) => m.role === "tutor");
  const headMood: ReppyMood = speakingId !== null ? "talk" : mic === "waiting" || phase === "ending" ? "think" : "idle";

  /** 자막과 한글 뜻을 함께 켜고 끈다 */
  function toggleSub(id: number) {
    setMessages((list) =>
      list.map((m) => {
        if (m.id !== id) return m;
        const on = m.showText && (m.showKo || !m.ko);
        return { ...m, showText: !on, showKo: !on };
      }),
    );
  }

  async function changeLevel(to: number) {
    const { error } = await createClient()
      .from("profiles")
      .update({ call_level: to, call_level_since: new Date().toISOString() })
      .eq("id", (await createClient().auth.getUser()).data.user?.id ?? "");
    if (!error) playSfx(to > (lesson?.level ?? 0) ? "levelUp" : "tap");
    setLevelNote(error ? "레벨을 바꾸지 못했어요. 내 정보에서 바꿀 수 있어요." : `Lv.${to} ${callLevel(to).name}(으)로 바꿨어요. 다음 수업부터 적용돼요.`);
  }

  // ───── 화면 ─────

  if (phase === "review") {
    return (
      <main className="screen">
        <div className="pad">
          <div className="topbar">
            <Link href="/home" className="icon-btn" aria-label="닫기">
              <CloseIcon />
            </Link>
            <h1>수업 전 복습</h1>
          </div>
          <ReviewRunner items={reviewItems} onDone={() => void start()} doneLabel="수업 시작하기" />
          <button type="button" className="text-btn" onClick={() => void start()}>
            복습 건너뛰고 수업 시작
          </button>
        </div>
      </main>
    );
  }

  if (phase === "starting" || phase === "error") {
    return (
      <main className="screen">
        <div className="pad" style={{ justifyContent: "center", alignItems: "center", textAlign: "center", gap: 14 }}>
          {phase === "starting" ? (
            <>
              <span style={{ display: "flex" }}>
                <Reppy mood="think" size={140} decorative />
              </span>
              <div style={{ fontSize: 16, fontWeight: 700 }}>리피에게 전화 거는 중…</div>
              <div className="muted" style={{ fontSize: 14 }}>오늘 수업을 준비하고 있어요</div>
            </>
          ) : (
            <>
              <p className="error" role="alert">{error}</p>
              <div className="btn-row" style={{ width: "100%" }}>
                <Link href="/home" className="btn btn-outline">홈으로</Link>
                <button type="button" className="btn btn-primary" onClick={() => void start()}>다시 시도</button>
              </div>
            </>
          )}
        </div>
      </main>
    );
  }

  if (phase === "prep" && lesson) {
    return (
      <main className="screen">
        <div className="pad">
          <div className="topbar">
            <Link href="/home" className="icon-btn" aria-label="닫기">
              <CloseIcon />
            </Link>
            <h1>오늘의 수업</h1>
            <span className="badge">Lv.{lesson.level}</span>
          </div>
          <section className="card">
            <div className="label">주제</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{lesson.topic.title_ko}</div>
            <div className="en muted" style={{ fontSize: 14 }}>{lesson.topic.title_en} · 대답 {LESSON_TURNS}번 · 약 10분</div>
          </section>
          <section className="card">
            <div className="label">미리 들어 볼 핵심 표현</div>
            {lesson.expressions.map((e: PlanExpression) => (
              <div key={e.en} className="row" style={{ alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <div className="en" lang="en" style={{ fontWeight: 600, fontSize: 15 }}>{e.en}</div>
                  <div className="ko-line">{e.ko}</div>
                </div>
                <button type="button" className="round-btn" aria-label={`${e.en} 듣기`} onClick={() => speak(e.example || e.en, { rate: rate() })}>
                  <SpeakerIcon />
                </button>
              </div>
            ))}
          </section>
          <section className="card" aria-label="통화 화면">
            <div className="label">통화 화면</div>
            <div className="btn-row" role="radiogroup" aria-label="통화 화면">
              {(
                [
                  ["chat", "채팅", "글과 함께 보기"],
                  ["video", "영상통화", "어린이 모드"],
                ] as const
              ).map(([id, title, sub]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={screen === id}
                  aria-pressed={screen === id}
                  className="choice"
                  style={{ flexDirection: "column", gap: 2, alignItems: "flex-start" }}
                  onClick={() => {
                    setScreen(id);
                    playSfx("tap");
                    try {
                      localStorage.setItem(SCREEN_KEY, id);
                    } catch {}
                  }}
                >
                  <span className="choice-title">{title}</span>
                  <span className="choice-desc">{sub}</span>
                </button>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              레벨 1~2는 영상통화가 기본이에요. 고른 화면은 다음 수업에도 그대로예요.
            </div>
          </section>
          <RateControl />
          <p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            리피 말이 끝나면 마이크 버튼을 누르고 대답하세요. 막히면 왼쪽 아래 "도움"을 누르세요.
          </p>
        </div>
        <div className="bottom">
          <button type="button" className="btn btn-primary" onClick={beginCall}>
            <PhoneIcon color="#FFFFFF" />
            {resumeId ? `통화 이어하기 (대답 ${turns}/${LESSON_TURNS})` : "통화 시작"}
          </button>
        </div>
      </main>
    );
  }

  if ((phase === "call" || phase === "ending") && lesson && kids) {
    return (
      <KidsCall
        lastTutor={lastTutor}
        speaking={speakingId !== null}
        mic={mic}
        partial={partial}
        pending={pending}
        onRetry={retrySpeak}
        onSendNow={() => pending && sendPending(pending)}
        confirmMs={CONFIRM_MS}
        turns={turns}
        elapsed={mmss(elapsed)}
        hint={hint}
        hintBusy={hintBusy}
        hintsLeft={hintsLeft}
        error={callError}
        ending={phase === "ending"}
        listenOk={listenOk}
        rate={rate()}
        onMic={() => onMic(false)}
        onReplay={() => lastTutor && sayTutor(lastTutor)}
        onHint={() => void askHint()}
        onEnd={() => {
          if (turns >= MIN_TURNS_FOR_REPORT || confirm("리피랑 조금 더 이야기하면 별을 받을 수 있어요. 끝낼까요?")) void end(turns);
        }}
      />
    );
  }

  if ((phase === "call" || phase === "ending") && lesson) {
    return (
      <main className="screen call-screen">
        <header className="call-head">
          <div className="reppy-avatar">
            <Reppy mood={headMood} size={58} decorative />
          </div>
          <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              리피 선생님 <span className="en" style={{ fontSize: 12, color: "var(--accent)" }}>Lv.{lesson.level}</span>
            </div>
            <div className="call-status">
              <span className="dot" aria-hidden="true" />
              통화 중 <span className="en">{mmss(elapsed)}</span> · 대답 <span className="en">{turns}/{LESSON_TURNS}</span>
            </div>
          </div>
          <button
            type="button"
            className="end-btn"
            onClick={onEndPress}
            disabled={phase === "ending"}
          >
            끝내기
          </button>
        </header>

        <div className="chat" aria-live="polite">
          {messages.map((m) =>
            m.role === "tutor" ? (
              <div key={m.id} className={`msg tutor${speakingId === m.id ? " speaking" : ""}`}>
                {/* 말풍선을 누르면 다시 듣기 */}
                <button type="button" className="msg-bubble bubble-btn" onClick={() => sayTutor(m)} aria-label="리피 말 다시 듣기">
                  {speakingId === m.id && (
                    <span className="speaking-label">
                      <SpeakerIcon size={14} /> 말하는 중
                    </span>
                  )}
                  {m.showText ? (
                    <span className="en" lang="en">{m.text}</span>
                  ) : (
                    <span className="hidden-lines" aria-label="자막이 가려져 있어요">
                      <span style={{ width: "92%" }} />
                      <span style={{ width: "64%" }} />
                    </span>
                  )}
                  {m.showKo && m.ko && <span className="ko-line" style={{ fontSize: 14 }}>{m.ko}</span>}
                </button>
                <div className="msg-tools">
                  <button type="button" onClick={() => toggleSub(m.id)}>
                    {m.showText && (m.showKo || !m.ko) ? "자막 · 뜻 숨기기" : "자막 · 뜻 보기"}
                  </button>
                </div>
                {m.correction && (
                  <div className="fix-chip">
                    <span className="en">{m.correction.wrong} → {m.correction.right}</span>
                    {m.correction.note}
                  </div>
                )}
              </div>
            ) : (
              <div key={m.id} className={`msg user${m.sos ? " sos" : ""}${m.counted === false ? " skipped" : ""}`}>
                {m.sos && <div className="msg-label">한국어로 물었어요</div>}
                <div className={`msg-bubble${m.sos ? "" : " en"}`} lang={m.sos ? "ko" : "en"}>{m.text}</div>
                {m.counted === false && (
                  <div className="skip-chip">
                    <InfoIcon /> 대답 수에 넣지 않았어요
                  </div>
                )}
              </div>
            ),
          )}
          {mic === "rec" && (
            <div className="msg user">
              <div className={`msg-bubble pending${listenKo ? "" : " en"}`} lang={listenKo ? "ko" : "en"}>
                {partial || (listenKo ? "한국어로 말해 보세요…" : "듣는 중…")}
              </div>
            </div>
          )}
          {mic === "confirm" && pending && (
            <div className="msg user">
              <div className="msg-bubble pending confirm-bubble">
                <span className="en" lang="en">{pending}</span>
                <span className="countdown" aria-hidden="true">
                  <i style={{ animationDuration: `${CONFIRM_MS}ms` }} />
                </span>
                <span className="confirm-note">곧 리피에게 보내요</span>
              </div>
              <div className="confirm-actions">
                <button type="button" className="chip" onClick={retrySpeak}>
                  <ReplayIcon size={14} /> 다시 말하기
                </button>
                <button type="button" className="chip send-chip" onClick={() => sendPending(pending)}>
                  바로 보내기
                </button>
              </div>
            </div>
          )}
          {mic === "waiting" && (
            <div className="msg tutor">
              <div className="reppy-row">
                <Reppy mood="think" size={44} decorative />
                <div className="msg-bubble typing" aria-label="리피가 대답을 준비하고 있어요">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}
          {hint && (
            <div className="card hint-card">
              <div className="label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <BulbIcon /> 이렇게 말해 보세요
              </div>
              {hint.answers.map((a) => (
                <div key={a.en} className="row" style={{ alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <div className="en" lang="en" style={{ fontWeight: 600 }}>{a.en}</div>
                    <div className="ko-line">{a.ko}</div>
                  </div>
                  <button type="button" className="round-btn" aria-label="예시 듣기" onClick={() => speak(a.en, { rate: rate() })}>
                    <SpeakerIcon size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {sos && (
            <section className="card hint-card" aria-label="영어로는 이렇게 말해요">
              <div className="label">영어로는 이렇게 말해요</div>
              <div className="row" style={{ alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <div className="en" lang="en" style={{ fontWeight: 600, fontSize: 17 }}>{sos.answer.en}</div>
                  <div className="ko-line">{sos.answer.ko}</div>
                </div>
                <button type="button" className="round-btn" aria-label="예시 듣기" onClick={() => speak(sos.answer.en, { rate: rate() })}>
                  <SpeakerIcon size={18} />
                </button>
              </div>
              <div className="muted" style={{ fontSize: 13 }}>듣고 마이크를 눌러 따라 말해 보세요. 그러면 대답 1번으로 세요.</div>
            </section>
          )}
          {skipNote && mic === "idle" && (
            <p className="skip-note">질문에 맞게 대답하면 <b className="en">{turns + 1}/{LESSON_TURNS}</b>로 넘어가요</p>
          )}
          {phase === "ending" && (
            <div className="muted" style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", padding: 12, fontSize: 14 }}>
              <Reppy mood="think" size={48} decorative /> 리포트를 만드는 중…
            </div>
          )}
          {callError && <p className="error" role="alert">{callError}</p>}
          <div ref={bottomRef} />
        </div>

        <div className="call-controls">
          <div className="mic-row">
            <button
              type="button"
              className="help-btn"
              onClick={() => setHelpOpen(true)}
              disabled={phase === "ending" || mic === "rec" || mic === "waiting"}
              aria-haspopup="dialog"
            >
              <HelpIcon size={18} /> 도움
            </button>
          <button
            type="button"
            className={`mic${mic === "rec" ? " rec" : ""}${mic === "waiting" ? " thinking" : ""}`}
            aria-label={mic === "rec" ? "녹음 멈추기" : mic === "confirm" ? "바로 보내기" : "녹음 시작"}
            onClick={() => onMic(false)}
            disabled={mic === "waiting" || phase === "ending" || !listenOk}
          >
            {mic === "confirm" ? (
              <SendIcon size={32} color="#FFFFFF" />
            ) : mic === "rec" ? (
              <span style={{ width: 28, height: 28, borderRadius: 6, background: "#fff" }} />
            ) : mic === "waiting" ? (
              <SpinnerIcon size={32} color="#FFFFFF" />
            ) : (
              <MicIcon size={34} color="#FFFFFF" />
            )}
          </button>
            <span />
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {!listenOk
              ? "이 브라우저는 음성 인식을 지원하지 않아요. 크롬에서 열어 주세요."
              : mic === "rec"
                ? listenKo
                  ? "한국어로 말하고, 다 말했으면 버튼을 눌러 멈추세요"
                  : "다 말했으면 버튼을 눌러 멈추세요"
                : mic === "confirm"
                  ? "잘못 말했으면 '다시 말하기'를 누르세요"
                : mic === "waiting"
                  ? "리피가 대답을 준비하고 있어요"
                  : "리피 말이 끝나면 버튼을 누르고 대답하세요"}
          </div>
        </div>
        {helpOpen && (
          <div className="sheet-backdrop" onClick={() => setHelpOpen(false)}>
            <div className="sheet" role="dialog" aria-modal="true" aria-label="도움" onClick={(e) => e.stopPropagation()}>
              <h2 className="section-title">어떤 도움이 필요해요?</h2>
              <div className="help-list">
                <button
                  type="button"
                  disabled={!lastTutor}
                  onClick={() => {
                    setHelpOpen(false);
                    if (lastTutor) sayTutor(lastTutor);
                  }}
                >
                  <span>다시 듣기</span>
                  <span className="muted">리피 말을 한 번 더</span>
                </button>
                <button
                  type="button"
                  disabled={!lastTutor}
                  onClick={() => {
                    setHelpOpen(false);
                    if (!lastTutor) return;
                    setSpeakingId(lastTutor.id);
                    speak(lastTutor.text, { rate: 0.6, onEnd: () => setSpeakingId(null) });
                  }}
                >
                  <span>천천히 듣기</span>
                  <span className="muted en">0.6×</span>
                </button>
                <button
                  type="button"
                  disabled={hintBusy || hintsLeft <= 0 || mic !== "idle"}
                  onClick={() => {
                    setHelpOpen(false);
                    void askHint();
                  }}
                >
                  <span>대답 예시 보기</span>
                  <span className="muted">{hintsLeft > 0 ? `${hintsLeft}번 남음` : "다 썼어요"}</span>
                </button>
                <button
                  type="button"
                  disabled={sosBusy || sosLeft <= 0 || mic !== "idle" || !listenOk}
                  onClick={() => {
                    setHelpOpen(false);
                    onMic(true);
                  }}
                >
                  <span>한국어로 묻기</span>
                  <span className="muted">{sosLeft > 0 ? `${sosLeft}번 남음` : "다 썼어요"}</span>
                </button>
              </div>
              <button type="button" className="text-link" onClick={() => setHelpOpen(false)}>
                닫기
              </button>
            </div>
          </div>
        )}
        {confirmEnd && (
          <div className="sheet-backdrop" onClick={() => setConfirmEnd(false)}>
            <div className="sheet" role="dialog" aria-modal="true" aria-label="통화를 끝낼까요" onClick={(e) => e.stopPropagation()}>
              <h2 className="section-title" style={{ fontSize: 20 }}>통화를 끝낼까요?</h2>
              <div className="card" style={{ fontSize: 14, lineHeight: 1.5 }}>
                {turns >= MIN_TURNS_FOR_REPORT ? (
                  <div>
                    지금 끝내면 <b>대답 {turns}번</b>까지로 리포트를 만들어요.
                  </div>
                ) : (
                  <div>
                    <b>대답 {MIN_TURNS_FOR_REPORT}번</b>부터 리포트와 연속 학습일이 생겨요. 지금은 <b>{turns}번</b>이라 리포트 없이 끝나요.
                  </div>
                )}
              </div>
              {turns >= MIN_TURNS_FOR_REPORT ? null : turns === 0 ? (
                <div className="refund-note ok">
                  <CheckIcon size={18} color="var(--ok-ink)" /> 아직 대답을 안 해서 오늘 연습 {LESSON_USAGE_COST}회를 돌려드려요
                </div>
              ) : (
                <div className="refund-note">대답을 이미 해서 연습 {LESSON_USAGE_COST}회는 돌려드리지 않아요</div>
              )}
              <div className="btn-row">
                <button type="button" className="btn btn-outline" onClick={() => setConfirmEnd(false)}>계속하기</button>
                <button
                  type="button"
                  className="btn btn-warn"
                  onClick={() => {
                    setConfirmEnd(false);
                    void end(turns);
                  }}
                >
                  끝내기
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  // ───── 리포트 ─────
  if (phase === "report" && result && kids && !showFullReport) {
    return (
      <>
        <KidsReport
          report={result.report}
          rate={rate()}
          onFull={() => setShowFullReport(true)}
          onDone={() => {
            router.replace("/home");
            router.refresh();
          }}
        />
        {showCelebration && result.milestone && (
          <div className="celebrate" role="dialog" aria-modal="true" aria-label={`${result.milestone}일 연속 학습`}>
            <div className="celebrate-flame">
              <Reppy mood="wave" size={150} decorative />
              <span className="celebrate-mini-flame">
                <Flame streak={result.milestone} size={56} />
              </span>
            </div>
            <div className="celebrate-num en">
              {result.milestone}
              <span>일</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>연속으로 학습했어요!</div>
            <div style={{ flexGrow: 1 }} />
            <button type="button" className="btn" style={{ background: "#fff", color: "var(--ink)" }} onClick={() => setShowCelebration(false)}>
              계속하기
            </button>
          </div>
        )}
      </>
    );
  }

  if (phase === "report" && result) {
    const r = result.report;
    const lp = result.levelProgress;
    return (
      <main className="screen">
        <div className="pad" style={{ gap: 12 }}>
          <div className="row" style={{ alignItems: "center" }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>수업 리포트</h1>
            <span className="streak-chip">
              <Flame streak={result.streak} size={20} />
              <b className="en">{result.streak}</b>
              <span>일</span>
            </span>
          </div>

          {!r ? (
            <section className="card">
              <div style={{ fontSize: 16, fontWeight: 700 }}>짧게 끝난 수업이에요</div>
              <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
                대답이 {MIN_TURNS_FOR_REPORT}번보다 적어서 리포트 없이 끝났어요. 다음엔 끝까지 이야기해 봐요!
              </div>
              {result.refunded && (
                <div className="refund-note ok">
                  <CheckIcon size={18} color="var(--ok-ink)" /> 오늘 연습 {LESSON_USAGE_COST}회를 돌려드렸어요
                </div>
              )}
            </section>
          ) : (
            <>
              <section className="card" style={{ gap: 12 }}>
                <div className="row" style={{ alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div className="muted" style={{ fontSize: 13 }}>{lesson?.topic.title_ko} · Lv.{lesson?.level}</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{r.headline}</div>
                  </div>
                  <div className="score" style={{ fontSize: 40 }}>{r.score}</div>
                </div>
                <div className="parts">
                  {(
                    [
                      ["알아듣기", r.parts.listening],
                      ["표현", r.parts.expression],
                      ["정확성", r.parts.accuracy],
                      ["말하기 양", r.parts.amount],
                    ] as const
                  ).map(([label, v]) => (
                    <div key={label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div className="row" style={{ fontSize: 12 }}>
                        <span className="muted">{label}</span>
                        <b className="en">{v}/25</b>
                      </div>
                      <div className="track">
                        <div style={{ width: `${(v / 25) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="usage" style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: "14px 16px" }}>
                <div className="segments" role="img" aria-label={`80점 이상 ${lp.good}/${lp.needed}`}>
                  {Array.from({ length: lp.needed }, (_, i) => (
                    <div key={i} className={i < lp.good ? "on" : undefined} />
                  ))}
                </div>
                <div style={{ fontSize: 14, flexGrow: 1 }}>
                  {result.suggest === "up" ? "80점 이상 3번 달성!" : result.suggest === "down" ? "조금 어려웠나요?" : `80점 이상 ${lp.good}/${lp.needed}`}
                </div>
                {result.suggest === "up" && !levelNote && (
                  <button type="button" className="level-btn" onClick={() => void changeLevel(lp.level + 1)}>
                    Lv.{lp.level + 1} 도전
                  </button>
                )}
                {result.suggest === "down" && !levelNote && (
                  <button type="button" className="level-btn" onClick={() => void changeLevel(lp.level - 1)}>
                    Lv.{lp.level - 1}로
                  </button>
                )}
              </section>
              {levelNote && <p className="notice">{levelNote}</p>}

              {r.corrections.length > 0 && (
                <section className="card">
                  <div className="label">교정 노트</div>
                  {r.corrections.map((c, i) => (
                    <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: i ? 8 : 0, borderTop: i ? "1px solid var(--line-soft)" : undefined }}>
                      <div className="en muted" lang="en" style={{ fontSize: 14, textDecoration: "line-through" }}>{c.said}</div>
                      <div className="row" style={{ alignItems: "center" }}>
                        <div className="en" lang="en" style={{ fontSize: 15, fontWeight: 600 }}>{c.better}</div>
                        <button type="button" className="round-btn" aria-label="고친 문장 듣기" onClick={() => speak(c.better, { rate: rate() })}>
                          <SpeakerIcon size={18} />
                        </button>
                      </div>
                      <div className="ko-line">{c.note}</div>
                    </div>
                  ))}
                </section>
              )}

              {r.expressions.length > 0 && (
                <section className="card">
                  <div className="label">오늘의 새 표현 · 표현장에 저장됨</div>
                  {r.expressions.map((e) => (
                    <div key={e.en} className="row" style={{ fontSize: 14 }}>
                      <span className="en" lang="en" style={{ fontWeight: 600 }}>{e.en}</span>
                      <span className="muted">{e.ko}</span>
                    </div>
                  ))}
                </section>
              )}

              {showTranscript && (
                <section className="card">
                  <div className="label">대화 다시 보기</div>
                  {messages.filter((m) => !m.sos).map((m) => (
                    <div key={m.id} style={{ fontSize: 14, lineHeight: 1.5 }}>
                      <b>{m.role === "tutor" ? "리피" : name}</b> <span className="en" lang="en">{m.text}</span>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
        {/* 큰 버튼은 "완료" 하나, 대화 다시 보기는 작은 링크 */}
        <div className="bottom" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              router.replace("/home");
              router.refresh();
            }}
          >
            완료
          </button>
          {r && (
            <button type="button" className="text-link" onClick={() => setShowTranscript((v) => !v)}>
              {showTranscript ? "대화 접기" : "대화 다시 보기"}
            </button>
          )}
        </div>

        {showCelebration && result.milestone && (
          <div className="celebrate" role="dialog" aria-modal="true" aria-label={`${result.milestone}일 연속 학습`}>
            <div className="celebrate-flame">
              <Reppy mood="wave" size={150} decorative />
              <span className="celebrate-mini-flame">
                <Flame streak={result.milestone} size={56} />
              </span>
            </div>
            {flameBadge(result.milestone) && <div className="celebrate-badge">{flameBadge(result.milestone)} 배지 획득</div>}
            <div className="celebrate-num en">
              {result.milestone}
              <span>일</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>연속으로 학습했어요!</div>
            <div style={{ color: "var(--dark-muted)", fontSize: 15, textAlign: "center", lineHeight: 1.5 }}>
              <span className="en" style={{ fontWeight: 600 }}>Amazing!</span> 리피랑 내일도 이야기해요!
            </div>
            <div style={{ flexGrow: 1 }} />
            <button type="button" className="btn" style={{ background: "#fff", color: "var(--ink)" }} onClick={() => setShowCelebration(false)}>
              계속하기
            </button>
          </div>
        )}
      </main>
    );
  }

  return null;
}
