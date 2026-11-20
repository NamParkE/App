import { redirect } from "next/navigation";
import { fetchProfile, requireUser } from "@/lib/data";
import JoinForm from "./JoinForm";

export default async function JoinPage() {
  const { supabase, userId, email, meta } = await requireUser();
  if (await fetchProfile(supabase, userId)) redirect("/home");
  const defaultName = String(meta.full_name ?? meta.name ?? email?.split("@")[0] ?? "");
  return <JoinForm defaultName={defaultName} email={email ?? ""} />;
}
