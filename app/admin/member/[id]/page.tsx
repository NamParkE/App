import Link from "next/link";
import { notFound } from "next/navigation";
import AdminError from "@/components/AdminError";
import { BackIcon } from "@/components/Icons";
import { rate, requireOperator, weekdayKo, type MemberDetail } from "@/lib/admin";
import { formatKrw, toKrw } from "@/lib/pricing";
import LimitForm from "./LimitForm";
import MockLimitForm from "./MockLimitForm";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function changedLabel(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** 한 사람: 한도 바꾸기, 최근 7일 사용, 이번 달 학습 · 비용 (숫자만) */
export default async function AdminMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase } = await requireOperator();
  const [{ data, error }, { data: mockData }] = await Promise.all([
    supabase.rpc("admin_member", { p_user: id }),
    supabase.rpc("admin_member_mock", { p_user: id }),
  ]);
  const mock = mockData as { mock_limit: number; used_month: number; exams: { finished_at: string; grade: string | null }[] } | null;
  if (error) {
    console.error("[admin] member failed", error);
    return <AdminError back="/admin" />;
  }
  if (!data) notFound();
  const m = data as MemberDetail;
  const krw = rate();
  const monthKrw = toKrw(m.month_cost_usd, krw);
  const wonPerUse = m.month_used > 0 && monthKrw > 0 ? monthKrw / m.month_used : null;
  const maxDays = m.days.filter((d) => d.used >= m.daily_limit && m.daily_limit > 0).length;
  const top = Math.max(1, m.daily_limit, ...m.days.map((d) => d.used));

  return (
    <main className="screen">
      <div className="pad" style={{ paddingBottom: 24 }}>
        <div className="topbar">
          <Link href={`/admin/family/${m.family_id}`} className="icon-btn" aria-label={`${m.family_name}로`}>
            <BackIcon />
          </Link>
          <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
              {m.display_name}
              {m.is_owner && <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}> · 관리자</span>}
            </h1>
            <span className="muted" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
              {m.family_name}
              {m.email ? ` · ${m.email}` : ""} · {m.level_label}
            </span>
          </div>
        </div>

        <LimitForm key={m.daily_limit} userId={m.user_id} initialLimit={m.daily_limit} usedToday={m.used_today} wonPerUse={wonPerUse} />
        {m.last_change && (
          <p className="muted" style={{ margin: "-8px 4px 0", fontSize: 12 }}>
            마지막 변경: {changedLabel(m.last_change.changed_at)} {m.last_change.old_limit}회 → {m.last_change.new_limit}회
          </p>
        )}

        {mock && (
          <MockLimitForm
            key={`mock-${mock.mock_limit}`}
            userId={m.user_id}
            initialLimit={mock.mock_limit}
            usedMonth={mock.used_month}
            grades={mock.exams.map((e) => e.grade)}
          />
        )}

        <section className="card">
          <div className="row">
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>최근 7일 사용</h2>
            <span className="muted" style={{ fontSize: 12 }}>한도 다 씀 {maxDays}일</span>
          </div>
          <div className="adm-cols" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }} role="list">
            {m.days.map((d, i) => {
              const isToday = i === m.days.length - 1;
              const maxed = m.daily_limit > 0 && d.used >= m.daily_limit;
              return (
                <div key={d.day} className="adm-col" role="listitem" aria-label={`${weekdayKo(d.day)}요일 ${d.used}회`}>
                  <div
                    className={`bar${maxed ? " warn" : d.used === 0 ? " empty" : ""}`}
                    style={{ height: `${Math.max(4, Math.round((d.used / top) * 64))}px` }}
                  />
                  <span className="d" style={isToday ? { color: "var(--ink)", fontWeight: 700 } : undefined}>
                    {isToday ? "오늘" : weekdayKo(d.day)}
                  </span>
                </div>
              );
            })}
          </div>
          <span className="muted" style={{ fontSize: 12 }}>주황 막대는 그날 한도를 다 쓴 날 (지금 한도 기준)</span>
        </section>

        <section className="card">
          <div className="row">
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>학습</h2>
            <span className="muted" style={{ fontSize: 12 }}>이번 달</span>
          </div>
          <div className="adm-grid3">
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{m.streak}일</span>
              <span className="muted" style={{ fontSize: 11 }}>연속 학습</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>
                {m.month_lessons}번 · {m.month_practices}회
              </span>
              <span className="muted" style={{ fontSize: 11 }}>수업 · 오픽 연습</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{formatKrw(monthKrw)}</span>
              <span className="muted" style={{ fontSize: 11 }}>AI 비용</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
