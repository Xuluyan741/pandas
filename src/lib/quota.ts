/**
 * AI 配额与用量管理
 * - 免费用户：每日调用次数有限（按 userId 或 guest 聚合）
 * - 付费用户：更高的日/月配额
 */
import { db } from "./db";

export type QuotaPlan = "free" | "pro";

export type UsageKind = "agent_chat" | "parse_tasks" | "agent_push" | "scheduler";

/**
 * 每种调用类型的权重（参考 ClawWork 改进：按价值区分配额）
 * 配额按「加权次数」扣减，高价值行为可返还额度
 */
export const USAGE_WEIGHTS: Record<UsageKind, number> = {
  agent_chat: 1,
  parse_tasks: 1,
  scheduler: 0.5,
  agent_push: 0.3,
};

/** 配额耗尽时统一返回的温和付费引导文案（PRD 1.4） */
export const QUOTA_EXHAUSTED_MESSAGE =
  "小熊猫的精力耗尽啦～休息一下再来，或升级会员解锁更多次数哦。";

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

/** 新客试用：7 天或 20 次完整 Pro 体验（PRD 1.4） */
const TRIAL_DAYS = 7;
const TRIAL_CAP = 20;

/**
 * 开发/测试模式：设置 QUOTA_DEV_UNLIMITED=1 时放宽限额，便于本地或测试环境连续使用小熊猫
 * 生产环境不要设置此变量
 */
const DEV_UNLIMITED =
  process.env.QUOTA_DEV_UNLIMITED === "1" || process.env.NODE_ENV === "development";

/** 查询用户配额（试用 > 订阅 > 免费） */
export async function getQuota(userId: string | null | undefined): Promise<QuotaInfo> {
  const id = userId ?? "guest";

  if (DEV_UNLIMITED) {
    return { plan: "pro", dailyLimit: 9999, monthlyLimit: 99999 };
  }

  if (id === "guest") {
    return { plan: "free", dailyLimit: 10, monthlyLimit: 200 };
  }

  try {
    const res = await db.execute({
      sql: "SELECT subscription_status, subscription_plan, subscription_end_date, trial_until, trial_count_used FROM users WHERE id = ?",
      args: [id],
    });
    const row = res.rows[0] as {
      subscription_status?: string;
      subscription_plan?: string;
      subscription_end_date?: string;
      trial_until?: string | null;
      trial_count_used?: number | null;
    } | undefined;

    const now = new Date();

    // 1. 新客试用：未过期且未用满 20 次则享受 Pro 额度
    const trialUntil = row?.trial_until ? new Date(row.trial_until) : null;
    const trialUsed = Number(row?.trial_count_used ?? 0);
    if (trialUntil && trialUntil > now && trialUsed < TRIAL_CAP) {
      return { plan: "pro", dailyLimit: 200, monthlyLimit: 4000 };
    }

    // 2. 付费订阅
    const isActive =
      row?.subscription_status === "active" &&
      row.subscription_end_date &&
      new Date(row.subscription_end_date) > now;
    if (isActive && row?.subscription_plan === "pro") {
      return { plan: "pro", dailyLimit: 200, monthlyLimit: 4000 };
    }
  } catch {
    // 查询失败时回退到免费配额
  }

  return { plan: "free", dailyLimit: 10, monthlyLimit: 200 };
}

/**
 * 记录一次调用（按 userId + kind + 日 period 聚合）；可选累计成本；试用用户同时扣减 trial_count_used
 */
export async function recordUsage(
  userId: string | null | undefined,
  kind: UsageKind,
  now = new Date(),
  costUSD?: number,
): Promise<void> {
  const id = userId ?? "guest";
  const { day } = getPeriods(now);

  await db.execute({
    sql: `
      INSERT INTO ai_usage (user_id, kind, period, count, total_cost_usd)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(user_id, kind, period) DO UPDATE SET
        count = count + 1,
        total_cost_usd = total_cost_usd + COALESCE(excluded.total_cost_usd, 0)
    `,
    args: [id, kind, day, costUSD ?? 0],
  });

  // 新客试用：扣减试用次数（仅登录用户且仍在试用期内）
  if (id !== "guest") {
    const r = await db.execute({
      sql: "SELECT trial_until, trial_count_used FROM users WHERE id = ?",
      args: [id],
    });
    const row = r.rows[0] as { trial_until?: string | null; trial_count_used?: number | null } | undefined;
    const trialUntil = row?.trial_until ? new Date(row.trial_until) : null;
    const used = Number(row?.trial_count_used ?? 0);
    if (trialUntil && trialUntil > now && used < TRIAL_CAP) {
      await db.execute({
        sql: "UPDATE users SET trial_count_used = COALESCE(trial_count_used, 0) + 1 WHERE id = ?",
        args: [id],
      });
    }
  }
}

/** 高价值行为返还额度（参考 ClawWork：奖励采纳冲突建议、完成里程碑等） */
export type RewardReason = "conflict_accepted" | "goal_milestone" | "schedule_created";

export async function recordReward(
  userId: string | null | undefined,
  amount: number,
  reason: RewardReason,
  now = new Date(),
): Promise<void> {
  const id = userId ?? "guest";
  if (id === "guest" || amount <= 0) return;
  const { day } = getPeriods(now);
  await db.execute({
    sql: `INSERT INTO quota_rewards (id, user_id, period, amount, reason)
          VALUES (?, ?, ?, ?, ?)`,
    args: [`rw_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, id, day, amount, reason],
  });
}

/** 获取指定 kind 在指定日期的已使用次数（用于推送每日≤3 条等） */
export async function getUsageCount(
  userId: string | null | undefined,
  kind: UsageKind,
  period: "day" | "month",
  now = new Date(),
): Promise<number> {
  const id = userId ?? "guest";
  const { day, month } = getPeriods(now);
  const key = period === "day" ? day : month;

  const res = await db.execute({
    sql: "SELECT period, count FROM ai_usage WHERE user_id = ? AND kind = ?",
    args: [id, kind],
  });

  let total = 0;
  for (const row of (res.rows ?? []) as unknown as { period: string; count: number }[]) {
    const p = row.period as string;
    if (period === "day" && p === key) total += Number(row.count) || 0;
    if (period === "month" && p.startsWith(key)) total += Number(row.count) || 0;
  }
  return total;
}

/** Agent 推送每日上限（PRD：≤3 条） */
export const MAX_DAILY_PUSHES = 3;

/** 计算本日/本月加权已用额度（含奖励返还） */
export async function getWeightedUsageAndRewards(
  userId: string | null | undefined,
  now = new Date(),
): Promise<{ todayWeighted: number; monthWeighted: number; todayReward: number; monthReward: number }> {
  const id = userId ?? "guest";
  const { day, month } = getPeriods(now);

  const [usageRes, rewardRes] = await Promise.all([
    db.execute({
      sql: `SELECT kind, period, count FROM ai_usage
            WHERE user_id = ? AND (period = ? OR substr(period, 1, 7) = ?)`,
      args: [id, day, month],
    }),
    db.execute({
      sql: `SELECT period, amount FROM quota_rewards
            WHERE user_id = ? AND (period = ? OR substr(period, 1, 7) = ?)`,
      args: [id, day, month],
    }),
  ]);

  let todayWeighted = 0;
  let monthWeighted = 0;
  for (const row of (usageRes.rows ?? []) as unknown as { kind: string; period: string; count: number }[]) {
    const w = USAGE_WEIGHTS[row.kind as UsageKind] ?? 1;
    const n = Number(row.count) || 0;
    if (row.period === day) todayWeighted += n * w;
    if (row.period.startsWith(month)) monthWeighted += n * w;
  }

  let todayReward = 0;
  let monthReward = 0;
  for (const row of (rewardRes.rows ?? []) as unknown as { period: string; amount: number }[]) {
    const a = Number(row.amount) || 0;
    if (row.period === day) todayReward += a;
    if (row.period.startsWith(month)) monthReward += a;
  }

  return { todayWeighted, monthWeighted, todayReward, monthReward };
}

/** 检查用户本日/本月剩余额度（加权次数 - 奖励；不产生副作用） */
export async function canConsume(
  userId: string | null | undefined,
  kind: UsageKind,
  now = new Date(),
): Promise<ConsumeCheckResult> {
  const id = userId ?? "guest";
  const quota = await getQuota(id);
  const { todayWeighted, monthWeighted, todayReward, monthReward } =
    await getWeightedUsageAndRewards(id, now);

  const weight = USAGE_WEIGHTS[kind];
  const remainingToday = Math.max(
    0,
    quota.dailyLimit - todayWeighted + todayReward,
  );
  const remainingMonth = Math.max(
    0,
    quota.monthlyLimit - monthWeighted + monthReward,
  );
  const allowed = remainingToday >= weight && remainingMonth >= weight;

  return { allowed, remainingToday, remainingMonth };
}

