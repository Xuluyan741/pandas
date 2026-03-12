/**
 * GET → 单个目标
 * PATCH → 更新目标（如 status: paused | completed）
 * DELETE → 删除目标
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import type { LongTermGoal } from "@/types";
import type { GoalCategory } from "@/types";

function rowToGoal(r: Record<string, unknown>): LongTermGoal {
  return {
    id: r.id as string,
    title: r.title as string,
    deadline: r.deadline as string,
    category: (r.category as GoalCategory) || "custom",
    status: (r.status as LongTermGoal["status"]) || "active",
    createdAt: r.created_at as string,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const res = await db.execute({
    sql: "SELECT id, title, deadline, category, status, created_at FROM long_term_goals WHERE id = ? AND user_id = ?",
    args: [id, auth.userId],
  });
  const row = (res.rows?.[0] ?? null) as Record<string, unknown> | null;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rowToGoal(row));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const status = body.status as LongTermGoal["status"] | undefined;
  if (!["active", "paused", "completed"].includes(status ?? "")) {
    return NextResponse.json({ error: "无效的 status" }, { status: 400 });
  }

  await db.execute({
    sql: "UPDATE long_term_goals SET status = ? WHERE id = ? AND user_id = ?",
    args: [status, id, auth.userId],
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  await db.execute({
    sql: "DELETE FROM long_term_goals WHERE id = ? AND user_id = ?",
    args: [id, auth.userId],
  });
  return NextResponse.json({ ok: true });
}
