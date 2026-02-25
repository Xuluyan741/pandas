import { db } from "@/lib/db";

export type SubscriptionStatus = "active" | "inactive" | "lifetime" | null;
export type SubscriptionPlan = "free" | "pro" | null;

/**
 * 查询用户订阅信息（从 users 表读取）
 */
export async function getUserSubscription(userId: string) {
  const r = await db.execute({
    sql: "SELECT subscription_status, subscription_plan, subscription_end_date FROM users WHERE id = ? LIMIT 1",
    args: [userId],
  });
  const row = (r.rows[0] || {}) as Record<string, unknown>;
  return {
    status: (row.subscription_status as SubscriptionStatus) ?? null,
    plan: (row.subscription_plan as SubscriptionPlan) ?? "free",
    endDate: (row.subscription_end_date as string | null) ?? null,
  };
}

/**
 * 检查用户是否超出免费额度
 * feature 用于扩展不同限制类型，目前支持：
 * - "project_count"：项目数量限制
 */
export async function checkUsageLimit(userId: string, feature: "project_count"): Promise<boolean> {
  const sub = await getUserSubscription(userId);
  // 付费用户暂不限制
  if (sub.plan === "pro" || sub.status === "lifetime" || sub.status === "active") {
    return true;
  }

  if (feature === "project_count") {
    const r = await db.execute({
      sql: "SELECT COUNT(*) as c FROM projects WHERE user_id = ?",
      args: [userId],
    });
    const row = (r.rows[0] || {}) as Record<string, unknown>;
    const count = Number(row.c ?? 0);
    // 免费版最多 3 个项目
    return count < 3;
  }

  return true;
}

