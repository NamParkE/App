"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Style } from "@/lib/types";

const ModeContext = createContext<{ style: Style; pick: (s: Style) => void } | null>(null);

/**
 * 홈의 학습 모드 전환. 홈은 두 모드의 데이터를 한 번에 받아 두 화면을 모두 만들어 두므로,
 * 탭을 누르면 서버를 기다리지 않고 바로 바뀐다. 고른 모드는 뒤에서 프로필에 저장한다.
 */
export default function HomeModeSwitch({
  userId,
  initial,
  memorize,
  call,
}: {
  userId: string;
  initial: Style;
  memorize: ReactNode;
  call: ReactNode;
}) {
  const [style, setStyle] = useState<Style>(initial);
  const [error, setError] = useState(false);

  function pick(next: Style) {
    if (next === style) return;
    const prev = style;
    setStyle(next);
    setError(false);
    void createClient()
      .from("profiles")
      .update({ style: next })
      .eq("id", userId)
      .then(({ error }) => {
        if (error) {
          setStyle(prev);
          setError(true);
        }
      });
  }

  return (
    <ModeContext.Provider value={{ style, pick }}>
      {error && (
        <p className="error mode-error" role="alert">
          모드를 저장하지 못했어요. 인터넷 연결을 확인해 주세요.
        </p>
      )}
      {/* key 로 바꿀 때마다 새로 그려 등장 효과를 준다 */}
      <div key={style} style={{ display: "contents" }}>
        {style === "vocab" ? call : memorize}
      </div>
    </ModeContext.Provider>
  );
}

/** 홈 위쪽 제목 자리의 "오픽 암기 | 전화영어" 탭 */
export function ModeTabs({ badge }: { badge?: string }) {
  const ctx = useContext(ModeContext);
  if (!ctx) return null;
  const { style, pick } = ctx;
  return (
    <div className="mode-tabs" role="tablist" aria-label="학습 모드">
      <button type="button" role="tab" aria-selected={style === "memorize"} onClick={() => pick("memorize")}>
        오픽 암기{style === "memorize" && badge ? <span className="en mode-badge">{badge}</span> : null}
      </button>
      <button type="button" role="tab" aria-selected={style === "vocab"} onClick={() => pick("vocab")}>
        전화영어{style === "vocab" && badge ? <span className="en mode-badge">{badge}</span> : null}
      </button>
    </div>
  );
}
