"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BackIcon, CheckIcon, ChatIcon, PhoneIcon, SpeakerIcon, SpinnerIcon } from "@/components/Icons";
import { speak } from "@/lib/speech";
import { CALL_LEVELS } from "@/lib/call/levels";
import { LEVELS, type Level, type Profile, type Style } from "@/lib/types";

export default function SetupForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [style, setStyle] = useState<Style>(profile.style);
  const [level, setLevel] = useState<Level>(profile.level);
  const [callLevel, setCallLevel] = useState<number>(profile.call_level);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    const update: Record<string, unknown> = { style, setup_done: true };
    if (style === "memorize") update.level = level;
    if (style === "vocab" && callLevel !== profile.call_level) {
      update.call_level = callLevel;
      update.call_level_since = new Date().toISOString(); // 레벨 진행(80점 × 3번)은 새 레벨부터 센다
    }
    const { error } = await createClient().from("profiles").update(update).eq("id", profile.id);
    if (error) {
      setError("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setBusy(false);
      return;
    }
    router.replace("/home");
    router.refresh();
  }

  const L = CALL_LEVELS[callLevel - 1];
  const cta =
    style === "vocab"
      ? `Lv.${callLevel} ${L.name}(으)로 ${profile.setup_done ? "저장하기" : "시작하기"}`
      : profile.setup_done
        ? "저장하기"
        : "이대로 시작하기";

  return (
    <main className="screen">
      <div className="pad" style={{ gap: 14 }}>
        <div className="topbar">
          {profile.setup_done && (
            <button type="button" className="icon-btn" aria-label="뒤로" onClick={() => router.back()}>
              <BackIcon />
            </button>
          )}
        </div>
        <h1 className="title">
          {profile.setup_done ? "학습 스타일" : `반가워요, ${profile.display_name}님`}
        </h1>

        <div className="style-grid">
          <button type="button" className="choice style-card" aria-pressed={style === "memorize"} onClick={() => setStyle("memorize")}>
            <ChatIcon color={style === "memorize" ? "var(--accent)" : "#6B7280"} />
            <div className="choice-title">오픽 암기형</div>
            <div className="choice-desc">핵심 답변을 말하며 외우기</div>
          </button>
          <button type="button" className="choice style-card" aria-pressed={style === "vocab"} onClick={() => setStyle("vocab")}>
            <PhoneIcon size={26} color={style === "vocab" ? "var(--accent)" : "#6B7280"} />
            <div className="choice-title">어휘 확장형</div>
            <div className="choice-desc">전화영어처럼 AI 선생님과 대화</div>
          </button>
        </div>

        {style === "memorize" ? (
          <>
            <h2 className="section-title" style={{ marginTop: 6 }}>오픽 목표 등급</h2>
            <p className="subtitle" style={{ marginTop: -6 }}>등급에 맞춰 답변 문장의 길이와 표현을 바꿔 드려요.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {LEVELS.map((l) => (
                <button key={l.id} type="button" className="choice" aria-pressed={level === l.id} onClick={() => setLevel(l.id)}>
                  <div className="tag">{l.id}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1 }}>
                    <div className="choice-title">{l.title}</div>
                    <div className="choice-desc">{l.desc}</div>
                  </div>
                  {level === l.id && <CheckIcon color="var(--accent)" />}
                </button>
              ))}
            </div>
            {profile.setup_done && level !== profile.level && (
              <p className="notice">등급을 바꾸면 주제마다 새 등급에 맞는 답변을 새로 만들어요. 이전 등급의 기록은 남아 있어요.</p>
            )}
          </>
        ) : (
          <>
            <div className="row" style={{ alignItems: "baseline", marginTop: 6 }}>
              <h2 className="section-title">{profile.setup_done ? "레벨" : "시작 레벨"}</h2>
              <span className="muted" style={{ fontSize: 12 }}>예시를 듣고 알아들을 만한 레벨로</span>
            </div>
            <div className="list" role="radiogroup" aria-label="전화영어 레벨">
              {CALL_LEVELS.map((l) => (
                <div key={l.n} className="level-row" data-on={callLevel === l.n || undefined}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={callLevel === l.n}
                    className="level-pick"
                    onClick={() => setCallLevel(l.n)}
                  >
                    <span className="level-tag en">Lv.{l.n}</span>
                    <span style={{ display: "flex", flexDirection: "column", minWidth: 0, textAlign: "left" }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>
                        {l.name} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{l.band}</span>
                      </span>
                      <span className="en muted ellipsis" style={{ fontSize: 12 }}>{l.sample}</span>
                    </span>
                  </button>
                  <button type="button" className="round-btn" style={{ width: 40, height: 40 }} aria-label={`Lv.${l.n} 예시 듣기`} onClick={() => speak(l.sample, { rate: l.rate })}>
                    <SpeakerIcon size={16} />
                  </button>
                </div>
              ))}
            </div>
            {profile.setup_done && callLevel !== profile.call_level && (
              <p className="notice">레벨을 바꾸면 레벨 진행(80점 이상 3번)은 새 레벨에서 다시 세요.</p>
            )}
          </>
        )}

        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <div className="bottom">
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? (
            <>
              <SpinnerIcon color="#fff" /> 저장 중…
            </>
          ) : (
            cta
          )}
        </button>
      </div>
    </main>
  );
}
