import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Profile } from "./types";

/** 로그인 + 프로필을 확인한다. 없으면 알맞은 화면으로 보낸다. */
export async function requireProfile(opts: { allowUnfinishedSetup?: boolean } = {}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, family_id, display_name, level, style, daily_limit, setup_done")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  if (!profile) redirect("/join");
  if (!profile.setup_done && !opts.allowUnfinishedSetup) redirect("/setup");
  return { supabase, user, profile };
}

export async function usageToday(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: day } = await supabase.rpc("today_kst");
  const { data } = await supabase
    .from("usage_daily")
    .select("count")
    .eq("user_id", userId)
    .eq("day", day as string)
    .maybeSingle<{ count: number }>();
  return data?.count ?? 0;
}
