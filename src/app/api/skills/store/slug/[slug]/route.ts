/**
 * GET /api/skills/store/slug/[slug] — 按 slug 获取技能详情（ClawHub）
 */
import { NextRequest, NextResponse } from "next/server";
import { getSkillBySlug } from "@/lib/skills/clawhub";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const slug = (await params).slug?.trim();
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }
  const detail = await getSkillBySlug(slug);
  if (!detail) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
