"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, CloseIcon, ListIcon, PhoneIcon } from "@/components/Icons";
import { playSfx } from "@/lib/sfx";

export interface PickTopic {
  id: string;
  title_ko: string;
  title_en: string;
  done: boolean;
}

/**
 * 전화영어 홈의 "오늘의 수업" 카드. 큰 버튼은 "수업 시작" 하나, 그 아래 테두리 버튼 "다른 주제 고르기".
 * 주제 목록은 이미 받아 둔 것이라 시트가 바로 열리고, 고르면 카드의 주제가 바뀐다 (바로 통화가 시작되지 않음).
 */
export default function TodayLesson({
  topics,
  initialId,
  canStart,
  usageNote,
  cost,
}: {
  topics: PickTopic[];
  initialId: string;
  canStart: boolean;
  /** 카드 맨 아래 한 줄 (남은 사용량 또는 시작할 수 없는 이유) */
  usageNote: string;
  cost: number;
}) {
  const [id, setId] = useState(initialId);
  const [open, setOpen] = useState(false);
  const topic = topics.find((t) => t.id === id) ?? topics[0];

  function pick(next: string) {
    playSfx("tap");
    setId(next);
    setOpen(false);
  }

  return (
    <section className="hero-card" aria-label="오늘의 수업">
      <span className="sub">오늘의 수업 · 약 10분</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 700 }}>{topic.title_ko}</span>
        <span className="sub en" lang="en">{topic.title_en}</span>
      </div>
      {canStart ? (
        <Link href={`/call?topic=${topic.id}`} className="btn btn-primary">
          <PhoneIcon color="#FFFFFF" />
          수업 시작
        </Link>
      ) : null}
      <button type="button" className="btn hero-outline" onClick={() => setOpen(true)}>
        <ListIcon size={18} color="#FFFFFF" />
        다른 주제 고르기
      </button>
      <span className="sub" style={{ fontSize: 12, textAlign: "center" }}>
        {canStart ? `사용량 ${cost}회 · ${usageNote}` : usageNote}
      </span>

      {open &&
        createPortal(
          <div className="sheet-backdrop" onClick={() => setOpen(false)}>
            <div className="sheet" role="dialog" aria-modal="true" aria-label="수업 주제 고르기" onClick={(e) => e.stopPropagation()}>
              <div className="row" style={{ alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <h2 className="section-title">어떤 이야기를 할까요?</h2>
                  <span className="muted" style={{ fontSize: 13 }}>누르면 오늘의 수업이 바뀌어요</span>
                </div>
                <button type="button" className="icon-btn" style={{ justifyContent: "flex-end" }} aria-label="닫기" onClick={() => setOpen(false)}>
                  <CloseIcon />
                </button>
              </div>
              <div className="list">
                {topics.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="list-item pick-item"
                    aria-pressed={t.id === topic.id}
                    onClick={() => pick(t.id)}
                  >
                    <span style={{ display: "flex", flexDirection: "column", flexGrow: 1, textAlign: "left" }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{t.title_ko}</span>
                      <span className="en muted" style={{ fontSize: 13 }}>{t.title_en}</span>
                    </span>
                    {t.done && (
                      <span className="muted" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                        <CheckIcon size={16} color="var(--ok-ink)" /> 해 봄
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          // 애니메이션이 걸린 상자 안에 두면 위치가 어긋나서 화면 맨 바깥에 그린다
          document.body,
        )}
    </section>
  );
}
