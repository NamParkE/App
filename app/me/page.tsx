import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { ChevronIcon } from "@/components/Icons";
import { isOperator, rate, type Overview } from "@/lib/admin";
import { checkProfile, fetchProfile, requireUser, usageToday } from "@/lib/data";
import { formatKrw, toKrw } from "@/lib/pricing";
import { LEVELS } from "@/lib/types";

/**
 * 내 정보. 큰 버튼 없이 목록 한 덩어리로 정리한다 (유저 테스트: 같은 크기 버튼이 여럿이면 뭘 눌러야 할지 모름).
 * 가족 · 초대 코드와 소리 · 진동은 각각 다음 화면으로, 로그아웃은 맨 아래 작은 글자.
 */
export default async function MePage() {
  const { supabase, userId, email } = await requireUser();
  const [rawProfile, { data: family }, { count: memberCount }, used, operator] = await Promise.all([
    fetchProfile(supabase, userId),
    supabase.from("families").select("name").maybeSingle<{ name: string }>(),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    usageToday(supabase, userId),
    isOperator(supabase),
  ]);
  // 운영자에게만: 운영자 메뉴 줄에 이번 달 비용과 한도를 다 쓴 사람 수를 미리 보여 준다
  const overview = operator ? ((await supabase.rpc("admin_overview")).data as Overview | null) : null;
  const profile = checkProfile(rawProfile);
  const levelTitle = LEVELS.find((l) => l.id === profile.level)?.title;
  const maskedEmail = email ? email.replace(/^(.{1,3}).*@.*?(\.[^.]+)$/, "$1…@…$2") : "";

  return (
    <main className="screen">
      <div className="pad">
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>내 정보</h1>

        <Link href="/setup" className="card continue">
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{profile.display_name}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {profile.style === "vocab" ? (
                <>
                  전화영어 · <span className="en">Lv.{profile.call_level}</span>
                </>
              ) : (
                <>
                  오픽 암기 · {profile.opic_source === "mine" ? "내 스크립트" : <>목표 <span className="en">{profile.level}</span> · {levelTitle}</>}
                </>
              )}{" "}
              · 오늘 <span className="en">{used}/{profile.daily_limit}</span>회 사용
            </div>
          </div>
          <span className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>학습 설정</span>
          <ChevronIcon />
        </Link>

        <nav className="adm-list" aria-label="내 정보 메뉴">
          <Link href="/phrasebook" className="adm-item me-row">
            <span className="name">표현장</span>
            <ChevronIcon size={18} />
          </Link>
          <Link href="/me/family" className="adm-item me-row">
            <span className="name">가족 · 초대 코드</span>
            {family && (
              <span className="muted" style={{ fontSize: 13 }}>
                {family.name} {memberCount ?? 0}명
              </span>
            )}
            <ChevronIcon size={18} />
          </Link>
          <Link href="/me/sound" className="adm-item me-row">
            <span className="name">소리 · 진동</span>
            <ChevronIcon size={18} />
          </Link>
          <Link href="/password" className="adm-item me-row">
            <span className="name">비밀번호 설정 · 변경</span>
            <ChevronIcon size={18} />
          </Link>
        </nav>

        {operator && (
          <nav className="adm-list" aria-label="운영자">
            <Link href="/admin" className="adm-item me-row">
              <span style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1 }}>
                <span style={{ fontSize: 15 }}>운영자 메뉴</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {overview
                    ? `이번 달 AI ${formatKrw(toKrw(overview.month_cost_usd, rate()))} · 오늘 한도 다 씀 ${overview.maxed.length}명`
                    : "AI 비용 · 사용 현황 · 한도 바꾸기"}
                </span>
              </span>
              <ChevronIcon size={18} />
            </Link>
          </nav>
        )}

        <div style={{ flexGrow: 1 }} />
        <form action="/auth/signout" method="post" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, paddingBottom: 12 }}>
          <button type="submit" className="text-link" style={{ fontSize: 14 }}>로그아웃</button>
          <span className="muted en" style={{ fontSize: 12 }}>{maskedEmail}</span>
        </form>
      </div>
      <BottomNav current="/me" />
    </main>
  );
}
