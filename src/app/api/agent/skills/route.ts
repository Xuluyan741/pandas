/**
 * GET /api/agent/skills — nanobot/ClawHub 风格技能发现
 * 返回当前已注册技能列表（id、name、description），供前端或第三方展示/安装流程使用
 */
import { NextResponse } from "next/server";
import { listSkills } from "@/lib/skills/registry";

export async function GET() {
  const skills = listSkills().map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    riskLevel: s.riskLevel,
    requiredInputs: s.requiredInputs,
  }));
  return NextResponse.json({ skills });
}
