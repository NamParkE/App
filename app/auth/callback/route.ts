import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// 로그인 링크와 Google 로그인이 돌아오는 곳.
// - token_hash: 메일 링크 (어느 브라우저에서 열어도 동작)
// - code: Google 로그인, 기본 메일 링크 (요청한 브라우저에서 열어야 동작)
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);

  const supabaseError = searchParams.get("error_code") ?? searchParams.get("error");
  if (supabaseError) return fail(supabaseError);

  const supabase = await createClient();

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return fail(error.code ?? "auth");
    return NextResponse.redirect(`${origin}/home`);
  }

  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(error.code ?? "auth");
    return NextResponse.redirect(`${origin}/home`);
  }

  return fail("auth");
}
