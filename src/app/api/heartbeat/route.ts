/**
 * GET/POST /api/heartbeat — Heartbeat 周期性任务列表（nanobot HEARTBEAT.md 等价）
 * GET：列表；POST：新增；PATCH/DELETE 用 [id] 子路由
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";

/** GET：当前用户的 heartbeat 任务列表 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await db.execute({
    sql: "SELECT id, content, done, is_recurring, created_at FROM heartbeat_tasks WHERE user_id = ? ORDER BY created_at ASC",
    args: [session.user.id],
  });
  const rows = (r.rows || []) as Record<string, unknown>[];
  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      content: row.content,
      done: (row.done as number) === 1,
      isRecurring: (row.is_recurring as number) === 1,
      createdAt: row.created_at,
    })),
  );
}

/** POST：新增一条周期性任务 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { content: string; isRecurring?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json({ error: "content 必填" }, { status: 400 });
  }
  const id = randomUUID();
  await db.execute({
    sql: "INSERT INTO heartbeat_tasks (id, user_id, content, is_recurring) VALUES (?, ?, ?, ?)",
    args: [id, session.user.id, content, body.isRecurring ? 1 : 0],
  });
  return NextResponse.json({
    id,
    content,
    done: false,
    isRecurring: !!body.isRecurring,
    createdAt: new Date().toISOString(),
  });
}
