"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { runBackOverride, useBackOverride } from "@/lib/back";
import { parentOf } from "@/lib/backParent";

/** 홈에서 두 번째 뒤로가기를 기다리는 시간 */
const EXIT_WAIT_MS = 2000;
const BASE_KEY = "app-back-base";

function baseIndex() {
  try {
    const v = Number(sessionStorage.getItem(BASE_KEY));
    return Number.isFinite(v) && v >= 0 ? v : 0;
  } catch {
    return 0;
  }
}

/**
 * 휴대폰 뒤로가기를 "방금 본 페이지"가 아니라 "위 단계 화면"으로 (화면 왼쪽 위 ←/× 와 같게).
 * 웹앱(TWA)의 뒤로가기는 브라우저 기록을 거슬러 가므로, 화면마다 같은 주소의 기록을 하나 더 쌓아 두고(가드)
 * 뒤로가기로 가드가 빠지면 그 순간을 가로채 위 단계로 바꿔치기한다.
 * 홈에서는 "한 번 더 누르면 종료" 안내 후, 앱의 첫 기록으로 돌아가 가드 없이 기다린다 (다음 뒤로가기에 앱이 닫힌다).
 */
export default function AppBack() {
  const pathname = usePathname();
  const router = useRouter();
  const [toast, setToast] = useState(false);
  const path = useRef(pathname);
  const exiting = useRef(false);
  /** 종료를 기다리기 시작한 화면 (홈) */
  const exitFrom = useRef("/home");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushGuard = () => window.history.pushState(window.history.state, "", window.location.href);

  // 이 앱의 첫 기록 위치 (앱을 연 탭에서 처음 한 번). 그 앞(빈 페이지 · 다른 사이트)으로는 거슬러 가지 않는다
  useEffect(() => {
    try {
      if (sessionStorage.getItem(BASE_KEY) === null) sessionStorage.setItem(BASE_KEY, String(window.history.length - 1));
    } catch {}
  }, []);

  // 화면이 바뀔 때마다 가드를 쌓는다 (로그인 · 가입 화면은 기본 동작)
  useEffect(() => {
    path.current = pathname;
    if (exiting.current) {
      // 종료를 기다리며 첫 기록으로 돌아왔는데 홈이 아니면 홈으로 바꿔치기 (가드는 쌓지 않는다)
      if (pathname !== exitFrom.current) router.replace(exitFrom.current);
      return;
    }
    if (parentOf(pathname).kind === "default") return;
    pushGuard();
  }, [pathname, router]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      // 종료를 기다리는 동안의 이동(첫 기록으로 돌아가기)은 그대로 둔다
      if (exiting.current) return;
      const target = parentOf(path.current, window.location.search);
      if (target.kind === "default") return;
      // Next 라우터보다 먼저 받아 "이전 페이지로 가기"를 막는다
      e.stopImmediatePropagation();

      if (runBackOverride()) {
        pushGuard();
        return;
      }
      if (target.kind === "to") {
        router.replace(target.href);
        return;
      }
      // 홈: 한 번 더 누르면 종료
      exiting.current = true;
      exitFrom.current = path.current;
      setToast(true);
      // 가드가 빠진 지금 위치 = 마지막 - 1. 앱의 첫 기록까지만 거슬러 간다
      const back = window.history.length - 2 - baseIndex();
      if (back > 0) window.history.go(-back);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        exiting.current = false;
        setToast(false);
        if (window.location.pathname !== exitFrom.current) router.replace(exitFrom.current);
        else pushGuard();
      }, EXIT_WAIT_MS);
    };
    window.addEventListener("popstate", onPop, { capture: true });
    return () => {
      window.removeEventListener("popstate", onPop, { capture: true });
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router]);

  return toast ? (
    <div
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 96,
        transform: "translateX(-50%)",
        background: "var(--dark)",
        color: "#fff",
        borderRadius: 999,
        padding: "10px 16px",
        fontSize: 14,
        zIndex: 100,
        whiteSpace: "nowrap",
      }}
    >
      한 번 더 누르면 앱이 종료돼요
    </div>
  ) : null;
}

/** 서버 화면에서 뒤로가기 목적지를 정할 때 (예: 운영자 회원 → 그 사람의 가족 화면) */
export function BackTo({ href }: { href: string }) {
  const router = useRouter();
  useBackOverride(true, () => router.replace(href));
  return null;
}
