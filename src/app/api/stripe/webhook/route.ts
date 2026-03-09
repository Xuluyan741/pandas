/**
 * POST /api/stripe/webhook — Stripe 订阅事件回调（支付成功/取消/续期）
 * 配置 Stripe Dashboard Webhook 指向此 URL，签名密钥填 STRIPE_WEBHOOK_SECRET
 * 支付安全：仅处理 Stripe 回调，不落地卡号
 */
import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { db, initDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET 未配置");
    return NextResponse.json({ error: "Webhook 未配置" }, { status: 503 });
  }

  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "缺少签名" }, { status: 400 });
  }

  const parts = sig.split(",").reduce((acc, s) => {
    const [k, v] = s.split("=");
    if (k && v) acc[k] = v;
    return acc;
  }, {} as Record<string, string>);
  const timestamp = parts.t;
  const receivedSignature = parts.v1;
  if (!timestamp || !receivedSignature) {
    return NextResponse.json({ error: "签名格式无效" }, { status: 400 });
  }

  const payload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  if (receivedSignature !== expected) {
    console.error("[stripe/webhook] 签名校验失败");
    return NextResponse.json({ error: "签名无效" }, { status: 401 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody) as { type?: string; data?: { object?: Record<string, unknown> } };
  } catch {
    return NextResponse.json({ error: "body 非 JSON" }, { status: 400 });
  }

  await initDb();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data?.object as {
        client_reference_id?: string;
        subscription?: string;
      };
      const userId = session?.client_reference_id as string | undefined;
      if (!userId) break;
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);
      await db.execute({
        sql: "UPDATE users SET subscription_status = ?, subscription_plan = ?, subscription_end_date = ? WHERE id = ?",
        args: ["active", "pro", endDate.toISOString().slice(0, 10), userId],
      });
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data?.object as {
        status?: string;
        metadata?: { user_id?: string };
        current_period_end?: number;
      };
      const userId = sub?.metadata?.user_id as string | undefined;
      if (!userId) break;
      const status = sub?.status === "active" ? "active" : "inactive";
      let endDateStr: string | null = null;
      if (status === "active" && sub?.current_period_end) {
        endDateStr = new Date(sub.current_period_end * 1000).toISOString().slice(0, 10);
      }
      await db.execute({
        sql: "UPDATE users SET subscription_status = ?, subscription_end_date = ? WHERE id = ?",
        args: [status, endDateStr, userId],
      });
      break;
    }
    default:
      // 其他事件忽略
      break;
  }

  return NextResponse.json({ received: true });
}
