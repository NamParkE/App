"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BackIcon, SpinnerIcon } from "@/components/Icons";
import { MOCK_COUNT, SELF_LEVELS, SELF_RECOMMEND } from "@/lib/mock";
import { ACTIVITY_GROUPS, JOBS, LIVING, MIN_ACTIVITIES, STUDENT, validSurvey, type Survey } from "@/lib/mockBank";
import type { Level } from "@/lib/types";
import type { PastExam } from "./page";

type Step = "intro" | "job" | "student" | "living" | "activities" | "level";
const SURVEY_STEPS: Step[] = ["job", "student", "living", "activities"];

function dateLabel(iso: string) {
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** 시작 안내 → 배경 설문 4단계 → 난이도 자가 평가 → 시험 시작 */
export default function MockSetup({
  level,
  limit,
  left,
  refill,
  lastSurvey,
  past,
}: {
  level: Level;
  limit: number;
  left: number;
  refill: string;
  lastSurvey: Survey | null;
  past: PastExam[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [survey, setSurvey] = useState<Survey>(lastSurvey ?? { job: "", student: "", living: "", activities: [] });
  const [self, setSelf] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rec0, rec1] = SELF_RECOMMEND[level];

  const back = () => {
    setError(null);
    if (step === "job") setStep("intro");
    else if (step === "level") setStep("activities");
    else if (SURVEY_STEPS.includes(step)) setStep(SURVEY_STEPS[SURVEY_STEPS.indexOf(step) - 1]);
  };

  async function start() {
    if (self === null || !validSurvey(survey)) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/mock/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ survey, selfLevel: self }),
    }).catch(() => null);
    if (!res?.ok) {
      const msg = (await res?.json().catch(() => null))?.message as string | undefined;
      setError(msg ?? "인터넷 연결을 확인하고 다시 시도해 주세요.");
      setBusy(false);
      return;
    }
    const { id } = (await res.json()) as { id: string };
    router.push(`/mock/${id}`);
  }

  const topbar = (title: string, right?: string) => (
    <div className="topbar" style={{ gap: 4 }}>
      {step === "intro" ? (
        <Link href="/home" className="icon-btn" aria-label="홈으로">
          <BackIcon />
        </Link>
      ) : (
        <button type="button" className="icon-btn" aria-label="뒤로" onClick={back}>
          <BackIcon />
        </button>
      )}
      <h1 style={{ fontSize: 16 }}>{title}</h1>
      {right && <span className="en muted" style={{ fontSize: 14 }}>{right}</span>}
    </div>
  );

  const radio = (options: readonly { id: string; label: string }[], key: "job" | "student" | "living") => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className="choice"
          aria-pressed={survey[key] === o.id}
          onClick={() => setSurvey((s) => ({ ...s, [key]: o.id }))}
          style={{ padding: "12px 14px", fontSize: 15 }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  // ───── 시작 안내 ─────
  if (step === "intro") {
    return (
      <main className="screen">
        <div className="pad" style={{ gap: 14 }}>
          {topbar("실전 모의고사")}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h2 className="title" style={{ fontSize: 22 }}>실제 오픽처럼 한 번 미리 봐요</h2>
            <p className="subtitle" style={{ fontSize: 14 }}>끝나면 예상 등급과 문항별 피드백을 드려요.</p>
          </div>
          <section className="hero-card" style={{ gap: 6 }} aria-label="이달 남은 횟수">
            <div className="row" style={{ alignItems: "center" }}>
              <span className="sub">이달 남은 횟수</span>
              <span className="en" style={{ fontSize: 22, fontWeight: 700 }}>
                {left} <span className="sub" style={{ fontSize: 14 }}>/ {limit}</span>
              </span>
            </div>
            <span className="sub" style={{ fontSize: 12 }}>{refill}에 다시 채워져요 · 하루 연습 횟수와 따로 세요</span>
          </section>
          <section className="card" style={{ gap: 10 }}>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8, fontSize: 14, lineHeight: 1.5 }}>
              <li>{MOCK_COUNT}문항 · 전체 <b>40분</b>. 문항마다 시간 제한은 없어요.</li>
              <li>질문은 글 없이 소리로만 나와요. <b>문항마다 한 번</b> 다시 들을 수 있어요.</li>
              <li>조용한 곳에서 이어폰을 끼고 보세요.</li>
              <li>끝까지 보지 않고 나가면 <b>횟수를 차감하지 않아요</b>. 이어서 볼 수는 없어요.</li>
            </ul>
          </section>
          {past.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h2 className="label" style={{ margin: 0 }}>지난 모의고사</h2>
              {past.map((p) => (
                <Link key={p.id} href={`/mock/${p.id}/report`} className="card row" style={{ flexDirection: "row", textDecoration: "none", color: "inherit", padding: "12px 16px" }}>
                  <span style={{ fontSize: 14 }}>{dateLabel(p.finished_at)}</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>
                    {p.grade ? (
                      <>
                        예상 <span className="en">{p.grade}</span>
                      </>
                    ) : p.report_status === "failed" ? (
                      "리포트 다시 만들기"
                    ) : (
                      "리포트 만드는 중"
                    )}
                  </span>
                </Link>
              ))}
            </section>
          )}
        </div>
        <div className="bottom" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          {left > 0 ? (
            <>
              <button type="button" className="btn btn-primary" onClick={() => setStep("job")}>배경 설문부터 시작</button>
              <span className="muted" style={{ fontSize: 12 }}>시험 시작 전까지는 언제든 나갈 수 있어요</span>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary" disabled>이번 달 횟수를 다 썼어요</button>
              <span className="muted" style={{ fontSize: 12 }}>{refill}에 다시 볼 수 있어요</span>
            </>
          )}
        </div>
      </main>
    );
  }

  // ───── 배경 설문 ─────
  if (SURVEY_STEPS.includes(step)) {
    const i = SURVEY_STEPS.indexOf(step);
    const n = survey.activities.length;
    const can =
      step === "job" ? !!survey.job : step === "student" ? !!survey.student : step === "living" ? !!survey.living : n >= MIN_ACTIVITIES;
    const toggle = (id: string) =>
      setSurvey((s) => ({ ...s, activities: s.activities.includes(id) ? s.activities.filter((x) => x !== id) : [...s.activities, id] }));
    return (
      <main className="screen">
        <div className="pad" style={{ gap: 12 }}>
          {topbar("배경 설문", `${i + 1} / 4`)}
          <div className="track" aria-hidden="true">
            <div style={{ width: `${((i + 1) / 4) * 100}%` }} />
          </div>
          {step === "job" && (
            <>
              <h2 className="section-title">현재 어떤 일을 하세요?</h2>
              {radio(JOBS, "job")}
            </>
          )}
          {step === "student" && (
            <>
              <h2 className="section-title">지금 학생인가요?</h2>
              {radio(STUDENT, "student")}
            </>
          )}
          {step === "living" && (
            <>
              <h2 className="section-title">어디에서 누구와 살고 있나요?</h2>
              {radio(LIVING, "living")}
            </>
          )}
          {step === "activities" && (
            <>
              <div className="row" style={{ alignItems: "center" }}>
                <h2 className="section-title">여가 · 취미 · 운동 · 휴가</h2>
                <span className="notice" style={{ padding: "4px 10px", fontSize: 12, fontWeight: 700 }} aria-live="polite">
                  {n}개 골랐어요
                </span>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>실제처럼 모두 합쳐 {MIN_ACTIVITIES}개 이상 골라요. 고른 것 중에서 질문이 나와요.</p>
              {ACTIVITY_GROUPS.map((g) => (
                <section key={g.title} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <h3 className="label" style={{ margin: 0 }}>{g.title}</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {g.items.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="chip"
                        style={{ height: 40 }}
                        aria-pressed={survey.activities.includes(a.id)}
                        aria-current={survey.activities.includes(a.id)}
                        onClick={() => toggle(a.id)}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
        <div className="bottom">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!can}
            onClick={() => setStep(i < 3 ? SURVEY_STEPS[i + 1] : "level")}
          >
            {step === "activities" && n < MIN_ACTIVITIES ? `${MIN_ACTIVITIES - n}개 더 골라 주세요` : "다음"}
          </button>
        </div>
      </main>
    );
  }

  // ───── 난이도 자가 평가 ─────
  return (
    <main className="screen">
      <div className="pad" style={{ gap: 8 }}>
        {topbar("난이도 고르기")}
        <p className="muted" style={{ margin: "0 0 4px", fontSize: 14, lineHeight: 1.5 }}>
          내 말하기 수준에 가장 가까운 것을 골라요. 고른 난이도로 문항이 정해져요.
        </p>
        {SELF_LEVELS.map((desc, i) => (
          <button
            key={i}
            type="button"
            className="choice"
            aria-pressed={self === i + 1}
            onClick={() => setSelf(i + 1)}
            style={{ padding: "10px 12px", gap: 12 }}
          >
            <span className="tag" style={{ width: 30, height: 30, fontSize: 14 }}>{i + 1}</span>
            <span style={{ fontSize: 14, lineHeight: 1.45 }}>{desc}</span>
          </button>
        ))}
        <span className="muted" style={{ fontSize: 12, paddingTop: 2 }}>
          앱 등급 <span className="en">{level}</span> 기준 추천: {rec0} ~ {rec1}
        </span>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <div className="bottom" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <button type="button" className="btn btn-primary" disabled={self === null || busy} onClick={start}>
          {busy ? <SpinnerIcon color="#fff" /> : "시험 시작 · 40분"}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>시작하면 시간이 흘러요</span>
      </div>
    </main>
  );
}
