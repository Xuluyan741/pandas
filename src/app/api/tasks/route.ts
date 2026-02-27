/**
 * /api/tasks
 * GET  → 获取当前用户的所有任务
 * POST → 新增或更新任务（按 id upsert）
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";

export async function GET() {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;

  const r = await db.execute({
    sql: "SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at ASC",
    args: [auth.userId],
  });

  const rows = r.rows as Record<string, unknown>[];
  function numProgress(row: Record<string, unknown>): number {
    if (row.status === "Done") return 100;
    const v = row.progress ?? row.Progress ?? 0;
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  }
    return NextResponse.json(
      rows.map((t) => ({
        id: t.id,
        projectId: t.project_id,
        name: t.name,
        startDate: t.start_date,
        startTime: t.start_time || undefined,
        endTime: t.end_time || undefined,
        duration: Number(t.duration) || 1,
      dependencies: JSON.parse((t.dependencies as string) ?? "[]"),
      status: t.status,
      priority: t.priority,
      isRecurring: (t.is_recurring as number) === 1 || (t.is_recurring as string) === "1",
      progress: numProgress(t),
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }))
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const id = body.id || randomUUID();
  const now = new Date().toISOString();

  await db.execute({
    sql: `
      INSERT INTO tasks (id, user_id, project_id, name, start_date, start_time, end_time, duration, dependencies, status, priority, is_recurring, progress, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, start_date = excluded.start_date, start_time = excluded.start_time, end_time = excluded.end_time, duration = excluded.duration,
        dependencies = excluded.dependencies, status = excluded.status, priority = excluded.priority,
        is_recurring = excluded.is_recurring, progress = excluded.progress, updated_at = excluded.updated_at
    `,
    args: [
      id, auth.userId, body.projectId, body.name,
      body.startDate, body.startTime || null, body.endTime || null, body.duration ?? 1,
      JSON.stringify(body.dependencies ?? []),
      body.status ?? "To Do", body.priority ?? "中",
      body.isRecurring ? 1 : 0, body.progress ?? 0,
      body.createdAt ?? now, body.updatedAt ?? now,
    ],
  });

  return NextResponse.json({ id });
}
