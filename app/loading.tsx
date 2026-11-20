import Reppy from "@/components/Reppy";

// 화면을 옮길 때 서버에서 데이터를 받는 동안 보여 준다.
export default function Loading() {
  return (
    <main className="screen" aria-busy="true">
      <div
        className="pad"
        role="status"
        style={{ alignItems: "center", justifyContent: "center", gap: 10, color: "var(--muted)", fontSize: 14 }}
      >
        <span style={{ display: "flex" }}>
          <Reppy mood="think" size={120} decorative />
        </span>
        불러오는 중…
      </div>
    </main>
  );
}
