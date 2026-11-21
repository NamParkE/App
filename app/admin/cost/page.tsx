import Link from "next/link";
import AdminError from "@/components/AdminError";
import { BackIcon } from "@/components/Icons";
import { daysInMonth, parseMonth, rate, requireOperator, shiftMonth, type CostDetail } from "@/lib/admin";
import { todayKst } from "@/lib/data";
import { AI_KIND_LABEL, formatKrw, formatUsd, toKrw, type AiKind } from "@/lib/pricing";

function monthLabel(monthStart: string) {
  return `${monthStart.slice(0, 4)}년 ${Number(monthStart.slice(5, 7))}월`;
}

function shortDate(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** AI 비용 상세: 달마다 하루별 · 기능별 · 가족별 · 모델별 */
export default async function AdminCostPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const today = todayKst();
  const thisMonth = `${today.slice(0, 7)}-01`;
  const asked = parseMonth(m);
  const month = asked && asked <= thisMonth ? asked : thisMonth;
  const isThisMonth = month === thisMonth;

  const { supabase } = await requireOperator();
  const { data, error } = await supabase.rpc("admin_cost", { p_month: month });
  if (error || !data) {
    console.error("[admin] cost failed", error);
    return <AdminError back="/admin" />;
  }
  const c = data as CostDetail;
  const krw = rate();
  const total = toKrw(c.total_usd, krw);

  // 하루별 막대: 이번 달은 오늘까지, 지난달은 그 달 끝까지
  const lastDay = isThisMonth ? Number(today.slice(8, 10)) : daysInMonth(month);
  const byDay = new Map(c.days.map((d) => [Number(d.day.slice(8, 10)), d.usd]));
  const bars = Array.from({ length: lastDay }, (_, i) => ({ day: i + 1, usd: byDay.get(i + 1) ?? 0 }));
  const peak = bars.reduce((a, b) => (b.usd > a.usd ? b : a), { day: 0, usd: 0 });
  const avg = lastDay ? total / lastDay : 0;
  const topKind = Math.max(1e-9, ...c.kinds.map((k) => k.usd));

  return (
    <main className="screen">
      <div className="pad" style={{ paddingBottom: 24 }}>
        <div className="topbar">
          <Link href="/admin" className="icon-btn" aria-label="운영자 홈으로">
            <BackIcon />
          </Link>
          <h1 style={{ fontSize: 20 }}>AI 비용</h1>
          <nav className="adm-month" aria-label="달 고르기">
            <Link href={`/admin/cost?m=${shiftMonth(month, -1)}`} aria-label="이전 달">‹</Link>
            <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{monthLabel(month)}</span>
            {isThisMonth ? (
              <span className="off" aria-hidden="true">›</span>
            ) : (
              <Link href={`/admin/cost?m=${shiftMonth(month, 1)}`} aria-label="다음 달">›</Link>
            )}
          </nav>
        </div>

        <section className="card">
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 26, fontWeight: 700 }}>{formatKrw(total)}</span>
            <span className="muted" style={{ fontSize: 13 }}>
              {formatUsd(c.total_usd)} · AI 호출 {c.calls.toLocaleString("ko-KR")}번
            </span>
          </div>
          {bars.length > 0 && (
            <div
              className="adm-cols"
              style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`, gap: 2, height: 70 }}
              role="img"
              aria-label={`하루별 비용. 가장 많은 날 ${peak.day}일 ${formatKrw(toKrw(peak.usd, krw))}`}
            >
              {bars.map((b) => (
                <div key={b.day} className="adm-col">
                  <div
                    className={`bar${b.usd === 0 ? " empty" : isThisMonth && b.day === lastDay ? "" : " soft"}`}
                    style={{ height: `${Math.max(3, Math.round((b.usd / Math.max(peak.usd, 1e-9)) * 70))}px` }}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="row muted" style={{ fontSize: 11 }}>
            <span>1일</span>
            <span>
              하루 평균 {formatKrw(avg)}
              {peak.usd > 0 && ` · 가장 많은 날 ${peak.day}일 ${formatKrw(toKrw(peak.usd, krw))}`}
            </span>
            <span>{isThisMonth ? "오늘" : `${lastDay}일`}</span>
          </div>
        </section>

        <section className="card">
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>기능별</h2>
          {c.kinds.length === 0 && <span className="muted" style={{ fontSize: 13 }}>이 달에는 기록이 없어요.</span>}
          {c.kinds.map((k) => (
            <div key={k.kind} className="adm-bar-row">
              <span className="lbl">{AI_KIND_LABEL[k.kind as AiKind] ?? k.kind}</span>
              <div className="adm-track" style={{ height: 8 }}>
                <div className="adm-fill" style={{ width: `${Math.round((k.usd / topKind) * 100)}%` }} />
              </div>
              <span className="adm-num">{formatKrw(toKrw(k.usd, krw))}</span>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="row">
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>가족별</h2>
            <span className="muted en" style={{ fontSize: 12, overflowWrap: "anywhere", textAlign: "right" }}>
              {c.models.map((x) => x.model).join(", ")}
            </span>
          </div>
          {c.families.length === 0 && <span className="muted" style={{ fontSize: 13 }}>이 달에는 기록이 없어요.</span>}
          {c.families.map((f) => (
            <div key={f.id ?? "none"} className="row" style={{ fontSize: 13 }}>
              {f.id ? (
                <Link href={`/admin/family/${f.id}`} style={{ color: "var(--ink)" }}>
                  {f.name} ({f.members}명)
                </Link>
              ) : (
                <span>{f.name}</span>
              )}
              <span style={{ fontWeight: 700 }}>{formatKrw(toKrw(f.usd, krw))}</span>
            </div>
          ))}
        </section>

        <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
          토큰 수에 모델 가격을 곱한 추정치이고, 1달러를 {krw.toLocaleString("ko-KR")}원으로 계산해요.
          {c.first_call_at ? ` 기록을 시작한 ${shortDate(c.first_call_at)} 전의 비용과` : " 기록을 시작하기 전의 비용과"} 정확한 청구액은 Anthropic 콘솔에서 확인하세요.
        </p>
      </div>
    </main>
  );
}
