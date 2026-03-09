/**
 * PATCH/DELETE /api/heartbeat/[id] — 更新（勾选/取消勾选）或删除
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  let body: { done?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const done = body.done ? 1 : 0;
  await db.execute({
    sql: "UPDATE heartbeat_tasks SET done = ? WHERE id = ? AND user_id = ?",
    args: [done, id, session.user.id],
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const check = await db.execute({
    sql: "SELECT id FROM heartbeat_tasks WHERE id = ? AND user_id = ?",
    args: [id, session.user.id],
  });
  if ((check.rows || []).length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.execute({
    sql: "DELETE FROM heartbeat_tasks WHERE id = ? AND user_id = ?",
    args: [id, session.user.id],
  });
  return NextResponse.json({ ok: true });
}
