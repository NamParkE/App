import { requireProfile } from "@/lib/data";
import SetupForm from "./SetupForm";

export default async function SetupPage() {
  const { profile } = await requireProfile({ allowUnfinishedSetup: true });
  return <SetupForm profile={profile} />;
}
