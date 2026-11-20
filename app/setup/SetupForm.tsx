"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BackIcon, BookIcon, ChatIcon, CheckIcon } from "@/components/Icons";
import { LEVELS, type Level, type Profile } from "@/lib/types";

export default function SetupForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [level, setLevel] = useState<Level>(profile.level);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    const { error } = await createClient()
      .from("profiles")
      .update({ level, style: "memorize", setup_done: true })
      .eq("id", profile.id);
    if (error) {
      setError("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setBusy(false);
      return;
    }
    router.replace("/home");
    router.refresh();
  }

  return (
    <main className="screen">
      <div className="pad" style={{ gap: 0 }}>
        <div className="topbar">
          {profile.setup_done && (
            <button type="button" className="icon-btn" aria-label="뒤로" onClick={() => router.back()}>
              <BackIcon />
            </button>
          )}
        </div>
        <h1 className="title" style={{ margin: "16px 0 6px" }}>
          반가워요, {profile.display_name}님
          <br />
          목표 등급을 골라주세요
        </h1>
        <p className="subtitle" style={{ marginBottom: 20 }}>
          등급에 맞춰 답변 문장의 길이와 표현을 바꿔 드려요.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              className="choice"
              aria-pressed={level === l.id}
              onClick={() => setLevel(l.id)}
            >
              <div className="tag">{l.id}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1 }}>
                <div className="choice-title">{l.title}</div>
                <div className="choice-desc">{l.desc}</div>
              </div>
              {level === l.id && <CheckIcon color="var(--accent)" />}
            </button>
          ))}
        </div>

        <h2 className="section-title" style={{ margin: "28px 0 12px" }}>학습 스타일</h2>
        <div className="style-grid">
          <button type="button" className="choice style-card" aria-pressed="true">
            <ChatIcon color="var(--accent)" />
            <div className="choice-title">오픽 암기형</div>
            <div className="choice-desc">핵심 답변을 말하며 외우기</div>
          </button>
          <button type="button" className="choice style-card" disabled>
            <BookIcon color="#6B7280" />
            <div className="choice-title">어휘 확장형</div>
            <div className="soon">준비 중</div>
          </button>
        </div>

        {profile.setup_done && level !== profile.level && (
          <p className="notice" style={{ marginTop: 16 }}>
            등급을 바꾸면 주제마다 새 등급에 맞는 답변을 새로 만들어요. 이전 등급의 기록은 남아 있어요.
          </p>
        )}
        {error && <p className="error" role="alert" style={{ marginTop: 16 }}>{error}</p>}
        <div style={{ flexGrow: 1, minHeight: 24 }} />
      </div>
      <div className="bottom">
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
          {profile.setup_done ? "저장하기" : "이대로 시작하기"}
        </button>
      </div>
    </main>
  );
}
