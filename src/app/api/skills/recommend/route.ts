/**
 * GET /api/skills/recommend — 根据当前用户日程推荐技能（PRD 第十一章 自主技能发现）
 * 供前端「小熊猫为你推荐」或 agent-push / cron 调用；合并内置关键词 + ClawHub 语义搜索。
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { Task } from "@/types";
import { discoverSkillsFromSchedule } from "@/lib/skills/registry";
import { searchSkills } from "@/lib/skills/clawhub";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const tasksRes = await db.execute({
    sql: `SELECT id, name, start_date, duration, status, priority FROM tasks WHERE user_id = ? AND status != 'Done'`,
    args: [userId],
  });
  const tasks: Task[] = (tasksRes.rows || []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      name: (r.name as string) ?? "",
      projectId: "",
      startDate: (r.start_date as string) ?? "",
      duration: Number(r.duration) ?? 1,
      dependencies: [],
      status: (r.status as string) ?? "To Do",
      priority: (r.priority as string) ?? "中",
      createdAt: "",
      updatedAt: "",
    } as Task;
  });

  const taskText = tasks.map((t) => t.name).join(" ").trim();

  const [recommended, communityResults] = await Promise.all([
    discoverSkillsFromSchedule(userId, tasks),
    process.env.CLAWHUB_API_BASE === "0"
      ? Promise.resolve([])
      : searchSkills(taskText, 5).catch(() => []),
  ]);

  const community = communityResults
    .filter((r) => r.slug)
    .map((r) => ({ slug: r.slug!, displayName: r.displayName ?? r.slug!, summary: r.summary ?? null }));

  return NextResponse.json({
    recommended,
    community: community.length > 0 ? community : undefined,
  });
}
