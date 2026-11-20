"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GlobeIcon, MicIcon, SpinnerIcon } from "@/components/Icons";
import { INVITE_KEY } from "@/lib/invite";

type Mode = "login" | "signup" | "reset" | "code";

// Google 로그인은 Supabase 에 Google 제공자를 설정한 뒤 이 값을 on 으로 바꾸면 보인다.
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "on";

const MIN_PASSWORD = 8;

function linkErrorMessage(code: string) {
  if (/otp_expired|expired|already|invalid_token|access_denied/i.test(code)) {
    return "메일의 링크가 만료됐거나 이미 사용됐어요. 다시 시도해 주세요.";
  }
  if (/pkce|code_verifier|flow_state/i.test(code)) {
    return "요청한 브라우저와 다른 곳에서 메일 링크가 열렸어요. 같은 브라우저(크롬)에서 다시 시도해 주세요.";
  }
  return "처리하지 못했어요. 다시 시도해 주세요.";
}

type AuthErr = { status?: number; code?: string; message: string };

function authErrorMessage(error: AuthErr) {
  const code = error.code ?? "";
  if (code === "invalid_credentials") {
    return "이메일 또는 비밀번호가 맞지 않아요. 처음이라면 '가입하기', 비밀번호가 없거나 잊었다면 '비밀번호 찾기'를 눌러 주세요.";
  }
  if (code === "email_not_confirmed") {
    return "아직 가입 확인이 안 됐어요. 메일함의 가입 확인 메일에서 링크를 눌러 주세요.";
  }
  if (code === "weak_password") {
    return `비밀번호가 너무 쉬워요. ${MIN_PASSWORD}자 이상으로, 숫자나 기호를 섞어 주세요.`;
  }
  if (code === "user_already_exists" || code === "email_exists") {
    return "이미 가입된 이메일이에요. 로그인해 주세요. 비밀번호가 없다면 '비밀번호 찾기'로 만들 수 있어요.";
  }
  if (error.status === 429 || /rate_limit/.test(code)) {
    const seconds = error.message.match(/after (\d+) seconds?/)?.[1];
    return seconds
      ? `요청이 너무 잦아요. ${seconds}초 뒤에 다시 시도해 주세요.`
      : "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.";
  }
  if (/email_address_invalid|validation_failed/.test(code)) {
    return "이메일 주소를 확인해 주세요.";
  }
  return "처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setCode(localStorage.getItem(INVITE_KEY) ?? "");
    } catch {}
    const params = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.slice(1));
    const err = params.get("error") ?? hash.get("error_code") ?? hash.get("error");
    if (err) setError(linkErrorMessage(err));
  }, []);

  function go(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  const callback = (next?: string) =>
    `${location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(authErrorMessage(error));
      setBusy(false);
      return;
    }
    router.replace("/home");
    router.refresh();
  }

  async function signup(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`비밀번호는 ${MIN_PASSWORD}자 이상으로 정해 주세요.`);
      return;
    }
    if (password !== password2) {
      setError("두 비밀번호가 서로 달라요.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: callback() },
    });
    setBusy(false);
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    if (data.session) {
      router.replace("/home");
      router.refresh();
      return;
    }
    // 이미 있는 이메일이면 Supabase 는 오류 대신 빈 사용자를 돌려준다
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setError(authErrorMessage({ code: "user_already_exists", message: "" }));
      return;
    }
    setNotice(`${email.trim()}로 가입 확인 메일을 보냈어요. 메일의 링크를 한 번 누르면 가입이 끝나고, 다음부터는 비밀번호로 바로 로그인돼요.`);
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: callback("/password"),
    });
    setBusy(false);
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    setNotice(`${email.trim()}로 비밀번호 설정 메일을 보냈어요. 메일의 링크를 누르면 새 비밀번호를 정할 수 있어요.`);
  }

  async function google() {
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback() },
    });
    if (error) {
      setError("Google 로그인을 시작하지 못했어요.");
      setBusy(false);
    }
  }

  function saveCode(e: React.FormEvent) {
    e.preventDefault();
    try {
      localStorage.setItem(INVITE_KEY, code.trim().toUpperCase());
    } catch {}
    go("login");
  }

  const emailField = (
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
  );

  const submitLabel = (label: string) =>
    busy ? (
      <>
        <SpinnerIcon color="#fff" /> 처리 중…
      </>
    ) : (
      label
    );

  return (
    <main className="screen" style={{ padding: "56px 24px 40px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 32 }}>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}

        {mode === "login" && (
          <>
            <form onSubmit={login} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {emailField}
              <label className="field">
                비밀번호
                <input
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button type="submit" className="btn btn-dark" disabled={busy}>
                {submitLabel("로그인")}
              </button>
            </form>
            <div className="row" style={{ justifyContent: "center", gap: 4, fontSize: 14 }}>
              <button type="button" className="text-btn" onClick={() => go("signup")}>처음이에요 · 가입하기</button>
              <span className="muted">|</span>
              <button type="button" className="text-btn" onClick={() => go("reset")}>비밀번호 찾기</button>
            </div>
            {GOOGLE_ENABLED && (
              <button type="button" className="btn btn-outline" onClick={google} disabled={busy}>
                <GlobeIcon />
                Google로 계속하기
              </button>
            )}
            <p className="muted" style={{ margin: "4px 0 0", textAlign: "center", fontSize: 14 }}>
              {code ? (
                <>
                  초대 코드 <b className="en">{code}</b> 저장됨 ·{" "}
                  <a href="#" onClick={(e) => { e.preventDefault(); go("code"); }}>바꾸기</a>
                </>
              ) : (
                <>
                  가족 초대 코드가 있나요?{" "}
                  <a href="#" onClick={(e) => { e.preventDefault(); go("code"); }}>코드 입력</a>
                </>
              )}
            </p>
          </>
        )}

        {mode === "signup" && (
          <form onSubmit={signup} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 className="section-title">가입하기</h2>
            {emailField}
            <label className="field">
              비밀번호 ({MIN_PASSWORD}자 이상)
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
              비밀번호 확인
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                required
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-dark" disabled={busy || !!notice}>
              {submitLabel("가입하기")}
            </button>
            <button type="button" className="text-btn" onClick={() => go("login")}>로그인으로 돌아가기</button>
          </form>
        )}

        {mode === "reset" && (
          <form onSubmit={reset} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 className="section-title">비밀번호 찾기</h2>
            <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
              가입한 이메일로 비밀번호 설정 링크를 보내 드려요. 메일 링크로만 로그인해 왔다면 여기서 비밀번호를 만들 수 있어요.
            </p>
            {emailField}
            <button type="submit" className="btn btn-dark" disabled={busy || !!notice}>
              {submitLabel("설정 링크 받기")}
            </button>
            <button type="button" className="text-btn" onClick={() => go("login")}>로그인으로 돌아가기</button>
          </form>
        )}

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
            <button type="submit" className="btn btn-dark">저장하기</button>
          </form>
        )}
      </div>
    </main>
  );
}
