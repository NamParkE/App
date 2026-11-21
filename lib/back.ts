"use client";

import { useEffect, useRef } from "react";

// 화면이 휴대폰 뒤로가기를 직접 처리하고 싶을 때 (통화 중 확인 창, 설문 이전 단계, 운영자 회원 → 그 가족 화면 등).
// 가장 나중에 등록한 것 하나만 불린다. 등록이 없으면 AppBack 이 위 단계 화면(lib/backParent.ts)으로 보낸다.

type Entry = { run: () => void };
const stack: Entry[] = [];

/** active 인 동안 뒤로가기를 fn 으로 처리한다 */
export function useBackOverride(active: boolean, fn: () => void) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!active) return;
    const entry: Entry = { run: () => ref.current() };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}

/** 등록된 처리가 있으면 실행하고 true */
export function runBackOverride(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.run();
  return true;
}
