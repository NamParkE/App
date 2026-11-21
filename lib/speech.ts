import { playSfx, recStartDelay, setRecording, setSpeaking } from "./sfx";

// 브라우저 내장 음성 합성(TTS)·인식(STT). 안드로이드 크롬 기준. API 비용 없음.

let cachedVoice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined && cachedVoice !== null) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  const us = voices.filter((v) => v.lang.replace("_", "-").startsWith("en-US"));
  cachedVoice =
    us.find((v) => /google/i.test(v.name)) ??
    us[0] ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null;
  return cachedVoice;
}

// ───── 듣기 속도 ─────
export const RATES = [
  { value: 0.6, label: "0.6×" },
  { value: 0.8, label: "0.8×" },
  { value: 1, label: "1×" },
  { value: 1.2, label: "1.2×" },
] as const;

const RATE_KEY = "ttsRate";
const DEFAULT_RATE = 0.8;

export function getRate(): number {
  try {
    const v = Number(localStorage.getItem(RATE_KEY));
    if (RATES.some((r) => r.value === v)) return v;
  } catch {}
  return DEFAULT_RATE;
}

/** 사용자가 직접 고른 속도. 고른 적 없으면 null (전화영어는 레벨 기본 속도를 쓴다) */
export function getSavedRate(): number | null {
  try {
    const raw = localStorage.getItem(RATE_KEY);
    if (raw === null) return null;
    const v = Number(raw);
    if (RATES.some((r) => r.value === v)) return v;
  } catch {}
  return null;
}

export function setRate(v: number) {
  try {
    localStorage.setItem(RATE_KEY, String(v));
  } catch {}
}

export function canSpeak() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, opts: { rate?: number; onEnd?: () => void } = {}) {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  setSpeaking(true);
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = opts.rate ?? getRate();
  const voice = pickVoice();
  if (voice) u.voice = voice;
  const done = () => {
    setSpeaking(false);
    opts.onEnd?.();
  };
  u.onend = done;
  u.onerror = done;
  synth.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
  setSpeaking(false);
}

// ───── 음성 인식 ─────

interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canListen() {
  return getCtor() !== null;
}

export interface Listener {
  stop(): void;
  abort(): void;
}

/**
 * 음성을 듣는다 (기본 영어, "한국어로 묻기"는 ko-KR). 말하는 동안 onPartial 로 중간 결과를, 끝나면 onDone 으로 최종 문장을 준다.
 */
export function listen(handlers: {
  onPartial: (text: string) => void;
  onDone: (text: string) => void;
  onError: (code: string) => void;
  lang?: "en-US" | "ko-KR";
  /** 효과음 · 시작 지연 없이 (이어 말하기에서 끊긴 인식을 조용히 다시 이을 때) */
  quiet?: boolean;
}): Listener | null {
  const Ctor = getCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = handlers.lang ?? "en-US";
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = 1;

  const finals: string[] = [];
  let interim = "";
  let failed = false;

  rec.onresult = (e) => {
    interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finals[i] = r[0].transcript.trim();
      else interim += r[0].transcript;
    }
    handlers.onPartial([...finals.filter(Boolean), interim.trim()].filter(Boolean).join(" "));
  };
  rec.onerror = (e) => {
    setRecording(false);
    if (e.error === "aborted") return;
    if (e.error === "no-speech") return; // onend 에서 빈 결과로 처리
    failed = true;
    handlers.onError(e.error);
  };
  rec.onend = () => {
    setRecording(false);
    if (failed) return;
    if (!handlers.quiet) playSfx("recStop");
    handlers.onDone([...finals.filter(Boolean), interim.trim()].filter(Boolean).join(" "));
  };
  // 녹음 시작 소리를 먼저 내고, 소리가 끝난 뒤 녹음을 시작한다 (효과음이 마이크에 섞이지 않게)
  if (!handlers.quiet) playSfx("recStart");
  let started = false;
  let cancelled = false;
  const begin = () => {
    if (cancelled) return;
    try {
      rec.start();
      started = true;
      setRecording(true);
    } catch {
      failed = true;
      handlers.onError("start-failed");
    }
  };
  const delay = handlers.quiet ? 0 : recStartDelay();
  if (delay) setTimeout(begin, delay);
  else begin();
  return {
    stop: () => {
      if (!started) {
        // 녹음이 시작되기 전에 멈춤: 아무 말도 안 한 것으로 처리
        cancelled = true;
        handlers.onDone("");
        return;
      }
      rec.stop();
    },
    abort: () => {
      failed = true;
      cancelled = true;
      setRecording(false);
      if (started) rec.abort();
    },
  };
}
