"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MAX = 30;
const clamp = (v: number) => Math.max(0, Math.min(MAX, Math.round(v)));

/** 모의고사 월 횟수 바꾸기 (기본 3회, 매달 1일 한국 시간에 다시 채워짐). 저장하면 바로 적용된다. */
export default function MockLimitForm({
  userId,
  initialLimit,
  usedMonth,
  grades,
}: {
  userId: string;
  initialLimit: number;
  usedMonth: number;
  /** 이번 달 마친 시험의 예상 등급 (리포트가 없으면 null) */
  grades: (string | null)[];
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialLimit);
  const [limit, setLimit] = useState(initialLimit);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const changed = limit !== saved;

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/mock-limit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, limit }),
      });
      const body = (await res.json().catch(() => ({}))) as { limit?: number; message?: string };
      if (!res.ok || typeof body.limit !== "number") {
        setMessage(body.message ?? "횟수를 저장하지 못했어요.");
        return;
      }
      setSaved(body.limit);
      setLimit(body.limit);
      setMessage("저장했어요. 바로 적용돼요.");
      router.refresh();
    } catch {
      setMessage("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="mock-limit-title">
      <div className="row">
        <h2 id="mock-limit-title" style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>모의고사 한도</h2>
        <span className="muted" style={{ fontSize: 12 }}>이달 {usedMonth}회 사용</span>
      </div>
      <div className="adm-stepper">
        <button type="button" aria-label="1회 줄이기" onClick={() => setLimit((v) => clamp(v - 1))} disabled={busy || limit <= 0}>
          −
        </button>
        <label className="val">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX}
            value={limit}
            onChange={(e) => setLimit(clamp(Number(e.target.value) || 0))}
            aria-label="모의고사 한도 (회)"
            disabled={busy}
          />
          <span className="muted" style={{ fontSize: 12 }}>회 / 한 달 · 기본 3</span>
        </label>
        <button type="button" aria-label="1회 늘리기" onClick={() => setLimit((v) => clamp(v + 1))} disabled={busy || limit >= MAX}>
          +
        </button>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
        {changed ? `저장하면 바로 적용돼요. 이달 남은 횟수는 ${Math.max(0, limit - usedMonth)}회가 돼요.` : "매달 1일(한국 시간)에 다시 채워져요. 1회 리포트 비용은 약 100~200원이에요."}
        {grades.length > 0 && ` 이달 예상 등급: ${grades.map((g) => g ?? "만드는 중").join(", ")}`}
      </p>
      {message && (
        <p role="status" className="notice" style={{ margin: 0 }}>
          {message}
        </p>
      )}
      <button type="button" className="btn btn-primary" style={{ height: 48 }} onClick={save} disabled={busy || !changed}>
        {busy ? "저장하는 중…" : changed ? `${saved}회 → ${limit}회로 저장` : "저장됨"}
      </button>
    </section>
  );
}
