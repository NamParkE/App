import Link from "next/link";
import { notFound } from "next/navigation";
import AdminError from "@/components/AdminError";
import { BackIcon, ChevronIcon } from "@/components/Icons";
import { daysBetween, rate, requireOperator, type FamilyDetail } from "@/lib/admin";
import { todayKst } from "@/lib/data";
import { formatKrw, toKrw } from "@/lib/pricing";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function joinedLabel(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 가입`;
}

/** 가족 한 곳: 합계와 사람 목록 (숫자만) */
export default async function AdminFamilyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase } = await requireOperator();
  const { data, error } = await supabase.rpc("admin_family", { p_family: id });
  if (error) {
    console.error("[admin] family failed", error);
    return <AdminError back="/admin" />;
  }
  if (!data) notFound();
  const f = data as FamilyDetail;
  const krw = rate();
  const today = todayKst();
  const studiedToday = f.members.filter((m) => m.last_study_day === today).length;
  const usedToday = f.members.reduce((n, m) => n + m.used_today, 0);

  return (
    <main className="screen">
      <div className="pad" style={{ paddingBottom: 24 }}>
        <div className="topbar">
          <Link href="/admin" className="icon-btn" aria-label="운영자 홈으로">
            <BackIcon />
          </Link>
          <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{f.name}</h1>
            <span className="muted" style={{ fontSize: 12 }}>
              {f.owner_name ? `관리자 ${f.owner_name} · ` : ""}
              {joinedLabel(f.created_at)}
            </span>
          </div>
        </div>

        <div className="adm-grid3">
          <div className="adm-stat">
            <span className="k">이번 달 비용</span>
            <span className="v">{formatKrw(toKrw(f.month_cost_usd, krw))}</span>
          </div>
          <div className="adm-stat">
            <span className="k">오늘 학습</span>
            <span className="v">
              {studiedToday} / {f.members.length}명
            </span>
          </div>
          <div className="adm-stat">
            <span className="k">오늘 사용</span>
            <span className="v">{usedToday}회</span>
          </div>
        </div>

        <div className="row" style={{ alignItems: "center" }}>
          <h2 className="section-title" style={{ fontSize: 15 }}>사람</h2>
          <span className="muted" style={{ fontSize: 12 }}>오늘 많이 쓴 순</span>
        </div>

        <div className="adm-list">
          {f.members.map((m) => {
            const maxed = m.used_today >= m.daily_limit;
            const pct = m.daily_limit ? Math.min(100, Math.round((m.used_today / m.daily_limit) * 100)) : 100;
            const rest = m.last_study_day ? daysBetween(m.last_study_day, today) : null;
            const studied = rest === 0 ? "오늘 학습" : m.last_study_day ? `마지막 학습 ${Number(m.last_study_day.slice(5, 7))}월 ${Number(m.last_study_day.slice(8, 10))}일` : "아직 학습 안 함";
            return (
              <Link key={m.user_id} href={`/admin/member/${m.user_id}`} className="adm-item">
                <div className="top">
                  <span className="name">
                    {m.display_name}
                    {m.is_owner && <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}> · 관리자</span>}
                  </span>
                  {maxed && <span className="adm-pill warn">한도 다 씀</span>}
                  {!maxed && rest !== null && rest >= 2 && <span className="adm-pill">{rest}일째 쉼</span>}
                  <ChevronIcon size={18} />
                </div>
                <div className="adm-bar-row">
                  <div className="adm-track" style={{ height: 8 }}>
                    <div className={`adm-fill${maxed ? " warn" : ""}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="adm-num en" style={{ fontSize: 12 }}>
                    {m.used_today}/{m.daily_limit}
                  </span>
                </div>
                <span className="meta">
                  {m.level_label}
                  {m.streak > 0 ? ` · 연속 ${m.streak}일` : ""} · {studied} · 이번 달 {formatKrw(toKrw(m.month_cost_usd, krw))}
                </span>
              </Link>
            );
          })}
        </div>

        <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
          이름, 레벨, 학습한 날, 횟수, 비용만 보여요. 대화나 문장 내용은 운영자도 볼 수 없어요.
        </p>
      </div>
    </main>
  );
}
