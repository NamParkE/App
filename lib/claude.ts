import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Level } from "./types";
import type { DiffResult } from "./diff";

export const MODEL = process.env.CLAUDE_MODEL?.trim() || "claude-haiku-5-5";

let cached: Anthropic | null = null;

// 키가 없을 때 모듈을 불러오는 순간 죽지 않도록, 처음 쓸 때 만든다.
export function client() {
  if (!cached) {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) throw new MissingKeyError("ANTHROPIC_API_KEY is not set");
    cached = new Anthropic({ apiKey });
  }
  return cached;
}

export class MissingKeyError extends Error {}

/** Claude 호출 실패를 가족(관리자 포함)이 이해할 수 있는 말로 바꾼다. */
export function describeClaudeError(e: unknown): { status: number; message: string } {
  if (e instanceof MissingKeyError) {
    return { status: 500, message: "AI 키가 설정되지 않았어요. 관리자: Vercel 환경 변수 ANTHROPIC_API_KEY를 넣고 다시 배포해 주세요." };
  }
  if (e instanceof ClaudeRefusalError) {
    return { status: 422, message: "이 내용은 AI가 처리할 수 없었어요. 다른 주제로 해 보세요." };
  }
  if (e instanceof Anthropic.AuthenticationError) {
    return { status: 500, message: "AI 키가 올바르지 않아요. 관리자: Vercel의 ANTHROPIC_API_KEY 값을 확인하고 다시 배포해 주세요." };
  }
  if (e instanceof Anthropic.PermissionDeniedError) {
    return { status: 500, message: "AI 키에 이 기능을 쓸 권한이 없어요. 관리자: Anthropic 콘솔에서 키를 확인해 주세요." };
  }
  if (e instanceof Anthropic.NotFoundError) {
    return { status: 500, message: `AI 모델 이름(${MODEL})을 찾을 수 없어요. 관리자: Vercel의 CLAUDE_MODEL 값을 확인해 주세요.` };
  }
  if (e instanceof Anthropic.RateLimitError) {
    return { status: 503, message: "지금 AI 요청이 많아요. 잠시 후 다시 시도해 주세요." };
  }
  if (e instanceof Anthropic.BadRequestError) {
    if (/credit balance|billing|purchase credits/i.test(e.message)) {
      return { status: 500, message: "AI 크레딧이 부족해요. 관리자: Anthropic 콘솔의 Billing에서 충전해 주세요." };
    }
    return { status: 500, message: "AI 요청이 거절됐어요. 관리자: Vercel 로그의 오류 내용을 확인해 주세요." };
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return { status: 503, message: "AI 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  if (e instanceof Anthropic.InternalServerError) {
    return { status: 503, message: "AI 서버에 일시적인 문제가 있어요. 잠시 후 다시 시도해 주세요." };
  }
  return { status: 502, message: "AI 답변을 받지 못했어요. 잠시 후 다시 시도해 주세요." };
}

// 서버 측 거절 대체(fallback)를 지원하는 모델만 켠다. Haiku 는 지원하지 않는다.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-2", "claude-fable-5-1"]);

export function fallbackParams() {
  return FALLBACK_MODELS.has(MODEL)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : {};
}

export class ClaudeRefusalError extends Error {}

const LEVEL_GUIDE: Record<Level, { count: number; guide: string }> = {
  IM2: {
    count: 5,
    guide:
      "OPIc IM2: short, accurate sentences (8-14 words) using basic, high-frequency vocabulary and simple present/past tense. Easy to memorize.",
  },
  IH: {
    count: 7,
    guide:
      "OPIc IH: natural, connected sentences (10-18 words) with linking words (so, because, actually, also) and some description. Comfortable to say aloud.",
  },
  AL: {
    count: 9,
    guide:
      "OPIc AL: rich, fluent sentences (12-22 words) with varied structures, opinions, a short personal story, and natural fillers (honestly, to be specific). Still speakable in one breath.",
  },
};

const SentenceSet = z.object({
  sentences: z.array(
    z.object({
      en: z.string().describe("English sentence"),
      pronunciation: z
        .string()
        .describe("How the English sentence sounds, written in Korean Hangul (e.g. 아이 리브 인 언 어파트먼트)"),
      ko: z.string().describe("Natural Korean translation"),
    }),
  ),
});

export type GeneratedSentence = z.infer<typeof SentenceSet>["sentences"][number];

export async function generateSentences(
  topic: { title_en: string; question_en: string },
  level: Level,
): Promise<GeneratedSentence[]> {
  const { count, guide } = LEVEL_GUIDE[level];
  const response = await client().beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: "low", format: betaZodOutputFormat(SentenceSet) },
    ...fallbackParams(),
    system:
      "You write model answers for Korean learners preparing for the OPIc English speaking test. " +
      "The learner will memorize your answer sentence by sentence and say it aloud, so every sentence must sound like natural spoken English from a first-person point of view, with no lists, headings, or symbols. " +
      "The sentences, in order, must form one coherent answer: an opening line, details, and a closing line.",
    messages: [
      {
        role: "user",
        content:
          `Topic: ${topic.title_en}\nQuestion: ${topic.question_en}\n\n` +
          `Target level: ${guide}\n` +
          `Write exactly ${count} sentences. For each, give the English sentence, its pronunciation in Korean Hangul, and a natural Korean translation.`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new ClaudeRefusalError("refusal");
  const parsed = response.parsed_output;
  if (!parsed || parsed.sentences.length === 0) throw new Error("empty_output");
  return parsed.sentences.slice(0, count);
}

const Coaching = z.object({
  headline: z.string().describe("One short encouraging line in Korean, under 20 characters"),
  acceptable: z
    .array(z.object({ said: z.string(), model: z.string() }))
    .describe("Replacement pairs (copied exactly from the input) that are fine to keep because the meaning and grammar stay correct"),
  tips: z
    .array(z.string())
    .describe("At most 2 short tips in Korean. Wrap English words in **double asterisks**."),
});

export type Coaching = z.infer<typeof Coaching>;

export async function coachAttempt(
  modelSentence: string,
  said: string,
  diff: DiffResult,
): Promise<Coaching> {
  const response = await client().beta.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: "low", format: betaZodOutputFormat(Coaching) },
    ...fallbackParams(),
    system:
      "You are a friendly English speaking coach for a Korean learner memorizing OPIc model answers. " +
      "The learner's speech was transcribed by speech recognition, so ignore punctuation, capitalization, and likely mis-hearings of similar-sounding words. " +
      "Focus on what helps them say the model sentence correctly next time. Write in Korean, kindly and briefly.",
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          model_sentence: modelSentence,
          learner_said: said,
          missing_words: diff.missing,
          extra_words: diff.extra,
          replacements: diff.replacements,
        }),
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new ClaudeRefusalError("refusal");
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("empty_output");
  return { ...parsed, tips: parsed.tips.slice(0, 2) };
}
