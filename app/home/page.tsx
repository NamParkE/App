import Link from "next/link";
import { after } from "next/server";
import BottomNav from "@/components/BottomNav";
import TopicBrowser, { type TopicItem } from "./TopicBrowser";
import { ChevronIcon, PlayIcon } from "@/components/Icons";
import { checkProfile, fetchProfile, myStreak, requireUser, todayKst, usageToday } from "@/lib/data";
import { StreakChip } from "@/components/Flame";
import CallHome, { type CallTopic, type LessonRow } from "./CallHome";
import HomeModeSwitch, { ModeTabs } from "./ModeSwitch";
import HomeReppy from "./HomeReppy";
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

  const progress = progressFor(progressRows, profile.level);

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

  const memorizeView = (
    <main className="screen">
      <div className="pad">
        <div className="row" style={{ alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div className="muted" style={{ fontSize: 14 }}>{profile.display_name}님, 오늘도 한 주제씩</div>
            <h1 className="sr-only">오픽 암기형</h1>
            <ModeTabs badge={profile.level} />
          </div>
          <StreakChip streak={streak.streak} studiedToday={streak.studiedToday} />
        </div>

        <HomeReppy streak={streak.streak} studiedToday={streak.studiedToday} mode="memorize" />

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

  return <HomeModeSwitch userId={userId} initial={profile.style} memorize={memorizeView} call={callView} />;
}
