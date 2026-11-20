import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { StreakChip } from "@/components/Flame";
import { ChevronIcon, PhoneIcon, ReplayIcon } from "@/components/Icons";
import { callLevel, LESSON_USAGE_COST, LEVEL_UP_COUNT, LEVEL_UP_SCORE } from "@/lib/call/levels";
import type { Profile } from "@/lib/types";
import TopicPicker from "./TopicPicker";
import { ModeTabs } from "./ModeSwitch";
import HomeReppy from "./HomeReppy";

export interface CallTopic {
  id: string;
  level_min: number;
  level_max: number;
  title_ko: string;
  title_en: string;
  sort: number;
}

export interface LessonRow {
  id: string;
  topic_id: string;
  level: number;
  status: "active" | "done" | "left";
  score: number | null;
  started_at: string;
}

function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? "오늘" : days === 1 ? "어제" : `${days}일 전`;
}

/** 전화영어 홈. 데이터는 홈 페이지가 한 번에 받아 넘긴다 (추가 조회 없음). */
export default function CallHome({
  profile,
  streak,
  topics,
  lessons,
  dueCount,
  usageLeft,
}: {
  profile: Profile;
  streak: { streak: number; studiedToday: boolean };
  topics: CallTopic[];
  lessons: LessonRow[];
  dueCount: number;
  usageLeft: number;
}) {
  const level = profile.call_level;
  const L = callLevel(level);
  const forLevel = topics.filter((t) => level >= t.level_min && level <= t.level_max);

  // 다음 주제: 서버(/api/call/start)와 같은 규칙. 안 한 주제를 순서대로, 다 했으면 가장 오래전에 한 것
  const lastDone = new Map<string, string>();
  for (const l of lessons) if (!lastDone.has(l.topic_id)) lastDone.set(l.topic_id, l.started_at);
  const next =
    forLevel.find((t) => !lastDone.has(t.id)) ??
    [...forLevel].sort((a, b) => (lastDone.get(a.id) ?? "").localeCompare(lastDone.get(b.id) ?? ""))[0];

  const since = new Date(profile.call_level_since).getTime();
  const good = Math.min(
    lessons.filter((l) => l.status === "done" && l.level === level && (l.score ?? 0) >= LEVEL_UP_SCORE && new Date(l.started_at).getTime() >= since).length,
    LEVEL_UP_COUNT,
  );
  const recent = lessons.filter((l) => l.status === "done").slice(0, 3);
  const titleOf = new Map(topics.map((t) => [t.id, t.title_ko]));
  const canStart = usageLeft >= LESSON_USAGE_COST;

  return (
    <main className="screen">
      <div className="pad">
        <div className="row" style={{ alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div className="muted" style={{ fontSize: 14 }}>{profile.display_name}님, 오늘도 한 통화</div>
            <h1 className="sr-only">전화영어</h1>
            <ModeTabs badge={`Lv.${level}`} />
          </div>
          <StreakChip streak={streak.streak} studiedToday={streak.studiedToday} />
        </div>

        <HomeReppy streak={streak.streak} studiedToday={streak.studiedToday} mode="vocab" />

        <section className="card" aria-label="내 레벨">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="level-tag en">Lv.{level}</span>
            <div style={{ fontSize: 16, fontWeight: 700, flexGrow: 1 }}>
              {L.name} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>{L.band}</span>
            </div>
            <Link href="/setup" className="chip">바꾸기</Link>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="segments light" role="img" aria-label={`${LEVEL_UP_SCORE}점 이상 수업 ${good}/${LEVEL_UP_COUNT}`}>
              {Array.from({ length: LEVEL_UP_COUNT }, (_, i) => (
                <div key={i} className={i < good ? "on" : undefined} />
              ))}
            </div>
            <div className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
              {LEVEL_UP_SCORE}점 이상 <b className="en" style={{ color: "var(--ink)" }}>{good}/{LEVEL_UP_COUNT}</b>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {level >= 8
              ? "최고 레벨이에요. 원어민처럼 대화해 봐요!"
              : good >= LEVEL_UP_COUNT
                ? `Lv.${level + 1} 도전을 권해요. 위의 바꾸기에서 올릴 수 있어요.`
                : `${LEVEL_UP_COUNT - good}번 더 ${LEVEL_UP_SCORE}점을 넘으면 Lv.${level + 1} 도전을 권해 드려요`}
          </div>
        </section>

        {next && (
          <section className="usage" aria-label="오늘의 수업">
            <div className="row" style={{ alignItems: "center" }}>
              <div style={{ fontSize: 13, color: "var(--dark-muted)" }}>오늘의 수업 · 약 10분</div>
              <TopicPicker topics={forLevel.map((t) => ({ id: t.id, title_ko: t.title_ko, title_en: t.title_en, done: lastDone.has(t.id) }))} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{next.title_ko}</div>
            <div className="en" style={{ fontSize: 13, color: "var(--dark-muted)" }}>{next.title_en}</div>
            {canStart ? (
              <Link href={`/call?topic=${next.id}`} className="btn btn-primary" style={{ height: 52 }}>
                <PhoneIcon color="#FFFFFF" />
                수업 시작 <span style={{ fontWeight: 500, fontSize: 13 }}>(사용량 {LESSON_USAGE_COST}회)</span>
              </Link>
            ) : (
              <div style={{ fontSize: 14, color: "var(--dark-muted)" }}>
                오늘 남은 연습이 {usageLeft}회예요. 수업은 {LESSON_USAGE_COST}회가 필요해서 내일 다시 할 수 있어요.
              </div>
            )}
          </section>
        )}

        <Link href="/phrasebook" className="card continue">
          <div className="play" style={{ background: "var(--accent-soft)" }}>
            <ReplayIcon size={20} color="var(--accent-ink)" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{dueCount > 0 ? `복습할 표현 ${dueCount}개` : "표현장"}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {dueCount > 0 ? "수업 시작 전에도 자동으로 복습해요" : "수업에서 배운 표현이 모여요"}
            </div>
          </div>
          <ChevronIcon />
        </Link>

        {recent.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }} aria-label="최근 수업">
            <h2 className="section-title" style={{ fontSize: 15 }}>최근 수업</h2>
            {recent.map((l) => (
              <div key={l.id} className="row" style={{ fontSize: 14 }}>
                <span>
                  {titleOf.get(l.topic_id) ?? l.topic_id} <span className="muted" style={{ fontSize: 12 }}>{ago(l.started_at)} · Lv.{l.level}</span>
                </span>
                <b className="en">{l.score}점</b>
              </div>
            ))}
          </section>
        )}
      </div>
      <BottomNav current="/home" />
    </main>
  );
}
