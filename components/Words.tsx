import type { Token } from "@/lib/diff";

/** 단어 비교 결과: 빠뜨림 · 틀림 · 바꿔 말함을 칠해 보여 준다 */
export default function Words({ tokens }: { tokens: Token[] }) {
  return (
    <div className="words" lang="en">
      {tokens.map((t, i) =>
        t.status === "gap" ? (
          <span key={i} className="w-gap" role="img" aria-label="빠뜨린 자리" />
        ) : (
          <span key={i} className={t.status === "ok" ? undefined : `w-${t.status}`}>
            {t.text}
          </span>
        ),
      )}
    </div>
  );
}
