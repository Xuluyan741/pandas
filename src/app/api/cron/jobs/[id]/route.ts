/**
 * DELETE /api/cron/jobs/[id] — 删除指定定时提醒
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

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
    sql: "SELECT id FROM scheduled_reminders WHERE id = ? AND user_id = ?",
    args: [id, session.user.id],
  });
  if ((check.rows || []).length === 0) {
    return NextResponse.json({ error: "Not found or forbidden" }, { status: 404 });
  }
  await db.execute({
    sql: "DELETE FROM scheduled_reminders WHERE id = ? AND user_id = ?",
    args: [id, session.user.id],
  });
  return NextResponse.json({ ok: true });
}
