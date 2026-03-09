/**
 * GET/POST /api/cron/jobs — nanobot 风格定时提醒：列表与添加
 * 支持 cron 表达式（如 0 9 * * *）或固定间隔（every_seconds）
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  nextRunFromCron,
  nextRunFromInterval,
  genReminderId,
} from "@/lib/cron-reminders";

/** 行转前端结构 */
function rowToReminder(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    message: row.message as string,
    cronExpr: (row.cron_expr as string) ?? null,
    intervalSeconds: (row.interval_seconds as number) ?? null,
    nextRunAt: row.next_run_at as string,
    createdAt: row.created_at as string,
  };
}

/** GET：当前用户的定时提醒列表 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const res = await db.execute({
    sql: "SELECT * FROM scheduled_reminders WHERE user_id = ? ORDER BY next_run_at ASC",
    args: [userId],
  });
  const rows = (res.rows || []) as Record<string, unknown>[];
  return NextResponse.json(
    rows.map(rowToReminder),
  );
}

/** POST：添加定时提醒 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  let body: { name: string; message: string; cronExpr?: string; everySeconds?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { name, message, cronExpr, everySeconds } = body;
  if (!name?.trim() || !message?.trim()) {
    return NextResponse.json(
      { error: "name 和 message 必填" },
      { status: 400 },
    );
  }
  const hasCron = cronExpr != null && String(cronExpr).trim() !== "";
  const hasInterval =
    everySeconds != null && Number(everySeconds) > 0;
  if (!hasCron && !hasInterval) {
    return NextResponse.json(
      { error: "请提供 cronExpr（如 0 9 * * *）或 everySeconds（秒）" },
      { status: 400 },
    );
  }
  if (hasCron && hasInterval) {
    return NextResponse.json(
      { error: "cronExpr 与 everySeconds 只能二选一" },
      { status: 400 },
    );
  }
  const nowDate = new Date();
  const nextRunAt = hasCron
    ? nextRunFromCron(String(cronExpr).trim(), nowDate)
    : nextRunFromInterval(Number(everySeconds), nowDate);
  const id = genReminderId();
  await db.execute({
    sql: `INSERT INTO scheduled_reminders (id, user_id, name, message, cron_expr, interval_seconds, next_run_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      userId,
      name.trim(),
      message.trim(),
      hasCron ? String(cronExpr).trim() : null,
      hasInterval ? Number(everySeconds) : null,
      nextRunAt.toISOString(),
    ],
  });
  return NextResponse.json(
    rowToReminder({
      id,
      user_id: userId,
      name: name.trim(),
      message: message.trim(),
      cron_expr: hasCron ? String(cronExpr).trim() : null,
      interval_seconds: hasInterval ? Number(everySeconds) : null,
      next_run_at: nextRunAt.toISOString(),
      created_at: nowDate.toISOString(),
    }),
  );
}
