/**
 * Agent 持久化记忆加载（供对话上下文注入）
 * nanobot 风格：跨轮次可用的 key-value 记忆
 *
 * 策略复用 key 约定（参考 ClawWork 改进）：
 * - preference:conflict_accept = "reschedule" | "ignore"：用户常接受挪期建议或常忽略
 * - preference:reschedule_accept：同上，兼容
 * 对话/冲突建议的 system prompt 会注入这些偏好，使建议更贴合用户习惯
 */
import { db } from "./db";

/**
 * 加载用户记忆并格式化为可拼进 system prompt 的字符串
 * @param userId 当前用户 ID
 * @returns 若无可记忆则返回空字符串
 */
export async function loadMemoryForPrompt(userId: string): Promise<string> {
  const res = await db.execute({
    sql: "SELECT key, value FROM agent_memory WHERE user_id = ?",
    args: [userId],
  });
  const rows = (res.rows || []) as unknown as { key: string; value: string }[];
  if (rows.length === 0) return "";
  return rows.map((r) => `${r.key}: ${r.value}`).join("\n");
}
