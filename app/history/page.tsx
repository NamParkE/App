import BottomNav from "@/components/BottomNav";
import { ChartIcon } from "@/components/Icons";
import { requireProfile } from "@/lib/data";

export default async function HistoryPage() {
  await requireProfile();
  return (
    <main className="screen">
      <div className="pad" style={{ justifyContent: "center", alignItems: "center", textAlign: "center", gap: 12 }}>
        <ChartIcon size={40} color="var(--muted)" />
        <h1 className="title" style={{ fontSize: 20 }}>학습 기록은 준비 중이에요</h1>
        <p className="subtitle">연습한 기록은 이미 저장되고 있어요. 곧 한눈에 볼 수 있게 할게요.</p>
      </div>
      <BottomNav current="/history" />
    </main>
  );
}
