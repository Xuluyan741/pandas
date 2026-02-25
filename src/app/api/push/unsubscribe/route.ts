/**
 * POST /api/push/unsubscribe
 * Body: { endpoint: string }
 * 删除当前用户下该 endpoint 的订阅
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/api-helpers";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const endpoint = body.endpoint;
  if (!endpoint || typeof endpoint !== "string") {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  await db.execute({
    sql: "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
    args: [auth.userId, endpoint],
  });
  return NextResponse.json({ ok: true });
}
