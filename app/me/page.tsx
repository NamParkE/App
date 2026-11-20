import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { ChevronIcon } from "@/components/Icons";
import { requireProfile, usageToday } from "@/lib/data";
import { LEVELS } from "@/lib/types";

export default async function MePage() {
  const { supabase, user, profile } = await requireProfile();
  const [{ data: family }, { data: members }, used] = await Promise.all([
    supabase.from("families").select("name, invite_code, owner_id").eq("id", profile.family_id).maybeSingle(),
    supabase.from("profiles").select("id, display_name, level").eq("family_id", profile.family_id).order("created_at"),
    usageToday(supabase, user.id),
  ]);
  const levelTitle = LEVELS.find((l) => l.id === profile.level)?.title;

  return (
    <main className="screen">
      <div className="pad">
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>내 정보</h1>

        <Link href="/setup" className="card continue">
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{profile.display_name}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              목표 <span className="en">{profile.level}</span> · {levelTitle} · 오픽 암기형
            </div>
          </div>
          <span className="muted" style={{ fontSize: 13 }}>바꾸기</span>
          <ChevronIcon />
        </Link>

        <section className="card">
          <div className="label">오늘 사용량</div>
          <div style={{ fontSize: 15 }}>
            <span className="en" style={{ fontWeight: 700 }}>{used}</span> / {profile.daily_limit}회 사용
          </div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            답변 만들기와 AI 코치 한마디가 1회씩 차감돼요. 다 맞게 말하면 차감되지 않아요.
          </div>
        </section>

        {family && (
          <section className="card">
            <div className="label">{family.name}</div>
            <div className="row" style={{ alignItems: "center" }}>
              <div style={{ fontSize: 14 }}>가족 초대 코드</div>
              <div className="en" style={{ fontSize: 20, fontWeight: 700, letterSpacing: 3 }}>{family.invite_code}</div>
            </div>
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
              가족에게 이 코드를 알려 주면 각자 계정으로 들어올 수 있어요.
            </div>
            <div className="divider" />
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {(members ?? []).map((m) => (
                <li key={m.id} className="row" style={{ fontSize: 14 }}>
                  <span>
                    {m.display_name}
                    {m.id === family.owner_id ? " (관리자)" : ""}
                    {m.id === user.id ? " · 나" : ""}
                  </span>
                  <span className="en muted">{m.level}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Link href="/password" className="btn btn-outline">비밀번호 설정·변경</Link>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn btn-outline">로그아웃</button>
        </form>
        <div className="muted en" style={{ fontSize: 12, textAlign: "center" }}>{user.email}</div>
      </div>
      <BottomNav current="/me" />
    </main>
  );
}
