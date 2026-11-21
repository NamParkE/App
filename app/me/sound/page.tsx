import Link from "next/link";
import { BackIcon } from "@/components/Icons";
import SoundSettings from "@/components/SoundSettings";

/** 내 정보 → 소리 · 진동 (이 기기에만 저장) */
export default function MeSoundPage() {
  return (
    <main className="screen">
      <div className="pad">
        <div className="topbar">
          <Link href="/me" className="icon-btn" aria-label="내 정보로">
            <BackIcon />
          </Link>
          <h1>소리 · 진동</h1>
        </div>
        <SoundSettings />
      </div>
    </main>
  );
}
