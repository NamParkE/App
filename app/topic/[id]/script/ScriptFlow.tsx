"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BackIcon, CheckIcon, CloseIcon, SpeakerIcon, SpinnerIcon } from "@/components/Icons";
import { speak } from "@/lib/speech";
import {
  finalize,
  needsReview,
  scriptProblem,
  splitSentences,
  SCRIPT_MAX_SENTENCES,
  type CheckResponse,
  type CheckedSentence,
} from "@/lib/script";
import type { Topic } from "@/lib/types";

type Step = "paste" | "review" | "summary";

interface Draft {
  text: string;
  result: CheckedSentence[] | null;
  /** 고칠 문장 번호 → 수정안으로 바꿀지 */
  picks: Record<number, boolean>;
  /** 고칠 문장 중 몇 번째를 보고 있는지 (다 보면 reviewItems.length) */
  reviewAt: number;
  step: Step;
}

const EMPTY: Draft = { text: "", result: null, picks: {}, reviewAt: 0, step: "paste" };

/**
 * 화면마다 큰 버튼은 하나 (유저 테스트 반영). 고칠 문장은 목록에서 한꺼번에 고르지 않고 한 장씩 고른다.
 * 확인에 사용량 1회를 쓰므로, 새로고침해도 결과가 남도록 이 탭에만 임시 저장한다 (sessionStorage).
 */
export default function ScriptFlow({ topic, usageLeft, replacing }: { topic: Topic; usageLeft: number; replacing: boolean }) {
  const router = useRouter();
  const key = `script-draft:${topic.id}`;
  const [d, setD] = useState<Draft>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<"check" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(usageLeft);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) setD({ ...EMPTY, ...(JSON.parse(raw) as Draft) });
    } catch {}
    setLoaded(true);
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(d));
    } catch {}
  }, [d, key, loaded]);

  const update = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));
  const counted = useMemo(() => splitSentences(d.text).length, [d.text]);
  const reviewItems = useMemo(
    () => (d.result ?? []).map((s, i) => ({ s, i })).filter(({ s }) => needsReview(s)),
    [d.result],
  );
  const okCount = (d.result?.length ?? 0) - reviewItems.length;

  async function check() {
    const problem = scriptProblem(d.text);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy("check");
    setError(null);
    const res = await fetch("/api/script/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topicId: topic.id, text: d.text }),
    }).catch(() => null);
    const body = res ? ((await res.json().catch(() => ({}))) as Partial<CheckResponse> & { message?: string }) : {};
    setBusy(null);
    if (!res || !res.ok || !body.sentences) {
      setError(body.message ?? "문장을 확인하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
      return;
    }
    if (typeof body.usageLeft === "number") setLeft(body.usageLeft);
    const hasReview = body.sentences.some(needsReview);
    update({ result: body.sentences, picks: {}, reviewAt: 0, step: hasReview ? "review" : "summary" });
  }

  function choose(index: number, useFix: boolean) {
    update({ picks: { ...d.picks, [index]: useFix }, reviewAt: d.reviewAt + 1 });
  }

  async function save() {
    if (!d.result) return;
    setBusy("save");
    setError(null);
    const res = await fetch("/api/script/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topicId: topic.id, sentences: finalize(d.result, d.picks) }),
    }).catch(() => null);
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => ({})) : {};
      setError(body.message ?? "저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
      setBusy(null);
      return;
    }
    try {
      sessionStorage.removeItem(key);
    } catch {}
    router.replace(`/practice/${topic.id}?v=mine`);
    router.refresh();
  }

  function back() {
    setError(null);
    if (d.step === "summary") {
      if (reviewItems.length) update({ step: "review", reviewAt: Math.max(0, reviewItems.length - 1) });
      else update({ step: "paste" });
    } else if (d.step === "review" && d.reviewAt > 0) {
      update({ reviewAt: d.reviewAt - 1 });
    } else {
      // 붙여 넣기로 돌아가면 확인 결과는 버린다 (다시 확인하면 1회 더 차감)
      update({ step: "paste", result: null, picks: {}, reviewAt: 0 });
    }
  }

  if (!loaded) return <main className="screen" aria-busy="true" />;

  // ───── 1. 붙여 넣기 ─────
  if (d.step === "paste") {
    return (
      <main className="screen">
        <div className="pad" style={{ gap: 12 }}>
          <div className="topbar" style={{ gap: 4 }}>
            <Link href={`/topic/${topic.id}`} className="icon-btn" aria-label="닫기">
              <CloseIcon />
            </Link>
            <h1>{replacing ? "스크립트 다시 넣기" : "내 스크립트 넣기"}</h1>
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {topic.title_ko} · <span className="en">{topic.question_en}</span>
          </div>
          <label htmlFor="script" className="section-title" style={{ fontSize: 15 }}>
            영어 답변을 붙여 넣어 주세요
          </label>
          <textarea
            id="script"
            className="script-input"
            value={d.text}
            onChange={(e) => {
              update({ text: e.target.value });
              setError(null);
            }}
            placeholder="I live in an apartment in Seoul with my family. …"
            lang="en"
            spellCheck={false}
            disabled={busy !== null}
          />
          <div className="row muted" style={{ fontSize: 12 }}>
            <span>{counted}문장 · 문장 끝(. ? !)으로 나눠요</span>
            <span>최대 {SCRIPT_MAX_SENTENCES}문장</span>
          </div>
          {replacing && <p className="notice" style={{ margin: 0 }}>저장하면 지금 스크립트를 바꾸고, 이 스크립트의 외움 진도는 처음부터 시작해요.</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
        <div className="bottom" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p className="muted" style={{ margin: 0, fontSize: 12, textAlign: "center" }}>
            확인할 때 연습 1회가 차감돼요 · 오늘 {left}회 남음
          </p>
          <button type="button" className="btn btn-primary" onClick={check} disabled={busy !== null || left <= 0 || !d.text.trim()}>
            {busy === "check" ? (
              <>
                <SpinnerIcon color="#fff" /> 문장을 확인하는 중…
              </>
            ) : left <= 0 ? (
              "오늘 한도를 다 썼어요"
            ) : (
              "문장 확인하기"
            )}
          </button>
        </div>
      </main>
    );
  }

  const header = (title: string, right?: ReactNode) => (
    <div className="topbar" style={{ gap: 4 }}>
      <button type="button" className="icon-btn" aria-label="뒤로" onClick={back} disabled={busy !== null}>
        <BackIcon />
      </button>
      <h1>{title}</h1>
      {right}
    </div>
  );

  // ───── 2. 고칠 문장 한 장씩 ─────
  if (d.step === "review") {
    const doneAll = d.reviewAt >= reviewItems.length;
    const item = reviewItems[Math.min(d.reviewAt, reviewItems.length - 1)];
    const wrong = item?.s.verdict === "wrong";
    const fixed = reviewItems.filter(({ i }) => d.picks[i]).length;
    return (
      <main className="screen">
        <div className="pad" style={{ gap: 14 }}>
          {header(
            "문장 확인",
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>
              {doneAll ? "완료" : `${d.reviewAt + 1} / ${reviewItems.length}`}
            </span>,
          )}
          <div className="review-dots" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${reviewItems.length}, minmax(0, 1fr))` }}>
            {reviewItems.map((_, k) => (
              <span key={k} data-state={k < d.reviewAt ? "done" : k === d.reviewAt ? "now" : undefined} />
            ))}
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            {d.result?.length}문장 중{" "}
            {okCount > 0 && (
              <>
                <b style={{ color: "var(--ink)" }}>{okCount}문장은 그대로 좋아요.</b>{" "}
              </>
            )}
            {reviewItems.length}문장만 하나씩 볼게요.
          </p>

          {doneAll ? (
            <section className="card" style={{ alignItems: "center", textAlign: "center", padding: "24px 18px" }}>
              <span className="done-check">
                <CheckIcon size={28} color="var(--ok-ink)" />
              </span>
              <div style={{ fontSize: 17, fontWeight: 700 }}>다 골랐어요</div>
              <div className="muted" style={{ fontSize: 14 }}>
                {fixed}문장은 수정안으로, {reviewItems.length - fixed}문장은 내 문장 그대로 둘게요.
              </div>
            </section>
          ) : (
            item && (
              <section className="card" style={{ gap: 14 }} aria-live="polite">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="muted" style={{ fontSize: 12 }}>{item.i + 1}번째 문장</span>
                  <span className={`verdict ${item.s.verdict}`}>{wrong ? "틀림" : "조금 어색"}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="label">내 문장</span>
                  <span className="en" lang="en" style={{ fontSize: 16, lineHeight: 1.55 }}>{item.s.original}</span>
                </div>
                <div className="divider" />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="label" style={{ color: "var(--ok-ink)" }}>수정안</span>
                  <span className="en" lang="en" style={{ fontSize: 16, lineHeight: 1.55, fontWeight: 600 }}>{item.s.fix}</span>
                  {item.s.why && <span className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{item.s.why}</span>}
                </div>
                <button type="button" className="chip" style={{ alignSelf: "flex-start", height: 40, gap: 6 }} onClick={() => item.s.fix && speak(item.s.fix)}>
                  <SpeakerIcon size={16} />
                  수정안 듣기
                </button>
              </section>
            )
          )}
        </div>
        <div className="bottom" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {doneAll ? (
            <button type="button" className="btn btn-primary" onClick={() => update({ step: "summary" })}>
              다음
            </button>
          ) : (
            item && (
              <>
                {/* 틀림은 수정안을, 조금 어색은 내 익숙한 문장을 큰 버튼으로 권한다 */}
                <button type="button" className="btn btn-primary" onClick={() => choose(item.i, wrong)}>
                  {wrong ? "수정안으로 바꾸기" : "내 문장 그대로"}
                </button>
                <button type="button" className="btn btn-outline" style={{ height: 48, fontWeight: 400, fontSize: 15 }} onClick={() => choose(item.i, !wrong)}>
                  {wrong ? "내 문장 그대로" : "수정안으로 바꾸기"}
                </button>
              </>
            )
          )}
        </div>
      </main>
    );
  }

  // ───── 3. 저장 전 확인 ─────
  const final = finalize(d.result ?? [], d.picks);
  const editedCount = final.filter((s) => s.edited).length;
  return (
    <main className="screen">
      <div className="pad" style={{ gap: 12 }}>
        {header("이렇게 저장할게요")}
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          {topic.title_ko} · {final.length}문장
          {reviewItems.length === 0 ? " · 모든 문장이 자연스러워요" : ` (수정안 ${editedCount} · 내 문장 ${final.length - editedCount})`}
        </p>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {final.map((s, i) => (
            <li key={i} className="sentence" style={{ padding: "12px 14px", gap: 10 }}>
              <span className="num todo" style={{ flexShrink: 0 }}>{i + 1}</span>
              <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <span className="en-line" lang="en">{s.en}</span>
                {s.edited && <span className="edited-tag">수정안</span>}
                {!s.edited && d.result && needsReview(d.result[i]) && <span className="edited-tag mine">내 문장</span>}
              </span>
            </li>
          ))}
        </ol>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <div className="bottom">
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy !== null || final.length === 0}>
          {busy === "save" ? (
            <>
              <SpinnerIcon color="#fff" /> 저장하는 중…
            </>
          ) : (
            "저장하고 연습 시작"
          )}
        </button>
      </div>
    </main>
  );
}
