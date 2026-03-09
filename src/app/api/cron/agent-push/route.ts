/**
 * GET/POST /api/cron/agent-push
 * Agent 自主推送：由小熊猫智能决策推送内容（情绪关怀 / 日程提醒 / 成就鼓励）
 * 可由 Vercel Cron 或手动调用，需 CRON_SECRET 校验
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pickTopPush } from "@/lib/agent-push";
import { sendPushNotification, isPushConfigured } from "@/lib/push";
import type { Task, LongTermGoal } from "@/types";
import { canConsume, recordUsage, getUsageCount, MAX_DAILY_PUSHES } from "@/lib/quota";
import {
  nextRunFromCron,
  nextRunFromInterval,
} from "@/lib/cron-reminders";
import { isOverdue, isDueToday } from "@/lib/progress";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";

/** 数据库行转 Task（含长期目标字段） */
function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    name: row.name as string,
    projectId: row.project_id as string,
    startDate: row.start_date as string,
    startTime: (row.start_time as string) || undefined,
    endTime: (row.end_time as string) || undefined,
    duration: Number(row.duration) || 1,
    dependencies: JSON.parse((row.dependencies as string) ?? "[]"),
    status: row.status as Task["status"],
    priority: row.priority as Task["priority"],
    isRecurring: (row.is_recurring as number) === 1,
    progress: Number(row.progress) || 0,
    parentGoalId: (row.parent_goal_id as string) || undefined,
    resourceUrl: (row.resource_url as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** 用 LLM 润色推送文案，使其更有温度 */
async function polishWithLLM(
  title: string,
  body: string,
): Promise<{ title: string; body: string }> {
  if (!DEEPSEEK_API_KEY) return { title, body };

  try {
    const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          {
            role: "system",
            content: [
              "你是小熊猫，一个温暖的日程管家。",
              "润色下面的推送通知，让它更有温度、更像朋友说话。",
              '保持简短（标题<15字，正文<60字），输出 JSON：{"title":"...","body":"..."}',
            ].join("\n"),
          },
          {
            role: "user",
            content: `标题：${title}\n正文：${body}`,
          },
        ],
        temperature: 0.8,
        max_tokens: 150,
        stream: false,
      }),
    });

    if (!res.ok) return { title, body };

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    const jsonStr = content.startsWith("```")
      ? content.split("\n").slice(1, -1).join("\n")
      : content;

    const polished = JSON.parse(jsonStr) as { title?: string; body?: string };
    return {
      title: polished.title || title,
      body: polished.body || body,
    };
  } catch {
    return { title, body };
  }
}

export async function GET(req: NextRequest) {
  return runAgentPush(req);
}

export async function POST(req: NextRequest) {
  return runAgentPush(req);
}

async function runAgentPush(req: NextRequest) {
  /* ── 鉴权 ── */
  const secret =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim() ||
    req.headers.get("x-cron-secret") ||
    req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json({ error: "Push not configured" }, { status: 503 });
  }

  /* ── 加载所有订阅 ── */
  const subsRes = await db.execute({
    sql: "SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions",
    args: [],
  });
  const rows = (subsRes.rows || []) as Record<string, unknown>[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no_subscribers" });
  }

  const byUser = new Map<
    string,
    { endpoint: string; p256dh: string; auth: string }[]
  >();
  for (const r of rows) {
    const uid = r.user_id as string;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push({
      endpoint: r.endpoint as string,
      p256dh: r.p256dh as string,
      auth: r.auth as string,
    });
  }

  let sent = 0;
  const now = new Date();
  const nowISO = now.toISOString();

  for (const [userId, subs] of byUser) {
    /* ── 1. 先处理 nanobot 风格定时提醒（到点的先发） ── */
    const remRes = await db.execute({
      sql: "SELECT id, name, message, cron_expr, interval_seconds, next_run_at FROM scheduled_reminders WHERE user_id = ? AND next_run_at <= ?",
      args: [userId, nowISO],
    });
    const remRows = (remRes.rows || []) as Record<string, unknown>[];
    for (const r of remRows) {
      const id = r.id as string;
      const name = r.name as string;
      const message = r.message as string;
      const cronExpr = r.cron_expr as string | null;
      const intervalSeconds = r.interval_seconds as number | null;
      const nextRunAt = new Date(r.next_run_at as string);
      const nextAt = cronExpr
        ? nextRunFromCron(cronExpr, now)
        : nextRunFromInterval(intervalSeconds ?? 3600, nextRunAt);
      await db.execute({
        sql: "UPDATE scheduled_reminders SET next_run_at = ? WHERE id = ?",
        args: [nextAt.toISOString(), id],
      });
      for (const sub of subs) {
        const ok = await sendPushNotification(sub, {
          title: name || "提醒",
          body: message,
          url: "/",
        });
        if (ok) sent++;
      }
    }

    /* ── 2. 若已发过定时提醒，本用户本轮不再发 Agent 决策推送（避免一次两条） ── */
    if (remRows.length > 0) continue;

    /* ── 加载用户任务 ── */
    const tRes = await db.execute({
      sql: "SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at ASC",
      args: [userId],
    });
    const taskRows = (tRes.rows || []) as Record<string, unknown>[];
    const tasks: Task[] = taskRows.map(rowToTask);

    /* ── 加载长期目标（Phase 6：监督推送用） ── */
    const gRes = await db.execute({
      sql: "SELECT id, title, deadline, category, status, created_at FROM long_term_goals WHERE user_id = ? AND status = ?",
      args: [userId, "active"],
    });
    const goals = ((gRes.rows || []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      title: r.title as string,
      deadline: r.deadline as string,
      category: (r.category as "exam" | "fitness" | "project" | "travel" | "custom") || "custom",
      status: (r.status as "active" | "paused" | "completed") || "active",
      createdAt: r.created_at as string,
    }));

    /* ── 配额检查（对话类） ── */
    const quota = await canConsume(userId, "agent_push", now);
    if (!quota.allowed) continue;

    /* ── 每日推送上限 ≤3 条（PRD Phase 3） ── */
    const sentToday = await getUsageCount(userId, "agent_push", "day", now);
    if (sentToday >= MAX_DAILY_PUSHES) continue;

    /* ── Agent 决策（含长期目标监督） ── */
    const decision = pickTopPush(tasks, now, goals as LongTermGoal[]);
    if (!decision || !decision.shouldPush) continue;

    /* ── 今日建议（工作 vs 学习轻量抽象，参考 ClawWork 改进） ── */
    const notDone = tasks.filter((t) => t.status !== "Done");
    const overdueCount = notDone.filter((t) => isOverdue(t)).length;
    const todayCount = notDone.filter((t) => isDueToday(t) && !isOverdue(t)).length;
    const hasGoals = (goals as LongTermGoal[]).length > 0;
    let bodyWithSuggestion = decision.body;
    if (hasGoals && (overdueCount > 0 || todayCount > 0)) {
      bodyWithSuggestion += "\n\n💡 今日建议：先处理这条，再抽空推进一下长期目标～";
    } else if (overdueCount > 0 && hasGoals) {
      bodyWithSuggestion += "\n\n💡 今日建议：清一清逾期，再回来做计划～";
    }

    /* ── LLM 润色文案 ── */
    const polished = await polishWithLLM(decision.title, bodyWithSuggestion);

    /* ── 记录用量 + 发送推送 ── */
    await recordUsage(userId, "agent_push", now);
    for (const sub of subs) {
      const ok = await sendPushNotification(sub, {
        title: polished.title,
        body: polished.body,
        url: "/",
      });
      if (ok) sent++;
    }
  }

  return NextResponse.json({ ok: true, sent });
}
