/**
 * 用户偏好（PRD Phase 7+）
 * 冲突消解/执行器建议前读取，符合偏好时可在 UI 标注「已根据您的习惯优化」
 */
import { db } from "./db";

export async function getPreferences(userId: string): Promise<Record<string, unknown>> {
  const res = await db.execute({
    sql: "SELECT key, value FROM user_preferences WHERE user_id = ?",
    args: [userId],
  });
  type PrefRow = { key: string; value: string };
  const rows = (res.rows ?? []) as unknown as PrefRow[];
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }
  return out;
}

export async function setPreference(
  userId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const valueStr = typeof value === "string" ? value : JSON.stringify(value);
  await db.execute({
    sql: `
      INSERT INTO user_preferences (user_id, key, value, updated_at)
      VALUES (?, ?, ?, datetime('now','localtime'))
      ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `,
    args: [userId, key, valueStr],
  });
}

/** 格式化为给 LLM 的简短上下文（冲突/建议时用） */
export function formatPreferencesForLLM(prefs: Record<string, unknown>): string {
  const lines: string[] = [];
  if (prefs.dislike_meetings_after) {
    lines.push(`用户不希望会议安排在 ${prefs.dislike_meetings_after} 之后`);
  }
  if (prefs.travel_seat) {
    lines.push(`出行偏好座位：${prefs.travel_seat}`);
  }
  if (prefs.focus_hours) {
    lines.push(`专注时段偏好：${prefs.focus_hours}`);
  }
  if (lines.length === 0) return "";
  return "用户习惯：\n" + lines.join("\n");
}
