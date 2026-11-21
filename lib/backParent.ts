// 휴대폰 뒤로가기 = 화면 왼쪽 위 ←/× 버튼과 같게 (위 단계 화면으로). 화면과 테스트가 같이 쓰는 순수 함수.

export type BackTarget =
  | { kind: "to"; href: string } // 이 화면으로 (지금 기록을 바꿔치기)
  | { kind: "exit" } // 홈: 두 번 누르면 앱 종료
  | { kind: "default" }; // 로그인 · 가입처럼 앱 밖 흐름: 브라우저 기본 동작

const to = (href: string): BackTarget => ({ kind: "to", href });

/** 지금 주소(경로 + ?쿼리)의 위 단계 */
export function parentOf(pathname: string, search = ""): BackTarget {
  const p = pathname.replace(/\/+$/, "") || "/";
  const v = new URLSearchParams(search).get("v");
  const keepV = v === "mine" || v === "ai" ? `?v=${v}` : "";
  const seg = p.split("/").filter(Boolean);

  if (p === "/home") return { kind: "exit" };
  if (["/", "/login", "/join", "/setup", "/password"].includes(p) || seg[0] === "auth") return { kind: "default" };

  switch (seg[0]) {
    case "topic":
      // /topic/x/script → /topic/x, /topic/x → 홈
      return seg.length >= 3 ? to(`/topic/${seg[1]}`) : to("/home");
    case "practice":
    case "recite":
      // 보던 답변(내 스크립트 / AI 답변) 그대로 주제 화면으로
      return seg[1] ? to(`/topic/${seg[1]}${keepV}`) : to("/home");
    case "mock":
      // /mock/x/report → /mock (시험 중 /mock/x 는 화면이 확인 창을 띄운다)
      return seg.length >= 2 ? to("/mock") : to("/home");
    case "me":
      return seg.length >= 2 ? to("/me") : to("/home");
    case "admin":
      // 운영자 회원 화면은 화면이 그 사람의 가족 화면을 알려 준다
      return seg.length >= 2 ? to("/admin") : to("/me");
    default:
      // 가족 · 오늘의 복습 · 표현 노트 · 기록 · 전화영어 등
      return to("/home");
  }
}
