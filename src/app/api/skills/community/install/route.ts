/**
 * POST /api/skills/community/install — 安装社区技能（PRD 第十一章：用户确认后安装）
 * body: { slug: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSkillBySlug } from "@/lib/skills/clawhub";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { slug: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const slug = (body.slug || "").trim().toLowerCase();
  if (!slug) {
    return NextResponse.json({ error: "slug 必填" }, { status: 400 });
  }
  const detail = await getSkillBySlug(slug);
  if (!detail?.skill) {
    return NextResponse.json({ error: "技能不存在或 ClawHub 暂不可用" }, { status: 404 });
  }
  await db.execute({
    sql: `INSERT INTO community_skills_installed (user_id, slug, source, enabled) VALUES (?, ?, 'clawhub', 1)
          ON CONFLICT(user_id, slug) DO UPDATE SET enabled = 1`,
    args: [session.user.id, slug],
  });
  return NextResponse.json({
    ok: true,
    slug,
    displayName: detail.skill.displayName || slug,
  });
}
