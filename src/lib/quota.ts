/**
 * AI 配额与用量管理
 * - 免费用户：每日调用次数有限（按 userId 或 guest 聚合）
 * - 付费用户：更高的日/月配额
 */
import { db } from "./db";

export type QuotaPlan = "free" | "pro";

export type UsageKind = "agent_chat" | "parse_tasks" | "agent_push";

export interface QuotaInfo {
  plan: QuotaPlan;
  dailyLimit: number;
  monthlyLimit: number;
}

export interface ConsumeCheckResult {
  allowed: boolean;
  remainingToday: number;
  remainingMonth: number;
}

/** 计算今天与本月的 period 标识 */
function getPeriods(now = new Date()): { day: string; month: string } {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return {
    day: `${y}-${m}-${d}`,
    month: `${y}-${m}`,
  };
}

/** 查询用户配额（简单根据订阅状态决定 free / pro） */
export async function getQuota(userId: string | null | undefined): Promise<QuotaInfo> {
  const id = userId ?? "guest";

  try {
    const res = await db.execute({
      sql: "SELECT subscription_status, subscription_plan, subscription_end_date FROM users WHERE id = ?",
      args: [id],
    });
    const row = res.rows[0] as
      | { subscription_status?: string; subscription_plan?: string; subscription_end_date?: string }
      | undefined;

    const now = new Date();
    const isActive =
      row?.subscription_status === "active" &&
      row.subscription_end_date &&
      new Date(row.subscription_end_date) > now;
    const plan: QuotaPlan = isActive && row?.subscription_plan === "pro" ? "pro" : "free";

    if (plan === "pro") {
      return {
        plan: "pro",
        dailyLimit: 200,
        monthlyLimit: 4000,
      };
    }
  } catch {
    // 查询失败时回退到免费配额
  }

  return {
    plan: "free",
    dailyLimit: 10,
    monthlyLimit: 200,
  };
}

/** 记录一次调用（按 userId + kind + 日 period 聚合） */
export async function recordUsage(
  userId: string | null | undefined,
  kind: UsageKind,
  now = new Date(),
): Promise<void> {
  const id = userId ?? "guest";
  const { day } = getPeriods(now);

  await db.execute({
    sql: `
      INSERT INTO ai_usage (user_id, kind, period, count)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(user_id, kind, period) DO UPDATE SET count = count + 1
    `,
    args: [id, kind, day],
  });
}

/** 检查用户本日/本月剩余额度（不产生副作用） */
export async function canConsume(
  userId: string | null | undefined,
  kind: UsageKind,
  now = new Date(),
): Promise<ConsumeCheckResult> {
  const id = userId ?? "guest";
  const quota = await getQuota(id);
  const { day, month } = getPeriods(now);

  const res = await db.execute({
    sql: `
      SELECT period, count FROM ai_usage
      WHERE user_id = ? AND kind = ? AND (period = ? OR substr(period, 1, 7) = ?)
    `,
    args: [id, kind, day, month],
  });

  let todayCount = 0;
  let monthCount = 0;
  for (const row of res.rows as { period: string; count: number }[]) {
    if (row.period === day) {
      todayCount += Number(row.count) || 0;
    }
    if (row.period.startsWith(month)) {
      monthCount += Number(row.count) || 0;
    }
  }

  const remainingToday = Math.max(0, quota.dailyLimit - todayCount);
  const remainingMonth = Math.max(0, quota.monthlyLimit - monthCount);
  const allowed = remainingToday > 0 && remainingMonth > 0;

  return { allowed, remainingToday, remainingMonth };
}

