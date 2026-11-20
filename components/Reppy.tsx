import { useId } from "react";

// 앱 마스코트: 앵무새 리피 (Reppy, "repeat"에서 온 이름).
// 그림 파일 없이 SVG 로 그려 가볍고, 표정마다 CSS 애니메이션이 붙는다 (globals.css 의 .reppy-*).
// 나중에 일러스트레이터 그림으로 바꿀 때도 이 부품의 mood/size 약속은 그대로 두면 된다.

export type ReppyMood = "idle" | "happy" | "talk" | "think" | "sleepy" | "wave";

const LABEL: Record<ReppyMood, string> = {
  idle: "앵무새 리피",
  happy: "웃는 리피",
  talk: "말하는 리피",
  think: "생각하는 리피",
  sleepy: "졸린 리피",
  wave: "손 흔드는 리피",
};

export default function Reppy({
  mood = "idle",
  size = 120,
  decorative = false,
  className,
}: {
  mood?: ReppyMood;
  size?: number;
  /** 옆에 같은 뜻의 글이 있으면 true (화면 읽기 프로그램이 두 번 읽지 않게) */
  decorative?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const id = (name: string) => `reppy-${name}-${uid}`;
  const url = (name: string) => `url(#${id(name)})`;

  const happy = mood === "happy" || mood === "wave";
  const sleepy = mood === "sleepy";
  const think = mood === "think";
  const open = mood === "talk" || happy;
  const dx = think ? 2 : 0;
  const dy = think ? -2.5 : 0;
  const cls = ["reppy", `reppy-${mood}`, happy ? "reppy-happy" : "", className ?? ""].join(" ");

  return (
    <svg
      viewBox="0 0 120 124"
      width={size}
      height={size}
      className={cls}
      style={{ overflow: "visible", flexShrink: 0 }}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": LABEL[mood] })}
    >
      <defs>
        <radialGradient id={id("head")} cx="38%" cy="28%" r="78%">
          <stop offset="0" stopColor="#6F96FF" />
          <stop offset="0.55" stopColor="#3B67F2" />
          <stop offset="1" stopColor="#2849C9" />
        </radialGradient>
        <radialGradient id={id("body")} cx="45%" cy="20%" r="85%">
          <stop offset="0" stopColor="#4A74F5" />
          <stop offset="1" stopColor="#2442BC" />
        </radialGradient>
        <radialGradient id={id("belly")} cx="45%" cy="25%" r="80%">
          <stop offset="0" stopColor="#FFF4C2" />
          <stop offset="1" stopColor="#FFCF4A" />
        </radialGradient>
        <radialGradient id={id("face")} cx="50%" cy="35%" r="70%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E6EDFF" />
        </radialGradient>
        <linearGradient id={id("beak")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFC56E" />
          <stop offset="1" stopColor="#F58A2A" />
        </linearGradient>
        <radialGradient id={id("eye")} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#3C4580" />
          <stop offset="1" stopColor="#11143A" />
        </radialGradient>
        <linearGradient id={id("crest")} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#3B67F2" />
          <stop offset="0.7" stopColor="#8FB0FF" />
          <stop offset="1" stopColor="#FFD866" />
        </linearGradient>
        <linearGradient id={id("wing")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3A62E8" />
          <stop offset="1" stopColor="#1F3CA8" />
        </linearGradient>
        <radialGradient id={id("cheek")}>
          <stop offset="0" stopColor="#FF8FAA" stopOpacity="0.8" />
          <stop offset="1" stopColor="#FF8FAA" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse className="reppy-shadow" cx="60" cy="119" rx="25" ry="3.4" fill="#14181F" opacity="0.16" />

      {think && (
        <g>
          <circle className="reppy-dot" cx="95" cy="16" r="3" fill="#B9C0CC" />
          <circle className="reppy-dot" cx="104" cy="9" r="3.8" fill="#B9C0CC" />
          <circle className="reppy-dot" cx="114" cy="3" r="4.6" fill="#B9C0CC" />
        </g>
      )}
      {sleepy && (
        <g fontFamily="Inter, sans-serif" fontWeight="800" fill="#A2A9B6">
          <text className="reppy-z" x="92" y="23" fontSize="13">z</text>
          <text className="reppy-z reppy-z2" x="101" y="13" fontSize="17">Z</text>
        </g>
      )}
      {happy && (
        <g>
          <path className="reppy-spark" d="M17 32 Q18 38 24 39 Q18 40 17 46 Q16 40 10 39 Q16 38 17 32 Z" fill="#FFD54F" />
          <path className="reppy-spark" d="M103 46 Q104 50 108 51 Q104 52 103 56 Q102 52 98 51 Q102 50 103 46 Z" fill="#FFD54F" />
          <path className="reppy-spark" d="M23 76 Q23.7 79 27 79.5 Q23.7 80 23 83 Q22.3 80 19 79.5 Q22.3 79 23 76 Z" fill="#FFB8C8" />
        </g>
      )}

      <g className="reppy-body">
        {/* 꼬리 */}
        <ellipse cx="51" cy="111" rx="6" ry="10" fill="#2442BC" transform="rotate(18 51 111)" />
        <ellipse cx="69" cy="111" rx="6" ry="10" fill="#2442BC" transform="rotate(-18 69 111)" />
        <ellipse cx="60" cy="114" rx="4.5" ry="9" fill="#FFCF4A" />
        {/* 몸 */}
        <ellipse cx="60" cy="94" rx="23" ry="19" fill={url("body")} />
        <ellipse cx="60" cy="98" rx="14" ry="13" fill={url("belly")} />
        {/* 날개 */}
        <ellipse cx="38" cy="94" rx="7.5" ry="12" fill={url("wing")} transform="rotate(16 38 94)" />
        {mood === "wave" ? (
          <g className="reppy-wing-r">
            <ellipse cx="84" cy="80" rx="7.5" ry="12" fill={url("wing")} transform="rotate(35 84 80)" />
          </g>
        ) : (
          <ellipse cx="82" cy="94" rx="7.5" ry="12" fill={url("wing")} transform="rotate(-16 82 94)" />
        )}
        {/* 발 */}
        <ellipse cx="53" cy="112.5" rx="4.2" ry="2.6" fill="#F59A3C" />
        <ellipse cx="67" cy="112.5" rx="4.2" ry="2.6" fill="#F59A3C" />
        <ellipse cx="60" cy="80" rx="20" ry="5" fill="#1D3AA8" opacity="0.35" />

        <g className="reppy-head">
          <g className="reppy-crest">
            <ellipse cx="53" cy="17" rx="4.5" ry="9" fill={url("crest")} transform="rotate(-22 53 17)" />
            <ellipse cx="61" cy="14" rx="4.8" ry="10" fill={url("crest")} />
            <ellipse cx="69" cy="17" rx="4.5" ry="9" fill={url("crest")} transform="rotate(22 69 17)" />
          </g>
          <circle cx="60" cy="50" r="33" fill={url("head")} />
          <ellipse cx="46" cy="29" rx="11" ry="6" fill="#FFFFFF" opacity="0.28" transform="rotate(-25 46 29)" />
          <ellipse cx="60" cy="59" rx="25" ry="20" fill={url("face")} />

          {/* 눈 */}
          {happy ? (
            <path d="M42 55 Q48 47 54 55 M66 55 Q72 47 78 55" fill="none" stroke="#1A1F4A" strokeWidth="3.2" strokeLinecap="round" />
          ) : sleepy ? (
            <path d="M42 54 Q48 59 54 54 M66 54 Q72 59 78 54" fill="none" stroke="#1A1F4A" strokeWidth="2.8" strokeLinecap="round" />
          ) : (
            [48, 72].map((x) => (
              <g key={x} className="reppy-eye">
                <ellipse cx={x + dx} cy={53 + dy} rx="6.8" ry="8" fill={url("eye")} />
                <circle cx={x + 2.4 + dx} cy={49.6 + dy} r="2.9" fill="#FFFFFF" />
                <circle cx={x - 2.2 + dx} cy={56.6 + dy} r="1.3" fill="#FFFFFF" opacity="0.85" />
              </g>
            ))
          )}

          <circle cx="38" cy="66" r="7.5" fill={url("cheek")} />
          <circle cx="82" cy="66" r="7.5" fill={url("cheek")} />

          {/* 부리 */}
          <g className="reppy-jaw">
            <path
              d={open ? "M55.5 69 Q60 71 64.5 69 Q64 77.5 60 78.5 Q56 77.5 55.5 69 Z" : "M56.5 69 Q60 70.5 63.5 69 Q62.5 73 60 73.6 Q57.5 73 56.5 69 Z"}
              fill="#C24E16"
            />
            {open && <ellipse cx="60" cy="74.5" rx="3" ry="2" fill="#FF8DA0" />}
          </g>
          <path d="M53.5 63 Q60 58.5 66.5 63 Q66 69.5 60 73 Q54 69.5 53.5 63 Z" fill={url("beak")} />
          <ellipse cx="58" cy="62.5" rx="2.6" ry="1.2" fill="#FFE4BA" opacity="0.9" />
        </g>
      </g>
    </svg>
  );
}

/** 리피 + 말풍선 한 줄 (홈, 빈 화면 등) */
export function ReppySays({ mood, children, size = 64 }: { mood: ReppyMood; children: React.ReactNode; size?: number }) {
  return (
    <div className="reppy-says">
      <Reppy mood={mood} size={size} />
      <div className="reppy-bubble">{children}</div>
    </div>
  );
}
