"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listen, type Listener } from "./speech";

/**
 * 길게 말하기(모의고사 한 문항 등)를 받아 적는다.
 * 문장 사이 침묵으로 음성 인식이 끝나면, 사용자가 멈출 때까지 조용히 다시 이어 듣는다.
 * stop() 은 그때까지 받아 적은 글 전체를 돌려준다.
 */
export function useLongListen() {
  const [live, setLive] = useState("");
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chunks = useRef<string[]>([]);
  const stopped = useRef(true);
  const listener = useRef<Listener | null>(null);
  const waiter = useRef<((text: string) => void) | null>(null);
  const failures = useRef(0);

  const joined = (extra = "") => [...chunks.current, extra.trim()].filter(Boolean).join(" ");

  const settle = useCallback(() => {
    listener.current = null;
    setOn(false);
    const w = waiter.current;
    waiter.current = null;
    w?.(joined());
  }, []);

  const loop = useCallback(
    (quiet: boolean) => {
      const l = listen({
        quiet,
        onPartial: (t) => setLive(joined(t)),
        onDone: (t) => {
          if (t.trim()) chunks.current.push(t.trim());
          setLive(joined());
          failures.current = 0;
          if (!stopped.current) loop(true);
          else settle();
        },
        onError: () => {
          // 잠깐의 오류는 다시 잇고, 계속되면(마이크 권한 등) 멈춘다
          failures.current += 1;
          if (!stopped.current && failures.current <= 3) {
            setTimeout(() => (stopped.current ? settle() : loop(true)), 300);
            return;
          }
          if (!stopped.current) setError("음성 인식이 멈췄어요. 마이크 권한을 확인해 주세요.");
          stopped.current = true;
          settle();
        },
      });
      if (!l) {
        stopped.current = true;
        setError("이 브라우저는 음성 인식을 지원하지 않아요. 크롬에서 열어 주세요.");
        settle();
        return;
      }
      listener.current = l;
      setOn(true);
    },
    [settle],
  );

  /** 새로 받아 적기 시작 (이전 글은 지운다) */
  const start = useCallback(() => {
    chunks.current = [];
    failures.current = 0;
    setLive("");
    setError(null);
    stopped.current = false;
    loop(false);
  }, [loop]);

  /** 이어서 받아 적기 (질문 다시 듣기 뒤) */
  const resume = useCallback(() => {
    if (!stopped.current) return;
    stopped.current = false;
    loop(true);
  }, [loop]);

  /** 멈추고 지금까지 받아 적은 글 전체를 돌려준다 */
  const stop = useCallback(
    () =>
      new Promise<string>((resolve) => {
        stopped.current = true;
        if (!listener.current) {
          setOn(false);
          resolve(joined());
          return;
        }
        waiter.current = resolve;
        listener.current.stop();
      }),
    [],
  );

  useEffect(
    () => () => {
      stopped.current = true;
      listener.current?.abort();
    },
    [],
  );

  return { live, on, error, start, resume, stop };
}
