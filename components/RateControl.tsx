"use client";

import { playSfx } from "@/lib/sfx";
import { useEffect, useState } from "react";
import { getRate, RATES, setRate } from "@/lib/speech";

/** 문장 듣기 속도. 고르면 이 기기에 저장되고, 모든 듣기 버튼에 적용된다. */
export default function RateControl() {
  const [rate, setLocal] = useState<number | null>(null);

  useEffect(() => {
    setLocal(getRate());
  }, []);

  return (
    <div className="rate" role="group" aria-label="듣기 속도">
      <span className="rate-label">듣기 속도</span>
      {RATES.map((r) => (
        <button
          key={r.value}
          type="button"
          className="chip"
          aria-pressed={rate === r.value}
          aria-current={rate === r.value ? "true" : undefined}
          onClick={() => {
            setRate(r.value);
            setLocal(r.value);
            playSfx("tap");
          }}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
