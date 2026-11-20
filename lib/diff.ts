// 사용자가 말한 문장과 모범 문장을 단어 단위로 비교한다.
// AI 호출 없이 동작하므로 비용이 들지 않는다.

export type TokenStatus =
  | "ok" // 일치
  | "missing" // 모범 문장에 있는데 빠뜨림
  | "replaced" // 다른 단어로 말함 (틀림)
  | "swap_ok" // 다른 단어로 말했지만 괜찮음
  | "extra" // 모범 문장에 없는 단어를 더 말함
  | "gap"; // 말한 문장에서 빠진 자리 표시

export interface Token {
  text: string;
  status: TokenStatus;
}

export interface Replacement {
  said: string;
  model: string;
}

export interface DiffResult {
  model: Token[];
  said: Token[];
  replacements: Replacement[]; // 바꿔 말한 단어 쌍 (정규화된 형태)
  missing: string[];
  extra: string[];
  score: number; // 0~100
}

const CONTRACTIONS: Record<string, string> = {
  "i'm": "i am",
  "you're": "you are",
  "we're": "we are",
  "they're": "they are",
  "he's": "he is",
  "she's": "she is",
  "it's": "it is",
  "that's": "that is",
  "there's": "there is",
  "what's": "what is",
  "i've": "i have",
  "we've": "we have",
  "they've": "they have",
  "i'll": "i will",
  "we'll": "we will",
  "it'll": "it will",
  "i'd": "i would",
  "don't": "do not",
  "doesn't": "does not",
  "didn't": "did not",
  "isn't": "is not",
  "aren't": "are not",
  "wasn't": "was not",
  "weren't": "were not",
  "can't": "can not",
  "cannot": "can not",
  "couldn't": "could not",
  "won't": "will not",
  "wouldn't": "would not",
  "haven't": "have not",
  "let's": "let us",
};

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const ORDINAL_ONES: Record<string, string> = {
  one: "first", two: "second", three: "third", five: "fifth", eight: "eighth",
  nine: "ninth", twelve: "twelfth",
};

function cardinal(n: number): string[] {
  if (n < 20) return [ONES[n]];
  const t = TENS[Math.floor(n / 10)];
  const o = n % 10;
  return o === 0 ? [t] : [t, ONES[o]];
}

function ordinalWord(word: string): string {
  if (ORDINAL_ONES[word]) return ORDINAL_ONES[word];
  if (word.endsWith("y")) return word.slice(0, -1) + "ieth";
  return word + "th";
}

// 음성 인식은 "12th", "twelfth" 둘 다 낼 수 있어 숫자를 영어 단어로 맞춘다.
function numberToWords(raw: string): string[] | null {
  const m = raw.match(/^(\d{1,2})(st|nd|rd|th)?$/);
  if (!m) return null;
  const words = cardinal(parseInt(m[1], 10));
  if (m[2]) words[words.length - 1] = ordinalWord(words[words.length - 1]);
  return words;
}

export function normalizeWord(word: string): string[] {
  const w = word
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
  if (!w) return [];
  if (CONTRACTIONS[w]) return CONTRACTIONS[w].split(" ");
  const num = numberToWords(w);
  if (num) return num;
  return [w.replace(/'/g, "")].filter(Boolean);
}

interface Part {
  norm: string;
  word: number; // 원래 단어 위치
}

function split(sentence: string): { words: string[]; parts: Part[] } {
  const words = sentence.trim().split(/\s+/).filter(Boolean);
  const parts: Part[] = [];
  words.forEach((w, i) => {
    for (const norm of normalizeWord(w)) parts.push({ norm, word: i });
  });
  return { words, parts };
}

type Op =
  | { kind: "equal"; m: number; s: number }
  | { kind: "missing"; m: number }
  | { kind: "extra"; s: number }
  | { kind: "replace"; m: number; s: number };

function align(a: string[], b: string[]): Op[] {
  // 최장 공통 부분열(LCS)로 정렬
  const n = a.length;
  const k = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(k + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = k - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const raw: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < k) {
    if (i < n && j < k && a[i] === b[j]) {
      raw.push({ kind: "equal", m: i++, s: j++ });
    } else if (j < k && (i === n || dp[i][j + 1] >= dp[i + 1][j])) {
      raw.push({ kind: "extra", s: j++ });
    } else {
      raw.push({ kind: "missing", m: i++ });
    }
  }
  // 붙어 있는 빠뜨림 + 추가는 "바꿔 말함"으로 묶는다
  const ops: Op[] = [];
  let idx = 0;
  while (idx < raw.length) {
    if (raw[idx].kind === "equal") {
      ops.push(raw[idx++]);
      continue;
    }
    const miss: number[] = [];
    const extra: number[] = [];
    while (idx < raw.length && raw[idx].kind !== "equal") {
      const op = raw[idx++];
      if (op.kind === "missing") miss.push(op.m);
      else if (op.kind === "extra") extra.push(op.s);
    }
    const pairs = Math.min(miss.length, extra.length);
    for (let p = 0; p < pairs; p++) ops.push({ kind: "replace", m: miss[p], s: extra[p] });
    for (const m of miss.slice(pairs)) ops.push({ kind: "missing", m });
    for (const s of extra.slice(pairs)) ops.push({ kind: "extra", s });
  }
  return ops;
}

const RANK: Record<TokenStatus, number> = {
  ok: 0, swap_ok: 1, extra: 2, replaced: 3, missing: 4, gap: 5,
};

function worse(a: TokenStatus, b: TokenStatus): TokenStatus {
  return RANK[b] > RANK[a] ? b : a;
}

export function pairKey(r: Replacement): string {
  return `${r.said}>${r.model}`;
}

/**
 * @param acceptable 괜찮은 바꿔 말하기 (pairKey 형태). AI가 판단해 넘겨준다.
 */
export function compareSentences(
  modelSentence: string,
  saidSentence: string,
  acceptable: Set<string> = new Set(),
): DiffResult {
  const M = split(modelSentence);
  const S = split(saidSentence);
  const ops = align(
    M.parts.map((p) => p.norm),
    S.parts.map((p) => p.norm),
  );

  const modelStatus: TokenStatus[] = M.words.map(() => "ok");
  const saidStatus: TokenStatus[] = S.words.map(() => "ok");
  const gapsBefore = new Map<number, number>(); // said 단어 위치 앞에 들어갈 빈칸 수
  const replacements: Replacement[] = [];
  const missing: string[] = [];
  const extra: string[] = [];
  let matched = 0;
  let lastSaidWord = -1;

  for (const op of ops) {
    if (op.kind === "equal") {
      matched++;
      lastSaidWord = S.parts[op.s].word;
    } else if (op.kind === "replace") {
      const r = { said: S.parts[op.s].norm, model: M.parts[op.m].norm };
      const ok = acceptable.has(pairKey(r));
      replacements.push(r);
      if (ok) matched++;
      const st: TokenStatus = ok ? "swap_ok" : "replaced";
      modelStatus[M.parts[op.m].word] = worse(modelStatus[M.parts[op.m].word], st);
      saidStatus[S.parts[op.s].word] = worse(saidStatus[S.parts[op.s].word], st);
      lastSaidWord = S.parts[op.s].word;
    } else if (op.kind === "missing") {
      missing.push(M.parts[op.m].norm);
      modelStatus[M.parts[op.m].word] = worse(modelStatus[M.parts[op.m].word], "missing");
      const at = lastSaidWord + 1;
      gapsBefore.set(at, (gapsBefore.get(at) ?? 0) + 1);
    } else {
      extra.push(S.parts[op.s].norm);
      saidStatus[S.parts[op.s].word] = worse(saidStatus[S.parts[op.s].word], "extra");
      lastSaidWord = S.parts[op.s].word;
    }
  }

  const said: Token[] = [];
  for (let i = 0; i <= S.words.length; i++) {
    if (gapsBefore.has(i)) said.push({ text: "", status: "gap" });
    if (i < S.words.length) said.push({ text: S.words[i], status: saidStatus[i] });
  }

  const total = M.parts.length + S.parts.length;
  const score = total === 0 ? 0 : Math.round((200 * matched) / total);

  return {
    model: M.words.map((text, i) => ({ text, status: modelStatus[i] })),
    said,
    replacements,
    missing,
    extra,
    score: Math.min(100, score),
  };
}
