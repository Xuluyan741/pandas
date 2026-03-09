/**
 * PMF 埋点与基础日志（PRD 1.5）
 * - 记录事件：成功解析/AI 建议日程/推送点击等，供 Aha Moment、Day 7 留存统计
 * - 用户标识脱敏：仅存储或打印 mask 后的 id，不记录任务全文、语音内容
 */
import { createHash } from "crypto";
import { db } from "./db";

/** 允许的埋点事件名（避免随意字符串入库） */
export type PmfEventName =
  | "parse_tasks_success"
  | "scheduler_success"
  | "schedule_created_with_ai"
  | "push_click"
  | "agent_chat_schedule_suggested"
  | "conflict_accepted"
  | "goal_milestone_done";

/** 允许的 payload 字段（禁止任务全文、语音内容） */
export type PmfPayload = {
  source?: "voice" | "text";
  has_conflict?: boolean;
  task_count?: number;
  [key: string]: string | number | boolean | undefined;
};

/**
 * 对 userId 脱敏，用于日志或统计展示（不逆向）
 * guest 保持 guest；其余取前 2 + 后 2 字符的 hash 片段
 */
export function maskUserId(userId: string | null | undefined): string {
  if (!userId || userId === "guest") return "guest";
  const h = createHash("sha256").update(userId).digest("hex");
  return `u_${h.slice(0, 4)}${h.slice(-2)}`;
}

/**
 * 记录一条 PMF 事件（事件名 + 时间 + userId 脱敏存储）
 * payload 仅允许安全字段，不记录任务内容、语音内容
 */
export async function logEvent(
  userId: string | null | undefined,
  eventName: PmfEventName,
  payload?: PmfPayload,
): Promise<void> {
  const id = userId ?? "guest";
  const masked = maskUserId(id);
  const now = new Date().toISOString();

  try {
    await db.execute({
      sql: `INSERT INTO pmf_events (id, user_id, event_name, payload, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        `ev_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        masked,
        eventName,
        payload ? JSON.stringify(payload) : null,
        now,
      ],
    });
  } catch (e) {
    console.error("[analytics] logEvent failed", eventName, (e as Error).message);
  }

  // 基础日志：事件名 + 时间 + userId 脱敏（不打印 payload 中的敏感信息）
  console.info(`[pmf] event=${eventName} userId=${masked} at=${now}`);
}
