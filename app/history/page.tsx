import { redirect } from "next/navigation";

// "기록" 메뉴는 "가족"으로 바뀌었다
export default function HistoryPage() {
  redirect("/family");
}
