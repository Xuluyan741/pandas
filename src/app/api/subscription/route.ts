/**
 * GET /api/subscription — 当前用户订阅状态（用于设置页展示与支付入口）
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getQuota } from "@/lib/quota";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  const quota = await getQuota(userId);
  return NextResponse.json({
    plan: quota.plan,
    dailyLimit: quota.dailyLimit,
    monthlyLimit: quota.monthlyLimit,
  });
}
