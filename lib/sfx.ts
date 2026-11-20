// 효과음 (Web Audio 로 바로 합성, 소리 파일 없음). 승인된 시안: https://claude.ai/artifact/CzjcqpfQoCn7MFGh7bM3in
// 규칙: 녹음 중에는 소리를 내지 않고, 음성(TTS)이 나오는 동안에는 작게 낸다. 설정은 기기마다 저장한다.

export type SfxName =
  | "tap"
  | "recStart"
  | "recStop"
  | "good"
  | "retry"
  | "memorized"
  | "connect"
  | "chirp"
  | "hint"
  | "hangup"
  | "lessonDone"
  | "levelUp"
  | "streak"
  | "pet";

export interface SfxSettings {
  on: boolean;
  volume: number; // 0.35 작게 · 0.7 보통 · 1 크게
  vibrate: boolean;
}

export const VOLUMES = [
  { value: 0.35, label: "작게" },
  { value: 0.7, label: "보통" },
  { value: 1, label: "크게" },
] as const;

const KEY = "sfxSettings";
const DEFAULTS: SfxSettings = { on: true, volume: 0.7, vibrate: true };

let settings: SfxSettings | null = null;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let recording = false;
let speaking = false;

export function getSfxSettings(): SfxSettings {
  if (settings) return settings;
  try {
    const raw = localStorage.getItem(KEY);
    settings = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    settings = { ...DEFAULTS };
  }
  return settings!;
}

export function setSfxSettings(next: Partial<SfxSettings>) {
  settings = { ...getSfxSettings(), ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {}
  applyGain();
}

/** 녹음 중이면 효과음을 내지 않는다 (마이크에 섞여 채점이 틀어지지 않게) */
export function setRecording(v: boolean) {
  recording = v;
}

/** 음성이 나오는 동안에는 효과음을 작게 */
export function setSpeaking(v: boolean) {
  speaking = v;
  applyGain();
}

function applyGain() {
  if (!master || !ctx) return;
  const s = getSfxSettings();
  const target = s.volume * (speaking ? 0.4 : 1);
  master.gain.setTargetAtTime(target, ctx.currentTime, 0.03);
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    applyGain();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

interface Tone {
  f: number;
  f2?: number;
  at?: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  release?: number;
}

function tone({ f, f2, at = 0, dur = 0.12, type = "sine", gain = 0.3, attack = 0.008, release }: Tone) {
  const c = ctx!;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t0);
  if (f2) osc.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  const rel = release ?? dur;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + rel);
  osc.connect(g);
  g.connect(master!);
  osc.start(t0);
  osc.stop(t0 + attack + rel + 0.05);
}

function bell(f: number, at = 0, gain = 0.22, decay = 0.9) {
  tone({ f, at, gain, release: decay });
  tone({ f: f * 2.01, at, gain: gain * 0.35, release: decay * 0.6 });
  tone({ f: f * 3.02, at, gain: gain * 0.15, release: decay * 0.4 });
}

function sparkle(at = 0, n = 5, base = 2093) {
  const steps = [1, 1.25, 1.5, 2, 2.5];
  for (let i = 0; i < n; i++) tone({ f: base * steps[i % steps.length], at: at + i * 0.045, gain: 0.08, release: 0.18 });
}

const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5, G6 = 1568, C7 = 2093;

const SOUNDS: Record<SfxName, () => void> = {
  tap: () => tone({ f: 1400, type: "triangle", gain: 0.12, attack: 0.002, release: 0.04 }),
  recStart: () => {
    tone({ f: 660, dur: 0.08, gain: 0.22, release: 0.09 });
    tone({ f: 990, at: 0.09, gain: 0.22, release: 0.11 });
  },
  recStop: () => {
    tone({ f: 990, dur: 0.08, gain: 0.2, release: 0.09 });
    tone({ f: 660, at: 0.09, gain: 0.2, release: 0.12 });
  },
  good: () => {
    [C6, E6, G6].forEach((f, i) => tone({ f, at: i * 0.08, type: "triangle", gain: 0.2, release: i === 2 ? 0.35 : 0.12 }));
    sparkle(0.24, 3, C7);
  },
  retry: () => {
    tone({ f: G5, gain: 0.16, release: 0.18 });
    tone({ f: E5, at: 0.15, gain: 0.16, release: 0.28 });
  },
  memorized: () => {
    bell(G6, 0, 0.18, 0.8);
    bell(C7, 0.12, 0.14, 0.9);
    sparkle(0.2, 5, C7);
  },
  connect: () => {
    for (let i = 0; i < 3; i++) {
      tone({ f: 1320, at: i * 0.16, type: "triangle", gain: 0.12, release: 0.06 });
      tone({ f: 1760, at: i * 0.16 + 0.07, type: "triangle", gain: 0.12, release: 0.07 });
    }
    bell(A5, 0.5, 0.12, 0.3);
  },
  chirp: () => {
    tone({ f: 2200, f2: 3400, dur: 0.06, gain: 0.12, release: 0.07 });
    tone({ f: 2600, f2: 3900, at: 0.09, dur: 0.06, gain: 0.1, release: 0.08 });
  },
  hint: () => {
    tone({ f: E6, gain: 0.14, release: 0.12 });
    tone({ f: A5 * 2, at: 0.07, gain: 0.12, release: 0.2 });
  },
  hangup: () => tone({ f: 880, f2: 520, dur: 0.25, type: "triangle", gain: 0.14, release: 0.3 }),
  lessonDone: () => {
    [G5, C6, E6, G6].forEach((f, i) => tone({ f, at: i * 0.09, type: "triangle", gain: 0.18, release: i === 3 ? 0.45 : 0.12 }));
    tone({ f: C5, at: 0.27, gain: 0.12, release: 0.5 });
  },
  levelUp: () => {
    [C5, D5, E5, G5, C6, E6].forEach((f, i) => tone({ f, at: i * 0.06, type: "square", gain: 0.06, release: 0.1 }));
    bell(G6, 0.38, 0.16, 0.5);
    sparkle(0.45, 4, C7);
  },
  streak: () => {
    [C5, E5, G5].forEach((f, i) => tone({ f, at: i * 0.1, type: "triangle", gain: 0.18, release: 0.12 }));
    [C6, E6, G6].forEach((f) => tone({ f, at: 0.32, type: "triangle", gain: 0.12, release: 0.8 }));
    tone({ f: C5, at: 0.32, gain: 0.15, release: 0.9 });
    sparkle(0.5, 8, C7);
    bell(C7, 0.9, 0.1, 0.5);
  },
  pet: () => {
    SOUNDS.chirp();
    tone({ f: 420, f2: 300, at: 0.16, dur: 0.12, gain: 0.12, release: 0.14 });
    tone({ f: 420, f2: 300, at: 0.3, dur: 0.1, gain: 0.08, release: 0.1 });
  },
};

// 진동 (안드로이드). 보상 순간에만
const VIBES: Partial<Record<SfxName, number[]>> = {
  good: [30],
  memorized: [20, 40, 20],
  levelUp: [30, 50, 60],
  streak: [40, 60, 40, 60, 90],
  lessonDone: [30, 40, 30],
};

/** 효과음 내기. 꺼져 있거나 녹음 중이면 조용히 넘어간다. */
export function playSfx(name: SfxName) {
  const s = getSfxSettings();
  if (s.vibrate && VIBES[name] && typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(VIBES[name]!);
    } catch {}
  }
  if (!s.on || recording) return;
  try {
    if (!audio()) return;
    SOUNDS[name]();
  } catch {
    // 소리를 못 내는 환경은 조용히 넘어간다
  }
}

/** 녹음 시작 소리가 끝난 뒤에 녹음을 시작하도록 기다릴 시간 (ms) */
export function recStartDelay() {
  return getSfxSettings().on ? 230 : 0;
}
