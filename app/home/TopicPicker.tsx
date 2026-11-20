"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, CloseIcon } from "@/components/Icons";

/** 오늘의 수업 주제 바꾸기 (목록은 이미 받아 둔 것이라 바로 열린다) */
export default function TopicPicker({ topics }: { topics: { id: string; title_ko: string; title_en: string; done: boolean }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="ghost-chip" onClick={() => setOpen(true)}>
        주제 바꾸기
      </button>
      {open &&
        createPortal(
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="수업 주제 고르기" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ alignItems: "center" }}>
              <h2 className="section-title">수업 주제</h2>
              <button type="button" className="icon-btn" style={{ justifyContent: "flex-end" }} aria-label="닫기" onClick={() => setOpen(false)}>
                <CloseIcon />
              </button>
            </div>
            <div className="list">
              {topics.map((t) => (
                <Link key={t.id} href={`/call?topic=${t.id}`} className="list-item" style={{ flexDirection: "row", alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{t.title_ko}</span>
                    <span className="en muted" style={{ fontSize: 13 }}>{t.title_en}</span>
                  </div>
                  {t.done && (
                    <span className="muted" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                      <CheckIcon size={16} color="var(--ok-ink)" /> 해 봄
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </div>,
          // 애니메이션이 걸린 상자 안에 두면 위치가 어긋나서 화면 맨 바깥에 그린다
          document.body,
        )}
    </>
  );
}
