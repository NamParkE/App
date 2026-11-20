import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 서버만 쓰는 관리자 연결 (service_role). 브라우저로 절대 보내지 않는다.
// 수업 기록 · 대화 · 학습 점수처럼 사용자가 직접 고치면 안 되는 표는 이 연결로만 쓴다 (DB: 0007_server_writes.sql).
// RLS 를 건너뛰므로, 쓰기 전에 반드시 사용자 연결로 "내 것"인지 먼저 읽어 확인하고 id 와 user_id 를 직접 지정한다.

export type Admin = SupabaseClient;

export const MISSING_SERVICE_KEY =
  "서버 키가 설정되지 않았어요. 관리자: Vercel 환경 변수 SUPABASE_SERVICE_ROLE_KEY를 넣고 다시 배포해 주세요.";

let cached: Admin | null = null;

/** 관리자 연결. 키가 없으면 null (호출한 곳에서 MISSING_SERVICE_KEY 로 알린다) */
export function adminClient(): Admin | null {
  if (cached) return cached;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error("[admin] SUPABASE_SERVICE_ROLE_KEY is not set");
    return null;
  }
  cached = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
