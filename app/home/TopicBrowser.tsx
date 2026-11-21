"use client";

import { playSfx } from "@/lib/sfx";
import Link from "next/link";
import { useState } from "react";
import { CATEGORIES, type Category } from "@/lib/types";

export interface TopicItem {
  id: string;
  category: Category;
  title_ko: string;
  title_en: string;
  done: number;
  total: number;
}

/**
 * 주제 목록과 분류 탭. 주제는 처음에 한 번에 받아 두고 탭 전환은 휴대폰 안에서만 걸러서,
 * 누르는 즉시 바뀐다 (서버 요청 없음). 고른 탭은 주소(?cat=)에도 남겨 뒤로 가기 때 유지한다.
 */
export default function TopicBrowser({ items, initialCat }: { items: TopicItem[]; initialCat: Category }) {
  const [cat, setCat] = useState<Category>(initialCat);

  function pick(next: Category) {
    if (next !== cat) playSfx("tap");
    setCat(next);
    const url = next === "survey" ? "/home" : `/home?cat=${next}`;
    window.history.replaceState(window.history.state, "", url);
  }

  const shown = items.filter((t) => t.category === cat);

  return (
    <>
      <div className="row" style={{ alignItems: "center", marginTop: 4, flexWrap: "wrap", scrollMarginTop: 16 }} id="topics">
        <h2 className="section-title" style={{ fontSize: 15 }}>주제 목록 · 눌러서 바로 연습</h2>
        <div style={{ display: "flex", gap: 6 }} role="group" aria-label="주제 분류">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className="chip"
              aria-pressed={c.id === cat}
              aria-current={c.id === cat ? "true" : undefined}
              onClick={() => pick(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* key 로 탭마다 목록을 새로 그려 짧게 등장 효과를 준다 */}
      <div className="list" key={cat}>
        {shown.map((t) => (
          <Link key={t.id} href={`/topic/${t.id}`} className="list-item">
            <div className="row">
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {t.title_ko}{" "}
                <span className="en muted" style={{ fontWeight: 400, fontSize: 13 }}>{t.title_en}</span>
              </div>
              <div className="en muted" style={{ fontSize: 13 }}>{t.done}/{t.total}</div>
            </div>
            <div className="track">
              <div style={{ width: `${t.total ? Math.round((t.done / t.total) * 100) : 0}%` }} />
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
