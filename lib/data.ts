import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Profile } from "./types";

export type DB = Awaited<ReturnType<typeof createClient>>;

const PROFILE_COLUMNS = "id, family_id, display_name, level, style, daily_limit, setup_done, call_level, call_level_since";

/**
 * 로그인한 사용자. getClaims() 는 로그인 토큰을 서버에서 바로 검증해서
 * 매번 Supabase 인증 서버에 묻는 getUser() 보다 한 번의 왕복을 아낀다.
 * cache() 로 한 요청 안에서는 한 번만 계산한다.
 */
export const currentUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  return {
    supabase,
    userId: (claims?.sub as string | undefined) ?? null,
    email: (claims?.email as string | undefined) ?? null,
    meta: (claims?.user_metadata as Record<string, unknown> | undefined) ?? {},
  };
});

export async function requireUser() {
  const u = await currentUser();
  if (!u.userId) redirect("/login");
  return { ...u, userId: u.userId };
}

export async function fetchProfile(supabase: DB, userId: string) {
  const { data } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle<Profile>();
  return data;
}

/** 프로필이 없거나 설정 전이면 알맞은 화면으로 보낸다. */
export function checkProfile(profile: Profile | null, opts: { allowUnfinishedSetup?: boolean } = {}): Profile {
  if (!profile) redirect("/join");
  if (!profile.setup_done && !opts.allowUnfinishedSetup) redirect("/setup");
  return profile;
}

export async function requireProfile(opts: { allowUnfinishedSetup?: boolean } = {}) {
  const u = await requireUser();
  const profile = checkProfile(await fetchProfile(u.supabase, u.userId), opts);
  return { ...u, profile };
}

/** 한국 날짜 (DB 의 today_kst() 와 같은 값). 한국은 서머타임이 없어 +9시간이면 된다. */
export function todayKst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function usageToday(supabase: DB, userId: string) {
  const { data } = await supabase
    .from("usage_daily")
    .select("count")
    .eq("user_id", userId)
    .eq("day", todayKst())
    .maybeSingle<{ count: number }>();
  return data?.count ?? 0;
}

/** 내 연속 학습일 (DB 함수 한 번) */
export async function myStreak(supabase: DB) {
  const { data } = await supabase.rpc("my_streak").maybeSingle<{ streak: number; studied_today: boolean }>();
  return { streak: data?.streak ?? 0, studiedToday: data?.studied_today ?? false };
}
