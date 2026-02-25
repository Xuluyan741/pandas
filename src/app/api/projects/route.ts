/**
 * /api/projects
 * GET  → 获取当前用户的所有项目
 * POST → 新增或更新项目（按 id upsert）
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/api-helpers";
import { checkUsageLimit } from "@/lib/subscription";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";

export async function GET() {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;

  const r = await db.execute({
    sql: "SELECT * FROM projects WHERE user_id = ? ORDER BY created_at ASC",
    args: [auth.userId],
  });

  const rows = r.rows as Record<string, unknown>[];
  return NextResponse.json(
    rows.map((p) => ({
      id: p.id,
      name: p.name,
      group: p.group_name,
      description: p.description ?? undefined,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }))
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const id = body.id || randomUUID();
  const now = new Date().toISOString();

  // 免费用户项目数量限制（最多 3 个）
  const ok = await checkUsageLimit(auth.userId, "project_count");
  if (!ok) {
    return NextResponse.json(
      { error: "免费版最多只能创建 3 个项目，请升级 Pro 解锁无限项目。" },
      { status: 403 },
    );
  }

  await db.execute({
    sql: `
      INSERT INTO projects (id, user_id, name, group_name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, group_name = excluded.group_name,
        description = excluded.description, updated_at = excluded.updated_at
    `,
    args: [
      id, auth.userId, body.name, body.group,
      body.description ?? null,
      body.createdAt ?? now, body.updatedAt ?? now,
    ],
  });

  return NextResponse.json({ id });
}
