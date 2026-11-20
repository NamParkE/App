"use client";

import { useState } from "react";
import Reppy, { type ReppyMood } from "./Reppy";
import { playSfx } from "@/lib/sfx";

/** 누르면 짹짹 하며 통통 뛰는 리피 (홈의 숨은 재미) */
export default function ReppyPet({ mood, size = 64 }: { mood: ReppyMood; size?: number }) {
  const [petted, setPetted] = useState(false);
  return (
    <button
      type="button"
      className="reppy-pet"
      aria-label="리피 쓰다듬기"
      onClick={() => {
        playSfx("pet");
        setPetted(true);
        setTimeout(() => setPetted(false), 1200);
      }}
    >
      <Reppy mood={petted ? "happy" : mood} size={size} decorative />
    </button>
  );
}
