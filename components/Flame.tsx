// 연속 학습일 불꽃. 설계 §4: 0 회색 · 1~6 주황 · 7~13 큰 주황 · 14~29 파랑 · 30+ 보라

export function flameColor(streak: number) {
  if (streak <= 0) return "#9AA1AD";
  if (streak >= 30) return "#7C5CE6";
  if (streak >= 14) return "#3D6BF0";
  return "#E8772E";
}

export function flameBadge(streak: number) {
  if (streak >= 30) return "한 달";
  if (streak >= 14) return "2주";
  if (streak >= 7) return "1주";
  return null;
}

export default function Flame({ streak, size = 24 }: { streak: number; size?: number }) {
  const s = streak >= 7 ? size * 1.15 : streak >= 3 ? size : size * 0.9;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true" className={streak > 0 ? "flame-live" : undefined}>
      <path
        d="M12 2s5.5 4.6 5.5 10.3A5.5 5.5 0 0 1 6.5 12.3c0-2.7 1.6-4.4 2.7-5.4.2 2 1.1 3.2 2.4 3.6C11 7.6 12 2 12 2z"
        fill={flameColor(streak)}
      />
      {streak > 0 && (
        <path
          d="M12 13s2.2 1.6 2.2 3.6a2.2 2.2 0 0 1-4.4 0c0-1.2.8-2 1.3-2.4.1.8.5 1.2 1 1.3-.2-1-.1-2.5-.1-2.5z"
          fill="#FFF1D6"
        />
      )}
    </svg>
  );
}

/** 홈·리포트 위쪽의 "🔥 5일" 칩 */
export function StreakChip({ streak, studiedToday }: { streak: number; studiedToday: boolean }) {
  const label = studiedToday
    ? `연속 학습 ${streak}일`
    : streak > 0
      ? `연속 학습 ${streak}일, 오늘 학습하면 ${streak + 1}일`
      : "오늘 학습하면 연속 학습 1일";
  return (
    <span className="streak-chip" role="img" aria-label={label} title={label}>
      <Flame streak={streak} size={22} />
      <b className="en">{streak}</b>
      <span>일</span>
      {!studiedToday && <span className="streak-todo">오늘 아직</span>}
    </span>
  );
}
