"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CloseIcon, SpinnerIcon } from "@/components/Icons";
import { AREAS, areaWord, clock, GRADES, VERDICT_LABEL, type MockAnswer, type MockReport } from "@/lib/mock";
import type { MockQuestion } from "@/lib/mockBank";

/** 리포트를 기다리는 시간(밀리초)이 이보다 길면 다시 만들기 버튼을 보여 준다 (서버도 같은 기준) */
const STUCK_MS = 3 * 60 * 1000;

function dateLabel(iso: string) {
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

// "**went** to" → 굵은 영어 단어
function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((p, i) => (i % 2 ? <b key={i} className="en">{p}</b> : p))}</>;
}

const VERDICT_COLOR = { good: "var(--ok-ink)", ok: "var(--warn-ink)", weak: "var(--warn-ink)" } as const;

export default function ReportView({
  id,
  status,
  report,
  questions,
  answers,
  finishedAt,
  spokeSec,
}: {
  id: string;
  status: "none" | "pending" | "ready" | "failed";
  report: MockReport | null;
  questions: MockQuestion[];
  answers: MockAnswer[];
  finishedAt: string;
  spokeSec: number;
}) {
  const router = useRouter();
  const [view, setView] = useState<"summary" | "items">("summary");
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  // 만드는 중이면 몇 초마다 다시 읽는다
  useEffect(() => {
    setNow(Date.now());
    if (status !== "pending") return;
    const t = setInterval(() => {
      setNow(Date.now());
      router.refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [status, router]);

  async function retry() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/mock/${id}/report`, { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      const msg = (await res?.json().catch(() => null))?.message as string | undefined;
      setError(msg ?? "인터넷 연결을 확인하고 다시 시도해 주세요.");
    }
    setBusy(false);
    router.refresh();
  }

  const close = (
    <Link href="/mock" className="icon-btn" aria-label="모의고사로">
      <CloseIcon />
    </Link>
  );

  // ───── 만드는 중 · 실패 ─────
  if (status !== "ready" || !report) {
    const stuck = status === "failed" || (status === "pending" && now > 0 && now - Date.parse(finishedAt) > STUCK_MS);
    return (
      <main className="screen">
        <div className="pad">
          <div className="topbar">{close}<h1 style={{ fontSize: 16 }}>모의고사 리포트</h1></div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14, paddingTop: 40 }}>
            {!stuck && <SpinnerIcon color="var(--accent)" />}
            <h2 className="title" style={{ fontSize: 22 }}>{stuck ? "리포트를 만들지 못했어요" : "리포트를 만들고 있어요"}</h2>
            <p className="subtitle" style={{ fontSize: 14 }}>
              {stuck ? "다시 만들어도 횟수는 더 차감하지 않아요." : "15문항 답변을 살펴보고 있어요. 30초쯤 걸려요."}
            </p>
            <section className="card" style={{ width: "100%", gap: 6, textAlign: "left" }}>
              <div className="row"><span style={{ fontSize: 13 }}>말한 시간 합계</span><span className="en" style={{ fontWeight: 700 }}>{clock(spokeSec)}</span></div>
              <div className="row"><span style={{ fontSize: 13 }}>답한 문항</span><span className="en" style={{ fontWeight: 700 }}>{answers.filter((a) => a.said.trim()).length} / 15</span></div>
            </section>
            {error && <p className="error" role="alert">{error}</p>}
          </div>
        </div>
        <div className="bottom" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          {stuck ? (
            <button type="button" className="btn btn-primary" onClick={retry} disabled={busy}>
              {busy ? <SpinnerIcon color="#fff" /> : "리포트 다시 만들기"}
            </button>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>화면을 닫아도 리포트는 모의고사 화면의 &quot;지난 모의고사&quot;에 남아요</span>
          )}
        </div>
      </main>
    );
  }

  const g = GRADES.indexOf(report.grade);
  const lo = GRADES.indexOf(report.low);
  const hi = GRADES.indexOf(report.high);
  const byN = new Map(answers.map((a) => [a.n, a]));
  const itemByN = new Map(report.items.map((i) => [i.n, i]));

  // ───── 문항별 피드백 ─────
  if (view === "items") {
    return (
      <main className="screen">
        <div className="pad" style={{ gap: 8, paddingBottom: 24 }}>
          <div className="topbar">
            <button type="button" className="icon-btn" aria-label="리포트 요약으로" onClick={() => setView("summary")}>
              <CloseIcon />
            </button>
            <h1 style={{ fontSize: 16 }}>문항별 피드백</h1>
          </div>
          {questions.map((q) => {
            const it = itemByN.get(q.n);
            const a = byN.get(q.n);
            const isOpen = open === q.n;
            return (
              <section key={q.n} className="card" style={{ gap: 8, padding: "12px 14px", ...(isOpen ? { border: "2px solid var(--accent)", padding: "11px 13px" } : {}) }}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : q.n)}
                  aria-expanded={isOpen}
                  style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, minHeight: 32 }}
                >
                  <span className="num">{q.n}</span>
                  <span style={{ flexGrow: 1, fontSize: 14, fontWeight: isOpen ? 700 : 400 }}>{q.label}</span>
                  {it && <span style={{ fontSize: 13, fontWeight: 700, color: VERDICT_COLOR[it.verdict] }}>{VERDICT_LABEL[it.verdict]}</span>}
                </button>
                {isOpen && (
                  <>
                    <span className="en muted" lang="en" style={{ fontSize: 13, lineHeight: 1.5 }}>{q.en}</span>
                    <span className="label">
                      내가 말한 것 (받아 적음 · <span className="en">{clock(a?.sec ?? 0)}</span>)
                    </span>
                    <span className="en" lang="en" style={{ fontSize: 13, lineHeight: 1.55 }}>{a?.said.trim() || "(답하지 않았어요)"}</span>
                    {it && (
                      <>
                        {it.good && (
                          <span style={{ fontSize: 13, lineHeight: 1.55 }}>
                            <b style={{ color: "var(--ok-ink)" }}>잘한 점</b> <Rich text={it.good} />
                          </span>
                        )}
                        {it.fix && (
                          <span style={{ fontSize: 13, lineHeight: 1.55 }}>
                            <b style={{ color: "var(--warn-ink)" }}>고칠 점</b> <Rich text={it.fix} />
                          </span>
                        )}
                        {it.better && (
                          <span className="en notice" lang="en" style={{ fontSize: 13, lineHeight: 1.5 }}>{it.better}</span>
                        )}
                      </>
                    )}
                    {q.topicId && (
                      <Link href={`/topic/${q.topicId}`} className="btn btn-outline" style={{ height: 40, fontSize: 14 }}>
                        이 주제 외우기 연습으로
                      </Link>
                    )}
                  </>
                )}
              </section>
            );
          })}
        </div>
      </main>
    );
  }

  // ───── 리포트 요약 ─────
  return (
    <main className="screen">
      <div className="pad" style={{ gap: 10 }}>
        <div className="topbar">
          {close}
          <h1 style={{ fontSize: 16 }}>모의고사 리포트</h1>
          <span className="muted" style={{ fontSize: 12 }}>{finishedAt ? dateLabel(finishedAt) : ""}</span>
        </div>
        <section className="hero-card" style={{ gap: 12 }} aria-label={`예상 등급 ${report.grade}, ${report.low}에서 ${report.high} 사이`}>
          <div className="row" style={{ alignItems: "center" }}>
            <span className="sub">예상 등급</span>
            <span style={{ fontSize: 12, fontWeight: 700, background: "var(--warn-soft)", color: "var(--warn-ink)", borderRadius: 999, padding: "3px 9px" }}>
              예상 · 보장 아님
            </span>
          </div>
          <span className="en" style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1, lineHeight: 1 }}>{report.grade}</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(9, minmax(0, 1fr))", gap: 3 }} aria-hidden="true">
            {GRADES.map((x, i) => (
              <span
                key={x}
                className="en"
                style={{
                  height: 26,
                  borderRadius: 6,
                  fontSize: 10,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: i === g ? "var(--dark-fill)" : i >= lo && i <= hi ? "#4a5260" : "var(--dark-track)",
                  color: i === g ? "var(--dark)" : i >= lo && i <= hi ? "#fff" : "var(--dark-muted)",
                }}
              >
                {x}
              </span>
            ))}
          </div>
          <span className="sub" style={{ fontSize: 12 }}>
            {report.low === report.high ? `${report.grade}로 보여요` : `${report.low} ~ ${report.high} 사이로 보여요`} · {report.headline}
          </span>
        </section>
        <section className="card" style={{ gap: 10 }}>
          {AREAS.map((a) => {
            const score = report.areas.find((x) => x.key === a.key)?.score ?? 0;
            const word = areaWord(score);
            return (
              <div key={a.key} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div className="row">
                  <span style={{ fontSize: 13 }}>{a.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: word === "좋음" ? "var(--ok-ink)" : "var(--warn-ink)" }}>{word}</span>
                </div>
                <div className="track" role="img" aria-label={`${a.label} ${word}`}>
                  <div style={{ width: `${score}%` }} />
                </div>
              </div>
            );
          })}
        </section>
        {report.tips.length > 0 && (
          <section className="card" style={{ gap: 6 }}>
            <span className="label">다음에 연습할 것</span>
            {report.tips.map((t, i) => (
              <span key={i} style={{ fontSize: 13, lineHeight: 1.55 }}>
                {i + 1}. <Rich text={t} />
              </span>
            ))}
          </section>
        )}
        <section className="card" style={{ gap: 4, padding: "12px 14px", background: "var(--line-soft)", borderColor: "var(--line-soft)" }}>
          <span className="muted" style={{ fontSize: 12, lineHeight: 1.55 }}>
            음성 인식으로 받아 적은 글자만 보고 매긴 예상이에요. 발음 · 억양 · 말 빠르기는 평가하지 않았고, 실제 등급과 다를 수 있어요.
          </span>
        </section>
      </div>
      <div className="bottom">
        <button type="button" className="btn btn-primary" onClick={() => setView("items")}>문항별 피드백 보기</button>
      </div>
    </main>
  );
}
