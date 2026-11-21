// 내 스크립트 (오픽 직접 답변 입력). 화면과 서버가 함께 쓰는 순수 함수와 모양.
// 설계: docs/design/my-script-mode.md

export const SCRIPT_MAX_CHARS = 2000;
export const SCRIPT_MAX_SENTENCES = 15;
/** 한 문장 최대 길이 (연습 화면 · 단어 비교에 무리가 없도록) */
export const SENTENCE_MAX_CHARS = 300;

export type Verdict = "ok" | "awkward" | "wrong";

/** /api/script/check 가 돌려주는 문장 하나 */
export interface CheckedSentence {
  original: string;
  verdict: Verdict;
  /** 수정안 (ok 면 null) */
  fix: string | null;
  /** 이유 한 줄 (한국어, ok 면 null) */
  why: string | null;
  original_pronunciation: string;
  original_ko: string;
  fix_pronunciation: string | null;
  fix_ko: string | null;
}

export interface CheckResponse {
  sentences: CheckedSentence[];
  usageLeft: number;
}

/** /api/script/save 로 보내는 최종 문장 */
export interface FinalSentence {
  en: string;
  pronunciation: string;
  ko: string;
  /** 수정안으로 바꾼 문장 */
  edited: boolean;
}

// 문장 끝처럼 보이지만 끝이 아닌 줄임말 (소문자로 비교)
const ABBREVIATIONS = new Set(["mr.", "mrs.", "ms.", "dr.", "prof.", "st.", "vs.", "etc.", "e.g.", "i.e.", "a.m.", "p.m.", "no."]);

/**
 * 붙여 넣은 글을 문장으로 나눈다. 문장 끝(. ? !) 다음에 공백이나 줄바꿈이 오면 나누고, 줄바꿈도 나눈다.
 * 공백은 하나로 줄이고, 빈 문장은 버린다.
 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split(/\n+/)) {
    const words = line.trim().split(/\s+/).filter(Boolean);
    let cur: string[] = [];
    for (const w of words) {
      cur.push(w);
      // 닫는 따옴표 · 괄호를 떼고 끝 글자를 본다
      const bare = w.replace(/["'”’)\]]+$/, "");
      if (/[.?!]$/.test(bare) && !ABBREVIATIONS.has(bare.toLowerCase()) && !/^[A-Z]\.$/.test(bare)) {
        out.push(cur.join(" "));
        cur = [];
      }
    }
    if (cur.length) out.push(cur.join(" "));
  }
  return out.filter((s) => /[A-Za-z]/.test(s));
}

/** 붙여 넣은 글이 확인할 수 있는 상태인지. 문제가 없으면 null, 있으면 사용자에게 보여 줄 말 */
export function scriptProblem(text: string): string | null {
  const t = text.trim();
  if (!t) return "영어 답변을 붙여 넣어 주세요.";
  if (t.length > SCRIPT_MAX_CHARS) return `${SCRIPT_MAX_CHARS.toLocaleString("ko-KR")}자까지 넣을 수 있어요. 지금 ${t.length.toLocaleString("ko-KR")}자예요.`;
  const sentences = splitSentences(t);
  if (sentences.length === 0) return "영어 문장을 찾지 못했어요.";
  if (sentences.length > SCRIPT_MAX_SENTENCES) return `${SCRIPT_MAX_SENTENCES}문장까지 넣을 수 있어요. 지금 ${sentences.length}문장이에요.`;
  if (sentences.some((s) => s.length > SENTENCE_MAX_CHARS)) return `한 문장이 너무 길어요. 문장 끝에 마침표를 넣어 나눠 주세요.`;
  return null;
}

/** 고칠 문장(틀림 · 조금 어색)만 */
export function needsReview(s: CheckedSentence) {
  return s.verdict !== "ok" && !!s.fix && s.fix.trim() !== s.original.trim();
}

/** 고른 결과로 최종 문장을 만든다. useFix[i] 가 true 면 i번째 문장을 수정안으로 바꾼다 */
export function finalize(sentences: CheckedSentence[], useFix: Record<number, boolean>): FinalSentence[] {
  return sentences.map((s, i) =>
    useFix[i] && needsReview(s) && s.fix
      ? { en: s.fix, pronunciation: s.fix_pronunciation ?? "", ko: s.fix_ko ?? "", edited: true }
      : { en: s.original, pronunciation: s.original_pronunciation, ko: s.original_ko, edited: false },
  );
}
