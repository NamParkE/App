"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const PRESETS = [20, 30, 50, 100];
const MIN = 0;
const MAX = 200;
const STEP = 5;

const clamp = (v: number) => Math.max(MIN, Math.min(MAX, Math.round(v)));

/** 하루 한도 바꾸기. 저장하면 바로 적용된다. */
export default function LimitForm({
  userId,
  initialLimit,
  usedToday,
  wonPerUse,
}: {
  userId: string;
  initialLimit: number;
  usedToday: number;
  /** 1회 사용에 드는 대략적인 원화 (이 사람의 이번 달 기록 기준, 없으면 null) */
  wonPerUse: number | null;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialLimit);
  const [limit, setLimit] = useState(initialLimit);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const changed = limit !== saved;
  const daily = wonPerUse !== null ? Math.round(limit * wonPerUse) : null;

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/limit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, limit }),
      });
      const body = (await res.json().catch(() => ({}))) as { limit?: number; message?: string };
      if (!res.ok || typeof body.limit !== "number") {
        setMessage(body.message ?? "한도를 저장하지 못했어요.");
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
    <section className="card" aria-labelledby="limit-title">
      <div className="row">
        <h2 id="limit-title" style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>하루 한도</h2>
        <span className="muted" style={{ fontSize: 12 }}>오늘 {usedToday}회 사용</span>
      </div>
      <div className="adm-stepper">
        <button type="button" aria-label={`${STEP}회 줄이기`} onClick={() => setLimit((v) => clamp(v - STEP))} disabled={busy || limit <= MIN}>
          −
        </button>
        <label className="val">
          <input
            type="number"
            inputMode="numeric"
            min={MIN}
            max={MAX}
            value={limit}
            onChange={(e) => setLimit(clamp(Number(e.target.value) || 0))}
            aria-label="하루 한도 (회)"
            disabled={busy}
          />
          <span className="muted" style={{ fontSize: 12 }}>회 / 하루</span>
        </label>
        <button type="button" aria-label={`${STEP}회 늘리기`} onClick={() => setLimit((v) => clamp(v + STEP))} disabled={busy || limit >= MAX}>
          +
        </button>
      </div>
      <div className="adm-presets">
        {PRESETS.map((v) => (
          <button key={v} type="button" aria-pressed={v === limit} onClick={() => setLimit(v)} disabled={busy}>
            {v}회
          </button>
        ))}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
        {changed
          ? `저장하면 바로 적용돼요. 오늘 남은 횟수는 ${Math.max(0, limit - usedToday)}회가 돼요.`
          : `${MIN}~${MAX}회 사이로 정할 수 있어요.`}
        {daily !== null && ` 매일 다 쓰면 하루 약 ${daily.toLocaleString("ko-KR")}원이에요.`}
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
