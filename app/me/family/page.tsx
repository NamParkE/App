import Link from "next/link";
import { BackIcon } from "@/components/Icons";
import { requireUser } from "@/lib/data";

/** 내 정보 → 가족 · 초대 코드 (예전 내 정보 화면의 가족 카드를 그대로 옮김) */
export default async function MeFamilyPage() {
  const { supabase, userId } = await requireUser();
  const [{ data: family }, { data: members }] = await Promise.all([
    supabase.from("families").select("name, invite_code, owner_id").maybeSingle<{ name: string; invite_code: string; owner_id: string }>(),
    supabase.from("profiles").select("id, display_name, level, style, call_level").order("created_at"),
  ]);

  return (
    <main className="screen">
      <div className="pad">
        <div className="topbar">
          <Link href="/me" className="icon-btn" aria-label="내 정보로">
            <BackIcon />
          </Link>
          <h1>가족 · 초대 코드</h1>
        </div>
        {family ? (
          <>
            <section className="card">
              <div className="label">{family.name}</div>
              <div className="row" style={{ alignItems: "center" }}>
                <div style={{ fontSize: 14 }}>가족 초대 코드</div>
                <div className="en" style={{ fontSize: 22, fontWeight: 700, letterSpacing: 3 }}>{family.invite_code}</div>
              </div>
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                가족에게 이 코드를 알려 주면 각자 계정으로 들어올 수 있어요.
              </div>
            </section>
            <section className="card">
              <div className="label">구성원 {(members ?? []).length}명</div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {(members ?? []).map((m) => (
                  <li key={m.id} className="row" style={{ fontSize: 15 }}>
                    <span>
                      {m.display_name}
                      {m.id === family.owner_id ? <span className="muted" style={{ fontSize: 13 }}> · 관리자</span> : ""}
                      {m.id === userId ? <span className="muted" style={{ fontSize: 13 }}> · 나</span> : ""}
                    </span>
                    <span className="en muted" style={{ fontSize: 13 }}>
                      {m.style === "vocab" ? `Lv.${m.call_level}` : m.level}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <p className="muted">가족 정보를 불러오지 못했어요.</p>
        )}
      </div>
    </main>
  );
}
