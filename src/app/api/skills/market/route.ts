/**
 * GET /api/skills/market — 技能市场：列出所有可用技能（含内置与说明）
 */
import { NextResponse } from "next/server";
import { listSkills } from "@/lib/skills/registry";

export async function GET() {
  const skills = listSkills();
  return NextResponse.json(
    skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      riskLevel: s.riskLevel,
    })),
  );
}
