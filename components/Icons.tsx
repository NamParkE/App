type P = { size?: number; color?: string };

const base = (size: number, color: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: color,
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const MicIcon = ({ size = 24, color = "currentColor" }: P) => (
  <svg {...base(size, color)}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </svg>
);

export const BackIcon = ({ size = 24, color = "currentColor" }: P) => (
  <svg {...base(size, color)}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export const CloseIcon = ({ size = 24, color = "currentColor" }: P) => (
  <svg {...base(size, color)}>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </svg>
);

export const ChevronIcon = ({ size = 20, color = "#6B7280" }: P) => (
  <svg {...base(size, color)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const SpeakerIcon = ({ size = 20, color = "currentColor" }: P) => (
  <svg {...base(size, color)}>
    <path d="M11 5L6 9H3v6h3l5 4z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
  </svg>
);

export const PlayIcon = ({ size = 22, color = "#FFFFFF" }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
);

export const CheckIcon = ({ size = 22, color = "currentColor" }: P) => (
  <svg {...base(size, color)} strokeWidth={2.4}>
    <path d="M5 12l5 5 9-10" />
  </svg>
);

export const ReplayIcon = ({ size = 18, color = "currentColor" }: P) => (
  <svg {...base(size, color)}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </svg>
);

export const SpinnerIcon = ({ size = 20, color = "currentColor" }: P) => (
  <svg {...base(size, color)} strokeWidth={2.4} className="spin">
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
);

export const HomeIcon = ({ size = 24, color = "currentColor" }: P) => (
  <svg {...base(size, color)}>
    <path d="M3 11l9-7 9 7v9H3z" />
  </svg>
);

export const ChartIcon = ({ size = 24, color = "currentColor" }: P) => (
  <svg {...base(size, color)}>
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M22 20H2" />
  </svg>
);

export const UserIcon = ({ size = 24, color = "currentColor" }: P) => (
  <svg {...base(size, color)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

export const ChatIcon = ({ size = 26, color = "currentColor" }: P) => (
  <svg {...base(size, color)}>
    <path d="M4 5h16v11H8l-4 4z" />
    <path d="M8 9h8" />
    <path d="M8 12h5" />
  </svg>
);

export const BookIcon = ({ size = 26, color = "currentColor" }: P) => (
  <svg {...base(size, color)}>
    <path d="M4 19V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2" />
    <path d="M9 7h6" />
  </svg>
);

export const GlobeIcon = ({ size = 20, color = "currentColor" }: P) => (
  <svg {...base(size, color)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 12h8" />
  </svg>
);
