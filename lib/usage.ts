import "server-only";
import type { DB } from "./data";

// 하루 사용량 차감 · 환불. 차감할 때 받은 영수증(ticket)으로만 환불할 수 있다 (DB: 0006_refund_lockdown.sql).
// 영수증 id 는 서버 안에서만 쓰고 화면으로 보내지 않는다.

export interface Charge {
  /** 남은 횟수. 한도를 넘으면 -1 */
  left: number;
  /** 차감했으면 영수증 id */
  ticket: string | null;
}

/** 차감한다. DB 오류면 null */
export async function chargeUsage(supabase: DB, n = 1): Promise<Charge | null> {
  const { data, error } = await supabase.rpc("charge_usage", { p_n: n });
  if (error || !data) {
    if (error) console.error("[usage] charge failed", error);
    return null;
  }
  const d = data as { left: number; ticket: string | null };
  return { left: d.left, ticket: d.ticket };
}

/** 영수증 하나를 환불한다 (한 번만). 환불했으면 true */
export async function refundCharge(supabase: DB, ticket: string | null): Promise<boolean> {
  if (!ticket) return false;
  const { data, error } = await supabase.rpc("refund_charge", { p_ticket: ticket });
  if (error) console.error("[usage] refund failed", error);
  return data === true;
}
