"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LESSON_TURNS, LESSON_USAGE_COST } from "@/lib/call/levels";

/** 끊긴 통화 이어하기 카드. 그만두면 리포트 없이 닫고, 대답이 0번이면 연습 횟수를 돌려준다. */
export default function ResumeCard({
  lessonId,
  title,
  turns,
  minutesAgo,
  minutesLeft,
}: {
  lessonId: string;
  title: string;
  turns: number;
  minutesAgo: number;
  minutesLeft: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function quit() {
    const msg =
      turns === 0
        ? `통화를 그만둘까요? 대답을 안 해서 연습 ${LESSON_USAGE_COST}회를 돌려드려요.`
        : `통화를 그만둘까요? 리포트 없이 끝나고 연습 ${LESSON_USAGE_COST}회는 돌려드리지 않아요.`;
    if (!confirm(msg)) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/call/end", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lessonId, abandon: true }),
    }).catch(() => null);
    // 이미 닫혔으면(409) 그냥 새로 고친다
    if (!res || (!res.ok && res.status !== 409)) {
      setBusy(false);
      setError("그만두지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    router.refresh();
  }

  return (
    <section className="card resume-card" aria-label="끊긴 통화">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="avatar en" aria-hidden="true">Em</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>통화가 끊겼어요</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {title} · 대답 <span className="en">{turns}/{LESSON_TURNS}</span> · {minutesAgo < 1 ? "방금" : `${minutesAgo}분 전`}
          </div>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
        Emma가 기다리고 있어요. 하던 데서 이어서 해요. 연습 횟수는 더 쓰지 않아요.
      </div>
      <div className="btn-row" style={{ gap: 10 }}>
        <Link href={`/call?resume=${lessonId}`} className="btn btn-primary" style={{ flex: 2, height: 52 }}>
          이어서 하기
        </Link>
        <button type="button" className="btn btn-outline" style={{ height: 52 }} onClick={() => void quit()} disabled={busy}>
          그만두기
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>{minutesLeft}분 뒤에는 자동으로 끝나요</div>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
