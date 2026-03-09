/**
 * nanobot 风格定时提醒：计算下次执行时间
 * 支持 cron 简单表达式（如 0 9 * * * = 每天 9:00）与固定间隔（every N 秒）
 */

const now = () => new Date();

/**
 * 解析简单 cron 表达式，返回下一次执行时间
 * 支持格式：0 H * * *（每天 H 点）、0 H M * *（每天 H:M）
 * 不支持：秒、周几、复杂步长
 */
export function nextRunFromCron(cronExpr: string, after: Date = now()): Date {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) {
    return new Date(after.getTime() + 60 * 60 * 1000);
  }
  const [minStr, hourStr] = parts;
  const min = minStr === "*" ? 0 : parseInt(minStr, 10) || 0;
  const hour = hourStr === "*" ? 9 : parseInt(hourStr, 10) ?? 9;

  const next = new Date(after);
  next.setSeconds(0, 0);
  next.setMinutes(min);
  next.setHours(hour);
  if (next.getTime() <= after.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

/**
 * 根据 interval_seconds 计算下次执行时间
 */
export function nextRunFromInterval(
  intervalSeconds: number,
  lastRunAt: Date,
): Date {
  return new Date(lastRunAt.getTime() + intervalSeconds * 1000);
}

/**
 * 生成唯一 ID（用于 scheduled_reminders.id）
 */
export function genReminderId(): string {
  return `rem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
