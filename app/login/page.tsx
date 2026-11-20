"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GlobeIcon, MicIcon } from "@/components/Icons";
import { INVITE_KEY } from "@/lib/invite";

export default function LoginPage() {
  const [mode, setMode] = useState<"main" | "email" | "code">("main");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setCode(localStorage.getItem(INVITE_KEY) ?? "");
    } catch {}
    if (new URLSearchParams(location.search).get("error")) {
      setError("로그인하지 못했어요. 다시 시도해 주세요.");
    }
  }, []);

  const redirectTo = () => `${location.origin}/auth/callback`;

  async function google() {
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    if (error) {
      setError("Google 로그인을 시작하지 못했어요.");
      setBusy(false);
    }
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo() },
    });
    setBusy(false);
    if (error) setError("메일을 보내지 못했어요. 주소를 확인해 주세요.");
    else setSent(true);
  }

  function saveCode(e: React.FormEvent) {
    e.preventDefault();
    try {
      localStorage.setItem(INVITE_KEY, code.trim().toUpperCase());
    } catch {}
    setMode("main");
  }

  return (
    <main className="screen" style={{ padding: "72px 24px 40px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, flexGrow: 1 }}>
        <div className="logo">
          <MicIcon size={28} color="#FFFFFF" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h1 className="hero">
            말하며 외우는
            <br />
            오픽 핵심 답변
          </h1>
          <p className="subtitle" style={{ fontSize: 16, lineHeight: 1.6 }}>
            내 목표 등급에 맞춘 문장을 듣고, 따라 말하고, 비교 피드백으로 완성하세요.
          </p>
        </div>
        <div className="card" style={{ marginTop: 28, padding: 20, gap: 14 }}>
          <div className="feature"><b>01</b>빈출 주제별 핵심 답변 문장</div>
          <div className="feature"><b>02</b>영어 원문 · 발음 · 한글 번역 세 줄</div>
          <div className="feature"><b>03</b>내가 말한 문장과 모범 문장 비교</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 32 }}>
        {error && <p className="error" role="alert">{error}</p>}

        {mode === "main" && (
          <>
            <button type="button" className="btn btn-outline" onClick={google} disabled={busy}>
              <GlobeIcon />
              Google로 계속하기
            </button>
            <button type="button" className="btn btn-dark" onClick={() => setMode("email")}>
              이메일로 로그인
            </button>
            <p className="muted" style={{ margin: "8px 0 0", textAlign: "center", fontSize: 14 }}>
              {code ? (
                <>
                  초대 코드 <b className="en">{code}</b> 저장됨 ·{" "}
                  <a href="#" onClick={(e) => { e.preventDefault(); setMode("code"); }}>바꾸기</a>
                </>
              ) : (
                <>
                  가족 초대 코드가 있나요?{" "}
                  <a href="#" onClick={(e) => { e.preventDefault(); setMode("code"); }}>코드 입력</a>
                </>
              )}
            </p>
          </>
        )}

        {mode === "email" &&
          (sent ? (
            <>
              <p className="notice">
                <b>{email}</b>로 로그인 링크를 보냈어요. 이 폰에서 메일을 열고 링크를 눌러 주세요.
              </p>
              <button type="button" className="btn btn-outline" onClick={() => { setSent(false); setMode("main"); }}>
                돌아가기
              </button>
            </>
          ) : (
            <form onSubmit={sendLink} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label className="field">
                이메일
                <input
                  className="input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button type="submit" className="btn btn-dark" disabled={busy}>
                로그인 링크 받기
              </button>
              <button type="button" className="text-btn" onClick={() => setMode("main")}>
                뒤로
              </button>
            </form>
          ))}

        {mode === "code" && (
          <form onSubmit={saveCode} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label className="field">
              가족 초대 코드 (6자리)
              <input
                className="input en"
                value={code}
                maxLength={6}
                autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                style={{ letterSpacing: 4, fontWeight: 700 }}
              />
            </label>
            <button type="submit" className="btn btn-dark">저장하고 로그인하기</button>
          </form>
        )}
      </div>
    </main>
  );
}
