/**
 * POST /api/stripe/checkout — 创建 Stripe 订阅 Checkout Session，跳转支付页
 * body: { plan: "monthly" | "yearly" }
 * 需配置 STRIPE_SECRET_KEY、STRIPE_PRICE_ID_MONTHLY、STRIPE_PRICE_ID_YEARLY、NEXTAUTH_URL
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  let body: { plan?: string };
  try {
    body = (await req.json()) as { plan?: string };
  } catch {
    return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  }
  const plan = body.plan === "yearly" ? "yearly" : "monthly";

  const secret = process.env.STRIPE_SECRET_KEY;
  const priceId =
    plan === "yearly"
      ? process.env.STRIPE_PRICE_ID_YEARLY
      : process.env.STRIPE_PRICE_ID_MONTHLY;
  const baseUrl =
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000";

  if (!secret || !priceId) {
    return NextResponse.json(
      { error: "支付暂未配置，请稍后再试或联系客服" },
      { status: 503 },
    );
  }

  const successUrl = `${baseUrl.replace(/\/$/, "")}/?checkout=success`;
  const cancelUrl = `${baseUrl.replace(/\/$/, "")}/pricing?checkout=cancel`;

  const params = new URLSearchParams({
    "mode": "subscription",
    "success_url": successUrl,
    "cancel_url": cancelUrl,
    "client_reference_id": userId,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "subscription_data[metadata][user_id]": userId,
  });

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("[stripe/checkout] Stripe API error", res.status, text);
    return NextResponse.json(
      { error: "创建支付链接失败，请稍后重试" },
      { status: 502 },
    );
  }

  let data: { id?: string; url?: string };
  try {
    data = JSON.parse(text) as { id?: string; url?: string };
  } catch {
    return NextResponse.json({ error: "支付服务返回异常" }, { status: 502 });
  }

  if (!data.url) {
    return NextResponse.json({ error: "未返回支付链接" }, { status: 502 });
  }

  return NextResponse.json({ url: data.url });
}
