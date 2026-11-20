"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { INVITE_KEY } from "@/lib/invite";
import { SpinnerIcon } from "@/components/Icons";

const MESSAGES: Record<string, string> = {
  invalid_code: "초대 코드를 찾을 수 없어요. 가족에게 코드를 다시 확인해 주세요.",
  not_owner: "이 계정은 새 가족을 만들 수 없어요. 가족에게 초대 코드를 받아 입력해 주세요.",
};

function messageFor(raw: string) {
  const key = Object.keys(MESSAGES).find((k) => raw.includes(k));
  return key ? MESSAGES[key] : "잠시 후 다시 시도해 주세요.";
}

export default function JoinForm({ defaultName, email }: { defaultName: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "join_family" | "create_family">(null);

  useEffect(() => {
    try {
      setCode(localStorage.getItem(INVITE_KEY) ?? "");
    } catch {}
  }, []);

  async function run(fn: "join_family" | "create_family") {
    setBusy(fn);
    setError(null);
    const supabase = createClient();
    const { error } =
      fn === "join_family"
        ? await supabase.rpc("join_family", { p_code: code, p_display_name: name })
        : await supabase.rpc("create_family", { p_display_name: name });
    if (error) {
      setError(messageFor(error.message));
      setBusy(null);
      return;
    }
    try {
      localStorage.removeItem(INVITE_KEY);
    } catch {}
    router.replace("/setup");
    router.refresh();
  }

  return (
    <main className="screen">
      <div className="pad" style={{ paddingTop: 72 }}>
        <h1 className="title">가족과 함께 시작해요</h1>
        <p className="subtitle">
          <span className="en">{email}</span> 계정으로 로그인했어요. 가족에게 받은 초대 코드를 입력해 주세요.
        </p>
        <label className="field">
          이름 (가족에게 보여요)
          <input className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          가족 초대 코드
          <input
            className="input en"
            value={code}
            maxLength={6}
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={{ letterSpacing: 4, fontWeight: 700 }}
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!!busy || code.trim().length !== 6 || !name.trim()}
          onClick={() => run("join_family")}
        >
          {busy === "join_family" ? <><SpinnerIcon color="#fff" /> 들어가는 중…</> : "초대 코드로 들어가기"}
        </button>
        <div className="divider" style={{ margin: "8px 0" }} />
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          가족 계정을 처음 만드는 관리자라면 코드 없이 시작할 수 있어요.
        </p>
        <button
          type="button"
          className="btn btn-outline"
          disabled={!!busy || !name.trim()}
          onClick={() => run("create_family")}
        >
          {busy === "create_family" ? <><SpinnerIcon /> 만드는 중…</> : "새 가족 만들기"}
        </button>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-btn" style={{ width: "100%" }}>
            다른 계정으로 로그인
          </button>
        </form>
      </div>
    </main>
  );
}
