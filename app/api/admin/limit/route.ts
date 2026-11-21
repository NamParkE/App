import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/data";

// 운영자: 한 사람의 하루 한도를 바꾼다. 운영자인지와 범위(0~200)는 DB 함수 admin_set_limit 이 다시 확인한다.

const Body = z.object({
  userId: z.guid(),
  limit: z.number().int().min(0).max(200),
});

function fail(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "한도는 0~200회 사이로 정해 주세요.");

  const { supabase, userId } = await currentUser();
  if (!userId) return fail(401, "다시 로그인해 주세요.");

  const { data, error } = await supabase.rpc("admin_set_limit", { p_user: parsed.data.userId, p_limit: parsed.data.limit });
  if (error) {
    if (error.code === "42501") return fail(403, "운영자만 한도를 바꿀 수 있어요.");
    if (error.code === "P0002") return fail(404, "사람을 찾을 수 없어요.");
    if (error.code === "22023") return fail(400, "한도는 0~200회 사이로 정해 주세요.");
    console.error("[admin] set limit failed", error);
    return fail(500, "한도를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  return NextResponse.json({ limit: data as number });
}
