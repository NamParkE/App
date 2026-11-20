"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import ReviewRunner from "@/components/ReviewRunner";
import { ReppySays } from "@/components/Reppy";
import { BackIcon, SpeakerIcon } from "@/components/Icons";
import { speak } from "@/lib/speech";

export interface PhraseRow {
  id: string;
  en: string;
  ko: string;
  example: string;
  stage: number;
  next_review_on: string;
}

type Filter = "all" | "due" | "learned";

function whenLabel(r: PhraseRow, today: string) {
  if (r.stage >= 4) return "익힘";
  if (r.next_review_on <= today) return "오늘 복습";
  const days = Math.round((new Date(r.next_review_on).getTime() - new Date(today).getTime()) / 86400000);
  return days === 1 ? "내일 복습" : `${days}일 뒤 복습`;
}

/** 표현장. 거르기는 휴대폰 안에서 바로 (서버 요청 없음) */
export default function Phrasebook({ rows, today }: { rows: PhraseRow[]; today: string }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [reviewing, setReviewing] = useState(false);
  const due = rows.filter((r) => r.next_review_on <= today && r.stage < 4);
  const shown = rows.filter((r) => (filter === "due" ? due.includes(r) : filter === "learned" ? r.stage >= 4 : true));

  if (reviewing) {
    return (
      <main className="screen">
        <div className="pad">
          <div className="topbar">
            <button type="button" className="icon-btn" aria-label="복습 그만하기" onClick={() => setReviewing(false)}>
              <BackIcon />
            </button>
            <h1>표현 복습</h1>
          </div>
          <ReviewRunner
            items={due.slice(0, 10)}
            onDone={() => {
              setReviewing(false);
              router.refresh();
            }}
            doneLabel="표현장으로"
          />
        </div>
      </main>
    );
  }

  return (
    <main className="screen">
      <div className="pad">
        <div className="topbar">
          <Link href="/home" className="icon-btn" aria-label="뒤로">
            <BackIcon />
          </Link>
          <h1>
            표현장 <span className="en muted" style={{ fontSize: 14 }}>{rows.length}</span>
          </h1>
        </div>

        {due.length > 0 && (
          <section className="usage" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>오늘 복습할 표현 {due.length}개</div>
              <small>듣고 따라 말하면 복습 단계가 올라가요</small>
            </div>
            <button type="button" className="level-btn" onClick={() => setReviewing(true)}>
              복습 시작
            </button>
          </section>
        )}

        <div style={{ display: "flex", gap: 6 }} role="group" aria-label="표현 거르기">
          {(
            [
              ["all", "전체"],
              ["due", "복습할 것"],
              ["learned", "익힌 것"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className="chip" aria-pressed={filter === id} aria-current={filter === id ? "true" : undefined} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <ReppySays mood="idle">전화영어 수업을 마치면 그날 배운 표현이 여기에 모여요.</ReppySays>
        ) : (
          <div className="list" key={filter}>
            {shown.map((r) => (
              <div key={r.id} className="list-item" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, flexGrow: 1, minWidth: 0 }}>
                  <div className="en" lang="en" style={{ fontSize: 15, fontWeight: 600 }}>{r.en}</div>
                  <div className="ko-line">{r.ko}</div>
                  {r.example && <div className="en muted ellipsis" lang="en" style={{ fontSize: 12 }}>{r.example}</div>}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <div className="segments mini" role="img" aria-label={`복습 ${r.stage}단계`}>
                      {[1, 2, 3, 4].map((n) => (
                        <div key={n} className={n <= r.stage ? "on" : undefined} />
                      ))}
                    </div>
                    <span className="muted" style={{ fontSize: 11 }}>{whenLabel(r, today)}</span>
                  </div>
                </div>
                <button type="button" className="round-btn" aria-label={`${r.en} 듣기`} onClick={() => speak(r.example || r.en)}>
                  <SpeakerIcon size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
