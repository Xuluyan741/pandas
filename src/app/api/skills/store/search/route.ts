/**
 * GET /api/skills/store/search?q=...&limit=5 — 技能商店搜索（ClawHub 语义搜索）
 * PRD 第十一章：对接 ClawHub，供前端或 Agent 按任务匹配技能
 */
import { NextRequest, NextResponse } from "next/server";
import { searchSkills } from "@/lib/skills/clawhub";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(
    20,
    Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "5", 10) || 5),
  );
  if (!q) {
    return NextResponse.json({ results: [] });
  }
  const results = await searchSkills(q, limit);
  return NextResponse.json({ results });
}
