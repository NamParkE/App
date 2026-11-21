import Link from "next/link";
import AdminError from "@/components/AdminError";
import BottomNav from "@/components/BottomNav";
import { BackIcon, ChevronIcon } from "@/components/Icons";
import { dayLabel, daysInMonth, rate, requireOperator, type Overview } from "@/lib/admin";
import { formatKrw, formatUsd, MONTHLY_BUDGET_KRW, projectMonth, toKrw } from "@/lib/pricing";

/** 운영자 홈: 맨 위 숫자 4개와 가족 목록 */
export default async function AdminPage() {
  const { supabase } = await requireOperator();
  const { data, error } = await supabase.rpc("admin_overview");
  if (error || !data) {
    console.error("[admin] overview failed", error);
    return <AdminError />;
  }
  const o = data as Overview;
  const krw = rate();
  const spent = toKrw(o.month_cost_usd, krw);
  const today = Number(o.today.slice(8, 10));
  const projected = projectMonth(spent, today, daysInMonth(o.today));
  const budgetPct = Math.min(100, Math.round((spent / MONTHLY_BUDGET_KRW) * 100));
  const maxModes = Math.max(1, o.week_practices, o.week_lessons * 10);
  const members = o.families.reduce((n, f) => n + f.members, 0);

  return (
    <main className="screen">
      <div className="pad">
        <div className="topbar">
          <Link href="/me" className="icon-btn" aria-label="내 정보로">
            <BackIcon />
          </Link>
          <h1 style={{ fontSize: 22 }}>운영자 메뉴</h1>
          <span className="muted" style={{ fontSize: 12 }}>{dayLabel(o.today)} 기준</span>
        </div>

        <Link href="/admin/cost" className="adm-hero">
          <div className="row" style={{ alignItems: "center" }}>
            <span className="sub">이번 달 AI 비용</span>
            <span className="sub">자세히 ›</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 30, fontWeight: 700 }}>{formatKrw(spent)}</span>
            <span className="sub">/ 목표 {formatKrw(MONTHLY_BUDGET_KRW)}</span>
          </div>
          <div className="adm-track" role="img" aria-label={`목표의 ${budgetPct}% 사용`}>
            <div className={`adm-fill${budgetPct >= 100 ? " warn" : ""}`} style={{ width: `${budgetPct}%` }} />
          </div>
          <div className="sub" style={{ fontSize: 12 }}>
            {budgetPct}% 사용 · 이 속도면 월말 약 {formatKrw(Math.round(projected / 100) * 100)} · {formatUsd(o.month_cost_usd)} (
            {krw.toLocaleString("ko-KR")}원/$)
          </div>
        </Link>

        <div className="adm-grid2">
          <div className="adm-stat">
            <span className="k">학습한 사람</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span className="v">{o.studied_today}</span>
              <span className="muted" style={{ fontSize: 13 }}>명 오늘</span>
            </div>
            <span className="s">이번 주 {o.studied_week}명 / 전체 {o.total_users}명</span>
          </div>
          <div className={`adm-stat${o.maxed.length ? " warn" : ""}`}>
            <span className="k">오늘 한도 다 씀</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span className="v">{o.maxed.length}</span>
              <span style={{ fontSize: 13 }}>명</span>
            </div>
            <span className="s">
              {o.maxed.length
                ? o.maxed.slice(0, 3).map((m, i) => (
                    <span key={m.user_id}>
                      {i > 0 && ", "}
                      <Link href={`/admin/member/${m.user_id}`} style={{ color: "inherit" }}>
                        {m.display_name} {m.used}/{m.daily_limit}
                      </Link>
                    </span>
                  ))
                : "아직 없어요"}
              {o.maxed.length > 3 && ` 외 ${o.maxed.length - 3}명`}
            </span>
          </div>
        </div>

        <section className="card">
          <div className="row">
            <span style={{ fontSize: 14, fontWeight: 700 }}>모드별 사용량</span>
            <span className="muted" style={{ fontSize: 12 }}>이번 주</span>
          </div>
          <div className="adm-bar-row">
            <span className="lbl">오픽 연습</span>
            <div className="adm-track">
              <div className="adm-fill" style={{ width: `${Math.round((o.week_practices / maxModes) * 100)}%` }} />
            </div>
            <span className="adm-num">{o.week_practices}회</span>
          </div>
          <div className="adm-bar-row">
            <span className="lbl">전화영어</span>
            <div className="adm-track">
              <div className="adm-fill warn" style={{ width: `${Math.round(((o.week_lessons * 10) / maxModes) * 100)}%` }} />
            </div>
            <span className="adm-num">{o.week_lessons}번</span>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>오픽은 문장 연습 횟수, 전화영어는 끝낸 수업 수 (막대는 수업 1번 = 연습 10회로 맞췄어요)</span>
        </section>

        <div className="row" style={{ alignItems: "center" }}>
          <h2 className="section-title" style={{ fontSize: 15 }}>가족</h2>
          <span className="muted" style={{ fontSize: 12 }}>{o.families.length}가족 · {members}명</span>
        </div>
        {o.families.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>아직 가족이 없어요.</p>
        ) : (
          <div className="adm-list">
            {o.families.map((f) => (
              <Link key={f.id} href={`/admin/family/${f.id}`} className="adm-item">
                <div className="top">
                  <span className="name">{f.name}</span>
                  <ChevronIcon size={18} />
                </div>
                <span className="meta">
                  {f.members}명 · 오늘 {f.studied_today}명 학습 · 이번 달 {formatKrw(toKrw(f.month_cost_usd, krw))}
                </span>
              </Link>
            ))}
          </div>
        )}
        <div style={{ height: 8 }} />
      </div>
      <BottomNav current="/me" />
    </main>
  );
}
