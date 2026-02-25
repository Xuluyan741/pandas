/**
 * GET /api/push/vapid-public
 * 返回 VAPID 公钥，供前端 subscribe 使用
 */
import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) {
    return NextResponse.json({ error: "Push not configured" }, { status: 503 });
  }
  return NextResponse.json({ publicKey: key });
}
