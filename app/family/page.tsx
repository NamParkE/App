import BottomNav from "@/components/BottomNav";
import Flame from "@/components/Flame";
import Reppy from "@/components/Reppy";
import { requireProfile } from "@/lib/data";

interface BoardRow {
  user_id: string;
  display_name: string;
  style: "memorize" | "vocab";
  level_label: string;
  streak: number;
  points: number;
  last_week_points: number;
  days: boolean[];
}

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

function weekRange() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const dow = (kst.getUTCDay() + 6) % 7; // 월=0
  const mon = new Date(kst);
  mon.setUTCDate(kst.getUTCDate() - dow);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const f = (d: Date) => `${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
  return { label: `${f(mon)} – ${f(sun)}`, todayIdx: dow };
}

/** 가족 이번 주 순위. DB 함수 한 번으로 가족 전체의 집계를 받는다. */
export default async function FamilyPage() {
  const { supabase, userId, profile } = await requireProfile();
  const [{ data: board }, { data: family }] = await Promise.all([
    supabase.rpc("family_board"),
    supabase.from("families").select("name, invite_code").maybeSingle<{ name: string; invite_code: string }>(),
  ]);
  const rows = (board ?? []) as BoardRow[];
  const { label, todayIdx } = weekRange();
  const lastWeekTop = Math.max(0, ...rows.map((r) => r.last_week_points));

  return (
    <main className="screen">
      <div className="pad">
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div className="muted" style={{ fontSize: 14 }}>
            {family?.name ?? `${profile.display_name}님 가족`} · 이번 주 <span className="en">{label}</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>누가 제일 많이 했을까?</h1>
        </div>

        {rows.length <= 1 && (
          <section className="card" style={{ alignItems: "center", textAlign: "center", gap: 8 }}>
            <Reppy mood="idle" size={120} decorative />
            <div style={{ fontSize: 17, fontWeight: 700 }}>같이 할 가족이 아직 없어요</div>
            <div className="muted" style={{ fontSize: 14, lineHeight: 1.55 }}>
              초대 코드를 가족에게 알려 주면 여기서 함께 순위를 볼 수 있어요.
            </div>
            {family?.invite_code && (
              <div className="row" style={{ gap: 10, background: "var(--bg)", borderRadius: 14, padding: "10px 14px", marginTop: 4 }}>
                <span className="muted" style={{ fontSize: 13 }}>초대 코드</span>
                <b className="en" style={{ fontSize: 20, letterSpacing: 3 }}>{family.invite_code}</b>
              </div>
            )}
          </section>
        )}

        <ol className="board" aria-label="이번 주 학습 순위">
          {rows.map((r, i) => {
            const me = r.user_id === userId;
            const top = lastWeekTop > 0 && r.last_week_points === lastWeekTop;
            return (
              <li key={r.user_id} className={`board-row${me ? " me" : ""}`}>
                <div className="board-main">
                  <span className={`rank en${i === 0 && r.points > 0 ? " first" : ""}`}>{i + 1}</span>
                  <span className="avatar small" aria-hidden="true">{r.display_name.slice(0, 1)}</span>
                  <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>
                      {r.display_name}
                      {me && <span style={{ color: "var(--accent)", fontSize: 12, fontWeight: 500 }}> · 나</span>}
                      {top && <span className="top-badge">지난주 1등</span>}
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {r.style === "vocab" ? "전화영어" : "오픽 암기형"} · {r.level_label}
                    </span>
                  </div>
                  <span className="board-streak" role="img" aria-label={`연속 학습 ${r.streak}일`}>
                    <Flame streak={r.streak} size={18} />
                    <b className="en">{r.streak}</b>
                  </span>
                  <span className="board-points en">
                    {r.points}
                    <small>점</small>
                  </span>
                </div>
                <div className="week-dots" role="img" aria-label={`이번 주 학습한 날 ${r.days.filter(Boolean).length}일`}>
                  {DAY_LABELS.map((d, j) => (
                    <span key={d} className={r.days[j] ? "on" : j > todayIdx ? "future" : undefined}>
                      <i />
                      {d}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>

        <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>
          점수: 전화영어 수업 10 · 문장 외움 3 · 오픽 문장 연습 1 · 표현 복습 1
          <br />
          하루 학습 인정: 수업 1회 또는 문장 연습 3회. 점수와 학습한 날만 보이고, 대화 내용은 본인만 봐요.
        </p>
      </div>
      <BottomNav current="/family" />
    </main>
  );
}
