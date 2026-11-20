import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// 메일 링크(가입 확인, 비밀번호 설정)와 Google 로그인이 돌아오는 곳.
// - token_hash: 메일 템플릿을 바꾼 경우 (어느 브라우저에서 열어도 동작)
// - code: 기본 메일 링크와 Google 로그인 (요청한 브라우저에서 열어야 동작)
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);

  // 우리 앱 안의 경로로만 보낸다 (외부 주소로 튕기는 것 방지)
  const nextParam = searchParams.get("next") ?? "";
  const safeNext = /^\/[a-z/-]*$/i.test(nextParam) && !nextParam.startsWith("//") ? nextParam : "";

  const supabaseError = searchParams.get("error_code") ?? searchParams.get("error");
  if (supabaseError) return fail(supabaseError);

  const supabase = await createClient();

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return fail(error.code ?? "auth");
    const dest = type === "recovery" ? "/password" : safeNext || "/home";
    return NextResponse.redirect(`${origin}${dest}`);
  }

  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(error.code ?? "auth");
    return NextResponse.redirect(`${origin}${safeNext || "/home"}`);
  }

  return fail("auth");
}
