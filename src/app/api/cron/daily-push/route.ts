/**
 * GET/POST /api/cron/daily-push
 * 定时任务：为所有已订阅用户发送「今日最重要事项」Web Push
 * 校验：Header Authorization Bearer <CRON_SECRET> 或 x-cron-secret 或 query secret=
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTodayPriorities } from "@/lib/daily-digest";
import { sendPushNotification, isPushConfigured } from "@/lib/push";
import type { Task } from "@/types";

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    name: row.name as string,
    projectId: row.project_id as string,
    startDate: row.start_date as string,
    duration: Number(row.duration) || 1,
    dependencies: JSON.parse((row.dependencies as string) ?? "[]"),
    status: row.status as Task["status"],
    priority: row.priority as Task["priority"],
    isRecurring: (row.is_recurring as number) === 1,
    progress: Number(row.progress) || 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function GET(req: NextRequest) {
  return runDailyPush(req);
}

export async function POST(req: NextRequest) {
  return runDailyPush(req);
}

async function runDailyPush(req: NextRequest) {
  const secret =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim() ||
    req.headers.get("x-cron-secret") ||
    req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json({ error: "Push not configured" }, { status: 503 });
  }

  const subsRes = await db.execute({
    sql: "SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions",
    args: [],
  });
  const rows = (subsRes.rows || []) as Record<string, unknown>[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const byUser = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
  for (const r of rows) {
    const uid = r.user_id as string;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push({
      endpoint: r.endpoint as string,
      p256dh: r.p256dh as string,
      auth: r.auth as string,
    });
  }

  let sent = 0;
  for (const [userId, subs] of byUser) {
    const tRes = await db.execute({
      sql: "SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at ASC",
      args: [userId],
    });
    const taskRows = (tRes.rows || []) as Record<string, unknown>[];
    const tasks: Task[] = taskRows.map(rowToTask);
    const { title, body } = getTodayPriorities(tasks);

    for (const sub of subs) {
      const ok = await sendPushNotification(sub, { title, body, url: "/" });
      if (ok) sent++;
    }
  }

  return NextResponse.json({ ok: true, sent });
}
