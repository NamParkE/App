import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import SoundSettings from "@/components/SoundSettings";
import { ChartIcon, ChevronIcon } from "@/components/Icons";
import { isOperator, rate, type Overview } from "@/lib/admin";
import { checkProfile, fetchProfile, requireUser, usageToday } from "@/lib/data";
import { formatKrw, toKrw } from "@/lib/pricing";
import { LEVELS } from "@/lib/types";

export default async function MePage() {
  const { supabase, userId, email } = await requireUser();
  const [rawProfile, { data: family }, { data: members }, used, operator] = await Promise.all([
    fetchProfile(supabase, userId),
    supabase.from("families").select("name, invite_code, owner_id").maybeSingle(),
    supabase.from("profiles").select("id, display_name, level").order("created_at"),
    usageToday(supabase, userId),
    isOperator(supabase),
  ]);
  // 운영자에게만: 운영자 메뉴 카드에 이번 달 비용과 한도를 다 쓴 사람 수를 미리 보여 준다
  const overview = operator ? ((await supabase.rpc("admin_overview")).data as Overview | null) : null;
  const profile = checkProfile(rawProfile);
  const levelTitle = LEVELS.find((l) => l.id === profile.level)?.title;

  return (
    <main className="screen">
      <div className="pad">
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>내 정보</h1>

        <Link href="/setup" className="card continue">
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{profile.display_name}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {profile.style === "vocab" ? (
                <>
                  전화영어 · <span className="en">Lv.{profile.call_level}</span>
                </>
              ) : (
                <>
                  오픽 암기형 · {profile.opic_source === "mine" ? "내 스크립트" : <>목표 <span className="en">{profile.level}</span> · {levelTitle}</>}
                </>
              )}
            </div>
          </div>
          <span className="muted" style={{ fontSize: 13 }}>바꾸기</span>
          <ChevronIcon />
        </Link>

        {operator && (
          <Link href="/admin" className="adm-entry">
            <span className="ic">
              <ChartIcon color="#fff" />
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>운영자 메뉴</span>
              <span style={{ fontSize: 12 }}>
                {overview
                  ? `이번 달 AI ${formatKrw(toKrw(overview.month_cost_usd, rate()))} · 오늘 한도 다 씀 ${overview.maxed.length}명`
                  : "AI 비용 · 사용 현황 · 한도 바꾸기"}
              </span>
            </span>
            <ChevronIcon size={18} color="currentColor" />
          </Link>
        )}

        <section className="card">
          <div className="label">오늘 사용량</div>
          <div style={{ fontSize: 15 }}>
            <span className="en" style={{ fontWeight: 700 }}>{used}</span> / {profile.daily_limit}회 사용
          </div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            답변 만들기와 AI 코치 한마디는 1회, 전화영어 수업은 시작할 때 5회 차감돼요. 다 맞게 말하면 차감되지 않아요.
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
                    {m.id === userId ? " · 나" : ""}
                  </span>
                  <span className="en muted">{m.level}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <SoundSettings />

        <Link href="/phrasebook" className="btn btn-outline">표현장</Link>
        <Link href="/password" className="btn btn-outline">비밀번호 설정·변경</Link>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn btn-outline">로그아웃</button>
        </form>
        <div className="muted en" style={{ fontSize: 12, textAlign: "center" }}>{email}</div>
      </div>
      <BottomNav current="/me" />
    </main>
  );
}
