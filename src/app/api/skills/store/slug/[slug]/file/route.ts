/**
 * GET /api/skills/store/slug/[slug]/file?path=SKILL.md — 获取技能文件内容（如 SKILL.md）
 * 用于安装前预览或即用即删时拉取说明
 */
import { NextRequest, NextResponse } from "next/server";
import { getSkillFile } from "@/lib/skills/clawhub";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const slug = (await params).slug?.trim();
  const path = _req.nextUrl.searchParams.get("path")?.trim() || "SKILL.md";
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }
  const content = await getSkillFile(slug, path);
  if (content === null) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  return new NextResponse(content, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
