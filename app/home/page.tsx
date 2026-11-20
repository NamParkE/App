import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import TopicBrowser, { type TopicItem } from "./TopicBrowser";
import { ChevronIcon, PlayIcon } from "@/components/Icons";
import { checkProfile, fetchProfile, requireUser, usageToday } from "@/lib/data";
import { allProgress, progressFor, SENTENCE_COUNT } from "@/lib/progress";
import { CATEGORIES, one, type Category, type Topic } from "@/lib/types";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const { cat } = await searchParams;
  const category: Category = CATEGORIES.some((c) => c.id === cat) ? (cat as Category) : "survey";
  const { supabase, userId } = await requireUser();

  // 서로 기다릴 필요가 없는 조회를 한꺼번에 보낸다 (DB 왕복 1번)
  const [rawProfile, { data: topics }, progressRows, used, { data: last }] = await Promise.all([
    fetchProfile(supabase, userId),
    supabase.from("topics").select("*").order("sort").returns<Topic[]>(),
    allProgress(supabase, userId),
    usageToday(supabase, userId),
    supabase
      .from("attempts")
      .select("topic_id, sentences(position)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const profile = checkProfile(rawProfile);
  const progress = progressFor(progressRows, profile.level);

  const left = Math.max(0, profile.daily_limit - used);
  const leftPct = profile.daily_limit ? Math.round((left / profile.daily_limit) * 100) : 0;
  const lastTopic = last ? topics?.find((t) => t.id === last.topic_id) : undefined;
  const lastPos = one<{ position: number }>(last?.sentences)?.position;
  const lastTotal = lastTopic ? progress.get(lastTopic.id)?.total ?? SENTENCE_COUNT[profile.level] : 0;
  const items: TopicItem[] = (topics ?? []).map((t) => {
    const p = progress.get(t.id);
    return {
      id: t.id,
      category: t.category,
      title_ko: t.title_ko,
      title_en: t.title_en,
      done: p?.done ?? 0,
      total: p?.total ?? SENTENCE_COUNT[profile.level],
    };
  });

  return (
    <main className="screen">
      <div className="pad">
        <div className="row" style={{ alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div className="muted" style={{ fontSize: 14 }}>{profile.display_name}님, 오늘도 한 주제씩</div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>오픽 암기형</h1>
          </div>
          <Link
            href="/me"
            aria-label="내 정보"
            style={{
              height: 44,
              padding: "0 12px 0 4px",
              borderRadius: 999,
              border: "1px solid var(--line)",
              background: "var(--surface)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
            }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                background: "var(--accent-soft)",
                color: "var(--accent-ink)",
                fontWeight: 700,
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {profile.display_name.slice(0, 1)}
            </span>
            <span className="en" style={{ fontWeight: 700, fontSize: 14, color: "var(--accent)" }}>{profile.level}</span>
          </Link>
        </div>

        <section className="usage" aria-label="오늘 남은 연습">
          <div className="row">
            <div style={{ fontSize: 14, color: "var(--dark-muted)" }}>오늘 남은 연습</div>
            <div className="en" style={{ fontSize: 14, color: "var(--dark-muted)" }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: "#fff" }}>{left}</span> / {profile.daily_limit}회
            </div>
          </div>
          <div className="track">
            <div style={{ width: `${leftPct}%` }} />
          </div>
          <small>
            {left > 0 ? "자정에 다시 채워져요" : "오늘 AI 코치는 다 썼어요. 비교 결과는 계속 볼 수 있어요"}
          </small>
        </section>

        {lastTopic && lastPos !== undefined && (
          <Link href={`/topic/${lastTopic.id}`} className="card continue">
            <div className="play">
              <PlayIcon />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1 }}>
              <div className="muted" style={{ fontSize: 13 }}>이어서 하기</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {lastTopic.title_ko} · 문장 {lastPos + 1} / {lastTotal}
              </div>
            </div>
            <ChevronIcon />
          </Link>
        )}

        <TopicBrowser items={items} initialCat={category} />
      </div>
      <BottomNav current="/home" />
    </main>
  );
}
