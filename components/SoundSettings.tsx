"use client";

import { useEffect, useState } from "react";
import { getSfxSettings, playSfx, setSfxSettings, VOLUMES, type SfxSettings } from "@/lib/sfx";

/** 내 정보 › 효과음 (이 기기에만 저장) */
export default function SoundSettings() {
  const [s, setS] = useState<SfxSettings | null>(null);

  useEffect(() => setS(getSfxSettings()), []);

  function update(next: Partial<SfxSettings>, preview?: Parameters<typeof playSfx>[0]) {
    setSfxSettings(next);
    setS(getSfxSettings());
    if (preview) playSfx(preview);
  }

  if (!s) return null;
  return (
    <section className="card" aria-label="효과음">
      <div className="label">효과음 · 이 기기에만 저장돼요</div>
      <label className="setting-row" htmlFor="sfx-on">
        효과음
        <span className="switch">
          <input id="sfx-on" type="checkbox" role="switch" checked={s.on} onChange={(e) => update({ on: e.target.checked }, e.target.checked ? "good" : undefined)} />
          <span />
        </span>
      </label>
      {s.on && (
        <div className="setting-row">
          크기
          <div className="mode-tabs" role="group" aria-label="효과음 크기" style={{ marginTop: 0 }}>
            {VOLUMES.map((v) => (
              <button key={v.value} type="button" aria-pressed={s.volume === v.value} role="tab" aria-selected={s.volume === v.value} onClick={() => update({ volume: v.value }, "good")}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="setting-row" htmlFor="sfx-vibe">
        잘했을 때 진동
        <span className="switch">
          <input id="sfx-vibe" type="checkbox" role="switch" checked={s.vibrate} onChange={(e) => update({ vibrate: e.target.checked }, e.target.checked ? "good" : undefined)} />
          <span />
        </span>
      </label>
    </section>
  );
}
