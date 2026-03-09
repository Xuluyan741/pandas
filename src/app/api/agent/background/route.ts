/**
 * POST /api/agent/background — 提交后台任务（子 Agent / 异步执行）
 * 任务由 /api/cron/process-jobs 定时处理，完成后推送通知用户
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { kind: string; payload: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const kind = (body.kind || "message").toString();
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO background_jobs (id, user_id, kind, payload, status, updated_at)
          VALUES (?, ?, ?, ?, 'pending', ?)`,
    args: [id, session.user.id, kind, JSON.stringify(payload), now],
  });
  return NextResponse.json({ id, status: "pending" });
}
