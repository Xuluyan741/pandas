/**
 * POST /api/push/subscribe
 * Body: { subscription: { endpoint, keys: { p256dh, auth } } }
 * 将当前用户的推送订阅写入数据库
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const sub = body.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const id = randomUUID();
  try {
    await db.execute({
      sql: `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
      args: [id, auth.userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth],
    });
  } catch (e) {
    console.error("[push] subscribe failed", e);
    return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
