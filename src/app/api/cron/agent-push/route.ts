/**
 * GET/POST /api/cron/agent-push
 * Agent 自主推送：由小熊猫智能决策推送内容（情绪关怀 / 日程提醒 / 成就鼓励）
 * 可由 Vercel Cron 或手动调用，需 CRON_SECRET 校验
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pickTopPush } from "@/lib/agent-push";
import { sendPushNotification, isPushConfigured } from "@/lib/push";
import type { Task } from "@/types";
import { canConsume, recordUsage } from "@/lib/quota";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";

/** 数据库行转 Task */
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

  for (const [userId, subs] of byUser) {
    /* ── 加载用户任务 ── */
    const tRes = await db.execute({
      sql: "SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at ASC",
      args: [userId],
    });
    const taskRows = (tRes.rows || []) as Record<string, unknown>[];
    const tasks: Task[] = taskRows.map(rowToTask);

    /* ── 配额检查 ── */
    const quota = await canConsume(userId, "agent_push", now);
    if (!quota.allowed) {
      continue;
    }

    /* ── Agent 决策 ── */
    const decision = pickTopPush(tasks, now);
    if (!decision || !decision.shouldPush) continue;

    /* ── LLM 润色文案 ── */
    const polished = await polishWithLLM(decision.title, decision.body);

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
