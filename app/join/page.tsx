import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import JoinForm from "./JoinForm";

export default async function JoinPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (profile) redirect("/home");
  const meta = user.user_metadata ?? {};
  const defaultName = String(meta.full_name ?? meta.name ?? user.email?.split("@")[0] ?? "");
  return <JoinForm defaultName={defaultName} email={user.email ?? ""} />;
}
