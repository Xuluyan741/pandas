/**
 * GET  → 当前用户的长期目标列表
 * POST → 创建长期目标；可选 runPlan 时自动研究+规划并写入子任务
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import { planGoal } from "@/lib/goal-planner";
import type { LongTermGoal, Task } from "@/types";
import type { GoalCategory } from "@/types";

/** 数据库行 → LongTermGoal */
function rowToGoal(r: Record<string, unknown>): LongTermGoal {
  return {
    id: r.id as string,
    title: r.title as string,
    deadline: r.deadline as string,
    category: (r.category as GoalCategory) || "custom",
    status: (r.status as LongTermGoal["status"]) || "active",
    createdAt: r.created_at as string,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await db.execute({
    sql: "SELECT id, title, deadline, category, status, created_at FROM long_term_goals WHERE user_id = ? ORDER BY created_at DESC",
    args: [session.user.id],
  });

  const goals = (res.rows as Record<string, unknown>[]).map(rowToGoal);
  return NextResponse.json(goals);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const deadline = typeof body.deadline === "string" ? body.deadline.trim() : "";
  const category: GoalCategory =
    ["exam", "fitness", "project", "travel", "custom"].includes(body.category) ? body.category : "custom";
  const projectId = typeof body.projectId === "string" ? body.projectId : null;
  const runPlan = Boolean(body.runPlan);

  if (!title || !deadline) {
    return NextResponse.json({ error: "缺少 title 或 deadline" }, { status: 400 });
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  await db.execute({
    sql: "INSERT INTO long_term_goals (id, user_id, title, deadline, category, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [id, session.user.id, title, deadline, category, "active", now],
  });

  const goal: LongTermGoal = {
    id,
    title,
    deadline,
    category,
    status: "active",
    createdAt: now,
  };

  if (!runPlan || !projectId) {
    return NextResponse.json(goal);
  }

  /* ── 拉取现有任务并生成计划 ── */
  const tRes = await db.execute({
    sql: "SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at ASC",
    args: [session.user.id],
  });
  const taskRows = (tRes.rows || []) as Record<string, unknown>[];
  const existingTasks: Task[] = taskRows.map((t) => ({
    id: t.id as string,
    name: t.name as string,
    projectId: t.project_id as string,
    startDate: t.start_date as string,
    startTime: (t.start_time as string) || undefined,
    endTime: (t.end_time as string) || undefined,
    duration: Number(t.duration) || 1,
    dependencies: JSON.parse((t.dependencies as string) ?? "[]"),
    status: t.status as Task["status"],
    priority: t.priority as Task["priority"],
    isRecurring: (t.is_recurring as number) === 1,
    progress: Number(t.progress) || 0,
    parentGoalId: (t.parent_goal_id as string) || undefined,
    resourceUrl: (t.resource_url as string) || undefined,
    createdAt: t.created_at as string,
    updatedAt: t.updated_at as string,
  }));

  const planResult = await planGoal({
    goalId: id,
    title,
    deadline,
    category,
    existingTasks,
  });

  const created: string[] = [];
  for (const st of planResult.tasks) {
    const taskId = randomUUID();
    await db.execute({
      sql: `
        INSERT INTO tasks (id, user_id, project_id, name, start_date, duration, dependencies, status, priority, is_recurring, progress, parent_goal_id, resource_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        taskId,
        session.user.id,
        projectId,
        st.name,
        st.startDate,
        st.duration,
        "[]",
        "To Do",
        st.priority,
        0,
        0,
        id,
        st.resourceUrl || null,
        now,
        now,
      ],
    });
    created.push(taskId);
  }

  return NextResponse.json({ goal, createdTaskIds: created });
}
