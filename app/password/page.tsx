"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BackIcon, SpinnerIcon } from "@/components/Icons";

const MIN_PASSWORD = 8;

export default function PasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(`비밀번호는 ${MIN_PASSWORD}자 이상으로 정해 주세요.`);
    if (password !== password2) return setError("두 비밀번호가 서로 달라요.");
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(
        error.code === "weak_password"
          ? "비밀번호가 너무 쉬워요. 숫자나 기호를 섞어 주세요."
          : error.code === "same_password"
            ? "지금 비밀번호와 같아요. 다른 비밀번호로 정해 주세요."
            : "저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
      return;
    }
    setDone(true);
  }

  return (
    <main className="screen">
      <div className="pad">
        <div className="topbar">
          <button type="button" className="icon-btn" aria-label="뒤로" onClick={() => router.back()}>
            <BackIcon />
          </button>
        </div>
        <h1 className="title">비밀번호 설정</h1>
        {done ? (
          <>
            <p className="notice" role="status">
              비밀번호를 저장했어요. 다음부터는 이메일과 이 비밀번호로 바로 로그인할 수 있어요.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => router.replace("/home")}>
              학습하러 가기
            </button>
          </>
        ) : (
          <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p className="subtitle">다음 로그인부터 쓸 비밀번호를 정해 주세요.</p>
            <label className="field">
              새 비밀번호 ({MIN_PASSWORD}자 이상)
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="field">
              새 비밀번호 확인
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                required
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
              />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? (
                <>
                  <SpinnerIcon color="#fff" /> 저장 중…
                </>
              ) : (
                "저장하기"
              )}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
