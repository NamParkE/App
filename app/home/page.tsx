import Link from "next/link";
import { after } from "next/server";
import BottomNav from "@/components/BottomNav";
import TopicBrowser, { type TopicItem } from "./TopicBrowser";
import { ListIcon, MicIcon } from "@/components/Icons";
import { checkProfile, fetchProfile, myStreak, requireUser, todayKst, usageToday } from "@/lib/data";
import { StreakChip } from "@/components/Flame";
import CallHome, { type CallTopic, type LessonRow } from "./CallHome";
import HomeModeSwitch, { ModeTabs } from "./ModeSwitch";
import { allProgress, progressFor, SENTENCE_COUNT } from "@/lib/progress";
import { CATEGORIES, one, type Category, type Topic } from "@/lib/types";
import { closeStale, splitActive, type ActiveLessonRow } from "@/lib/call/server";
import { adminClient } from "@/lib/supabase/admin";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const { cat } = await searchParams;
  const category: Category = CATEGORIES.some((c) => c.id === cat) ? (cat as Category) : "survey";
  const { supabase, userId } = await requireUser();

  // 서로 기다릴 필요가 없는 조회를 한꺼번에 보낸다 (DB 왕복 1번).
  // 학습 스타일을 몰라도 되도록 두 모드에 필요한 조회를 모두 함께 보낸다 (작은 조회라 동시에 보내는 편이 빠르다).
  const [rawProfile, { data: topics }, progressRows, used, { data: last }, streak, { data: callTopics }, { data: lessons }, { count: dueCount }, { data: active }] =
    await Promise.all([
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
      myStreak(supabase),
      supabase.from("call_topics").select("id, level_min, level_max, title_ko, title_en, sort").order("sort").returns<CallTopic[]>(),
      supabase
        .from("lessons")
        .select("id, topic_id, level, status, score, started_at")
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .limit(40)
        .returns<LessonRow[]>(),
      supabase
        .from("expressions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .lte("next_review_on", todayKst()),
      supabase
        .from("lessons")
        .select("id, topic_id, turns, started_at, last_active_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .returns<ActiveLessonRow[]>(),
    ]);
  // 끊긴 통화: 30분 안이면 이어하기 카드, 지난 것은 응답 뒤에 닫는다 (대답 0번이면 환불)
  const { resumable, stale } = splitActive(active ?? []);
  if (stale.length) {
    const admin = adminClient();
    if (admin) after(() => closeStale(supabase, admin, stale));
  }
  const profile = checkProfile(rawProfile);
  const left = Math.max(0, profile.daily_limit - used);

  const progress = progressFor(progressRows, profile.level, profile.opic_source);

  const lastTopic = last ? topics?.find((t) => t.id === last.topic_id) : undefined;
  const lastPos = one<{ position: number }>(last?.sentences)?.position;
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

  const callView = (
    <CallHome
      profile={profile}
      streak={streak}
      topics={callTopics ?? []}
      lessons={lessons ?? []}
      dueCount={dueCount ?? 0}
      usageLeft={left}
      resumable={resumable}
    />
  );

  // "오늘 할 것": 마지막으로 연습한 주제에 외우지 않은 문장이 있으면 그 주제, 아니면 지금 분류에서 처음으로 다 못 외운 주제
  const lastItem = lastTopic ? items.find((t) => t.id === lastTopic.id) : undefined;
  const continuing = !!lastItem && lastItem.done < lastItem.total && progress.has(lastItem.id);
  const todayItem = continuing
    ? lastItem
    : items.find((t) => t.category === category && t.done < t.total) ?? items.find((t) => t.done < t.total);
  const todayHas = todayItem ? (progress.get(todayItem.id)?.total ?? 0) > 0 : false;
  const catLabel = (c: Category) => CATEGORIES.find((x) => x.id === c)?.label ?? "";

  const memorizeView = (
    <main className="screen">
      <div className="pad">
        <ModeTabs />
        <div className="row" style={{ alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div className="muted" style={{ fontSize: 13 }}>{profile.display_name}님, 오늘도 한 주제씩</div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
              오늘의 연습 <span className="en" style={{ fontSize: 14, color: "var(--accent)" }}>{profile.level}</span>
            </h1>
          </div>
          <StreakChip streak={streak.streak} studiedToday={streak.studiedToday} />
        </div>

        {todayItem ? (
          <section className="hero-card" aria-label="오늘 할 것">
            <span className="sub">
              {continuing ? "이어서 하기" : todayHas ? "다음 주제" : "새 주제"} · {catLabel(todayItem.category)}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{todayItem.title_ko}</span>
              <span className="sub" style={{ fontSize: 14 }}>
                {todayHas
                  ? `${todayItem.total}문장 중 ${todayItem.done}문장 외움${continuing && lastPos !== undefined ? ` · 다음은 문장 ${Math.min(lastPos + 2, todayItem.total)}` : ""}`
                  : "답변을 준비하고 연습을 시작해요"}
              </span>
            </div>
            {todayHas && (
              <div className="hero-track">
                <div style={{ width: `${Math.round((todayItem.done / Math.max(1, todayItem.total)) * 100)}%` }} />
              </div>
            )}
            <Link href={todayHas ? `/practice/${todayItem.id}` : `/topic/${todayItem.id}`} className="btn btn-primary">
              <MicIcon size={20} color="#FFFFFF" />
              {continuing ? "이어서 연습" : "연습 시작"}
            </Link>
            <a href="#topics" className="btn hero-outline">
              <ListIcon size={18} color="#FFFFFF" />
              다른 주제 고르기
            </a>
            <span className="sub" style={{ fontSize: 12, textAlign: "center" }}>
              {left > 0 ? `오늘 연습 ${left}회 남음 · 자정에 다시 채워져요` : "오늘 AI 코치는 다 썼어요. 비교 결과는 계속 볼 수 있어요"}
            </span>
          </section>
        ) : (
          <section className="hero-card" aria-label="오늘 할 것">
            <span style={{ fontSize: 20, fontWeight: 700 }}>모든 주제를 외웠어요!</span>
            <span className="sub">아래 목록에서 다시 복습할 주제를 골라 보세요.</span>
          </section>
        )}

        <TopicBrowser items={items} initialCat={category} />
      </div>
      <BottomNav current="/home" />
    </main>
  );

  return <HomeModeSwitch userId={userId} initial={profile.style} memorize={memorizeView} call={callView} />;
}
