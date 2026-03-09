/**
 * PRD 第十一章：查询用户已安装的社区技能
 */
import { db } from "@/lib/db";

export interface InstalledCommunitySkill {
  slug: string;
  source: string;
  enabled: boolean;
  createdAt: string;
}

/** 获取用户已安装的社区技能 slug 列表（仅 enabled） */
export async function getInstalledCommunitySlugs(userId: string): Promise<string[]> {
  const r = await db.execute({
    sql: "SELECT slug FROM community_skills_installed WHERE user_id = ? AND enabled = 1",
    args: [userId],
  });
  const rows = (r.rows || []) as Record<string, unknown>[];
  return rows.map((row) => row.slug as string);
}

/** 获取用户已安装的社区技能完整列表 */
export async function getInstalledCommunitySkills(userId: string): Promise<InstalledCommunitySkill[]> {
  const r = await db.execute({
    sql: "SELECT slug, source, enabled, created_at FROM community_skills_installed WHERE user_id = ? AND enabled = 1 ORDER BY created_at DESC",
    args: [userId],
  });
  const rows = (r.rows || []) as Record<string, unknown>[];
  return rows.map((row) => ({
    slug: row.slug as string,
    source: (row.source as string) || "clawhub",
    enabled: (row.enabled as number) === 1,
    createdAt: row.created_at as string,
  }));
}
