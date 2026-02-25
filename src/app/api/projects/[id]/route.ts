/**
 * /api/projects/[id]
 * DELETE → 删除指定项目（同时级联删除旗下任务）
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/api-helpers";
import { db } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  await db.execute({
    sql: "DELETE FROM projects WHERE id = ? AND user_id = ?",
    args: [id, auth.userId],
  });
  return NextResponse.json({ ok: true });
}
