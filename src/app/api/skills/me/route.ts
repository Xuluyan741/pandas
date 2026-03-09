/**
 * GET/POST /api/skills/me — 当前用户启用的技能
 * GET：列表；POST：{ skillId, enabled } 启用/禁用
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { listSkills } from "@/lib/skills/registry";

/** GET：返回用户启用的 skillId 列表（未配置则视为全部启用） */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await db.execute({
    sql: "SELECT skill_id FROM user_skills WHERE user_id = ? AND enabled = 1",
    args: [session.user.id],
  });
  const rows = (r.rows || []) as Record<string, unknown>[];
  const enabled = rows.map((row) => row.skill_id as string);
  const all = listSkills().map((s) => s.id);
  const effective = enabled.length > 0 ? enabled : all;
  return NextResponse.json({ enabled: effective, all });
}

/** POST：设置某技能启用状态 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { skillId: string; enabled: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const skillId = (body.skillId || "").trim();
  if (!skillId) {
    return NextResponse.json({ error: "skillId 必填" }, { status: 400 });
  }
  const enabled = body.enabled ? 1 : 0;
  await db.execute({
    sql: `INSERT INTO user_skills (user_id, skill_id, enabled) VALUES (?, ?, ?)
          ON CONFLICT(user_id, skill_id) DO UPDATE SET enabled = excluded.enabled`,
    args: [session.user.id, skillId, enabled],
  });
  return NextResponse.json({ ok: true, skillId, enabled: !!body.enabled });
}
