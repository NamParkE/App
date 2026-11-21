import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { StreakChip } from "@/components/Flame";
import { ChevronIcon } from "@/components/Icons";
import { LESSON_USAGE_COST, LEVEL_UP_COUNT, LEVEL_UP_SCORE, RESUME_MINUTES } from "@/lib/call/levels";
import type { ActiveLessonRow } from "@/lib/call/rules";
import type { Profile } from "@/lib/types";
import TodayLesson from "./TopicPicker";
import { ModeTabs } from "./ModeSwitch";
import ResumeCard from "./ResumeCard";

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
  resumable,
}: {
  profile: Profile;
  streak: { streak: number; studiedToday: boolean };
  topics: CallTopic[];
  lessons: LessonRow[];
  dueCount: number;
  usageLeft: number;
  /** 30분 안에 끊긴 통화 */
  resumable: ActiveLessonRow | null;
}) {
  const level = profile.call_level;
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
  const minutesAgo = resumable ? Math.floor((Date.now() - new Date(resumable.last_active_at).getTime()) / 60000) : 0;

  return (
    <main className="screen">
      <div className="pad">
        <ModeTabs />
        <div className="row" style={{ alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div className="muted" style={{ fontSize: 13 }}>{profile.display_name}님, 오늘도 한 통화</div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
              오늘의 통화 <span className="en" style={{ fontSize: 14, color: "var(--accent)" }}>Lv.{level}</span>
            </h1>
          </div>
          <StreakChip streak={streak.streak} studiedToday={streak.studiedToday} />
        </div>

        {/* 끊긴 통화가 있으면 그 자리에 "이어서 통화"가 대신 나온다 (큰 버튼은 하나) */}
        {resumable ? (
          <ResumeCard
            lessonId={resumable.id}
            title={titleOf.get(resumable.topic_id) ?? resumable.topic_id}
            turns={resumable.turns}
            minutesAgo={minutesAgo}
            minutesLeft={Math.max(1, RESUME_MINUTES - minutesAgo)}
          />
        ) : (
          next && (
            <TodayLesson
              topics={forLevel.map((t) => ({ id: t.id, title_ko: t.title_ko, title_en: t.title_en, done: lastDone.has(t.id) }))}
              initialId={next.id}
              canStart={canStart}
              cost={LESSON_USAGE_COST}
              usageNote={
                canStart
                  ? `오늘 ${usageLeft}회 남음`
                  : `오늘 남은 연습이 ${usageLeft}회예요. 수업은 ${LESSON_USAGE_COST}회가 필요해서 내일 다시 할 수 있어요.`
              }
            />
          )
        )}

        <section aria-label="내 레벨" className="level-line">
          <span className="muted" style={{ fontSize: 13, flexGrow: 1 }}>
            {level >= 8 ? (
              "최고 레벨이에요. 원어민처럼 대화해 봐요!"
            ) : good >= LEVEL_UP_COUNT ? (
              <>
                <b style={{ color: "var(--ink)" }}>Lv.{level + 1} 도전</b>을 권해요 ·{" "}
                <Link href="/setup" style={{ color: "var(--accent-ink)" }}>레벨 바꾸기</Link>
              </>
            ) : (
              <>
                Lv.{level + 1}까지 <b style={{ color: "var(--ink)" }}>{LEVEL_UP_SCORE}점 이상 {LEVEL_UP_COUNT - good}번 더</b>
              </>
            )}
          </span>
          <span className="level-dots" role="img" aria-label={`${LEVEL_UP_SCORE}점 이상 수업 ${good}/${LEVEL_UP_COUNT}`}>
            {Array.from({ length: LEVEL_UP_COUNT }, (_, i) => (
              <span key={i} className={i < good ? "on" : undefined} />
            ))}
          </span>
        </section>

        <div className="adm-list">
          <Link href="/phrasebook" className="adm-item" style={{ flexDirection: "row", alignItems: "center" }}>
            <span style={{ flexGrow: 1, fontSize: 15 }}>
              {dueCount > 0 ? (
                <>
                  복습할 표현 <b>{dueCount}개</b>
                </>
              ) : (
                "표현장"
              )}
            </span>
            <ChevronIcon size={18} />
          </Link>
          {recent.map((l) => (
            <div key={l.id} className="adm-item" style={{ flexDirection: "row", alignItems: "center", fontSize: 14 }}>
              <span style={{ flexGrow: 1 }}>
                {titleOf.get(l.topic_id) ?? l.topic_id} <span className="muted" style={{ fontSize: 12 }}>{ago(l.started_at)} · Lv.{l.level}</span>
              </span>
              <b className="en">{l.score}점</b>
            </div>
          ))}
        </div>
      </div>
      <BottomNav current="/home" />
    </main>
  );
}
