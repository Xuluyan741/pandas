/**
 * POST /api/skills/community/uninstall — 卸载社区技能
 * body: { slug: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

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
  await db.execute({
    sql: "UPDATE community_skills_installed SET enabled = 0 WHERE user_id = ? AND slug = ?",
    args: [session.user.id, slug],
  });
  return NextResponse.json({ ok: true, slug });
}
