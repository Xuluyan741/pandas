/**
 * GET /api/usage/stats — 使用统计（参考 ClawWork：成本与配额可视化）
 * 返回本日/本月按类型用量、加权已用、奖励、剩余额度、近 7 日趋势
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getQuota,
  getWeightedUsageAndRewards,
  USAGE_WEIGHTS,
  type UsageKind,
} from "@/lib/quota";

const KINDS: UsageKind[] = ["agent_chat", "parse_tasks", "scheduler", "agent_push"];

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? "guest";

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);

  const [quota, weighted, usageRows] = await Promise.all([
    getQuota(userId),
    getWeightedUsageAndRewards(userId, now),
    db.execute({
      sql: `SELECT kind, period, count, total_cost_usd FROM ai_usage
            WHERE user_id = ? AND (period = ? OR period LIKE ?)`,
      args: [userId, day, `${month}%`],
    }),
  ]);

  const byKindToday: Record<string, { count: number; costUSD: number }> = {};
  const byKindMonth: Record<string, { count: number; costUSD: number }> = {};
  for (const k of KINDS) {
    byKindToday[k] = { count: 0, costUSD: 0 };
    byKindMonth[k] = { count: 0, costUSD: 0 };
  }

  let todayCost = 0;
  let monthCost = 0;
  for (const row of (usageRows.rows ?? []) as unknown as {
    kind: string;
    period: string;
    count: number;
    total_cost_usd: number;
  }[]) {
    const k = row.kind as UsageKind;
    const n = Number(row.count) || 0;
    const c = Number(row.total_cost_usd) || 0;
    if (!byKindToday[k]) byKindToday[k] = { count: 0, costUSD: 0 };
    if (!byKindMonth[k]) byKindMonth[k] = { count: 0, costUSD: 0 };
    if (row.period === day) {
      byKindToday[k].count += n;
      byKindToday[k].costUSD += c;
      todayCost += c;
    }
    if (row.period.startsWith(month)) {
      byKindMonth[k].count += n;
      byKindMonth[k].costUSD += c;
      monthCost += c;
    }
  }

  const remainingToday = Math.max(
    0,
    quota.dailyLimit - weighted.todayWeighted + weighted.todayReward,
  );
  const remainingMonth = Math.max(
    0,
    quota.monthlyLimit - weighted.monthWeighted + weighted.monthReward,
  );

  const trendRes = await db.execute({
    sql: `SELECT period, kind, count, total_cost_usd FROM ai_usage
          WHERE user_id = ? AND period >= ? ORDER BY period`,
    args: [userId, getDaysAgo(7)],
  });

  const trendByDay: Record<string, { weighted: number; cost: number }> = {};
  for (const row of (trendRes.rows ?? []) as unknown as {
    period: string;
    kind: string;
    count: number;
    total_cost_usd: number;
  }[]) {
    const p = row.period;
    if (!trendByDay[p]) trendByDay[p] = { weighted: 0, cost: 0 };
    trendByDay[p].weighted += (Number(row.count) || 0) * (USAGE_WEIGHTS[row.kind as UsageKind] ?? 1);
    trendByDay[p].cost += Number(row.total_cost_usd) || 0;
  }

  const trend = Object.entries(trendByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  return NextResponse.json({
    plan: quota.plan,
    dailyLimit: quota.dailyLimit,
    monthlyLimit: quota.monthlyLimit,
    today: {
      byKind: byKindToday,
      weightedUsed: weighted.todayWeighted,
      reward: weighted.todayReward,
      costUSD: todayCost,
      remaining: remainingToday,
    },
    month: {
      byKind: byKindMonth,
      weightedUsed: weighted.monthWeighted,
      reward: weighted.monthReward,
      costUSD: monthCost,
      remaining: remainingMonth,
    },
    trend,
  });
}

function getDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
