/**
 * 路由/模型调用日志（A/B 分析与成本归因，参考 ClawWork 改进）
 */
import { db } from "./db";
import type { UsageKind } from "./quota";

export async function logRouterCall(
  userId: string | null | undefined,
  kind: UsageKind,
  model: string,
  costUSD: number,
): Promise<void> {
  const id = userId ?? "guest";
  if (id === "guest") return;
  try {
    await db.execute({
      sql: `INSERT INTO router_log (id, user_id, kind, model, cost_usd)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        `rl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        id,
        kind,
        model,
        costUSD,
      ],
    });
  } catch (e) {
    console.warn("[router-log] log failed", (e as Error).message);
  }
}
