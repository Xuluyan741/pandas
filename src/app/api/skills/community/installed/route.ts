/**
 * GET /api/skills/community/installed — 当前用户已安装的社区技能（PRD 第十一章）
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await db.execute({
    sql: "SELECT slug, source, enabled, created_at FROM community_skills_installed WHERE user_id = ? AND enabled = 1 ORDER BY created_at DESC",
    args: [session.user.id],
  });
  const rows = (r.rows || []) as Record<string, unknown>[];
  const installed = rows.map((row) => ({
    slug: row.slug as string,
    source: (row.source as string) || "clawhub",
    enabled: (row.enabled as number) === 1,
    createdAt: row.created_at as string,
  }));
  return NextResponse.json({ installed });
}
