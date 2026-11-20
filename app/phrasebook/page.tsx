import { requireUser, todayKst } from "@/lib/data";
import Phrasebook, { type PhraseRow } from "./Phrasebook";

export default async function PhrasebookPage() {
  const { supabase, userId } = await requireUser();
  const { data } = await supabase
    .from("expressions")
    .select("id, en, ko, example, stage, next_review_on")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(300)
    .returns<PhraseRow[]>();
  return <Phrasebook rows={data ?? []} today={todayKst()} />;
}
