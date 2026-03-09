/**
 * GET/POST /api/cron/heartbeat — 每 30 分钟执行（nanobot Heartbeat 等价）
 * 加载各用户未完成的 heartbeat 任务，调用 Agent 执行并推送结果，非循环任务标记为已完成
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendPushNotification, isPushConfigured } from "@/lib/push";
import { DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL } from "@/lib/models";

function getCronSecret(req: NextRequest): string | null {
  return (
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim() ||
    req.headers.get("x-cron-secret") ||
    req.nextUrl.searchParams.get("secret")
  );
}

/** 调用 LLM 执行「周期性任务」并返回简要汇报（非流式） */
async function runHeartbeatWithLLM(taskContents: string[]): Promise<string> {
  if (!DEEPSEEK_API_KEY) return "（未配置 API，仅记录任务列表）";
  const text = taskContents.join("\n");
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
            content: "你是小熊猫管家。用户有以下周期性任务需要你处理或汇报。请用一两句话给出执行结果或建议，不要冗长。",
          },
          {
            role: "user",
            content: `请处理并简要汇报：\n${text}`,
          },
        ],
        temperature: 0.5,
        max_tokens: 300,
      }),
    });
    if (!res.ok) return "（调用失败）";
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content?.trim();
    return content || "（无回复）";
  } catch (e) {
    return `（执行异常：${(e as Error).message}）`;
  }
}

export async function GET(req: NextRequest) {
  return runHeartbeat(req);
}

export async function POST(req: NextRequest) {
  return runHeartbeat(req);
}

async function runHeartbeat(req: NextRequest) {
  const secret = getCronSecret(req);
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json({ ok: true, sent: 0, reason: "push_not_configured" });
  }

  const r = await db.execute({
    sql: "SELECT id, user_id, content, is_recurring FROM heartbeat_tasks WHERE done = 0 ORDER BY user_id, created_at",
    args: [],
  });
  const rows = (r.rows || []) as Record<string, unknown>[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no_tasks" });
  }

  const byUser = new Map<string, { id: string; content: string; isRecurring: boolean }[]>();
  for (const row of rows) {
    const uid = row.user_id as string;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push({
      id: row.id as string,
      content: row.content as string,
      isRecurring: (row.is_recurring as number) === 1,
    });
  }

  const subsRes = await db.execute({
    sql: "SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions",
    args: [],
  });
  const subRows = (subsRes.rows || []) as Record<string, unknown>[];
  const subsByUser = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
  for (const r of subRows) {
    const uid = r.user_id as string;
    if (!subsByUser.has(uid)) subsByUser.set(uid, []);
    subsByUser.get(uid)!.push({
      endpoint: r.endpoint as string,
      p256dh: r.p256dh as string,
      auth: r.auth as string,
    });
  }

  let sent = 0;
  const toMarkDone: string[] = [];

  for (const [userId, tasks] of byUser) {
    const subs = subsByUser.get(userId);
    if (!subs?.length) continue;
    const contents = tasks.map((t) => t.content);
    const summary = await runHeartbeatWithLLM(contents);
    const title = "Heartbeat 汇报";
    const body = summary.slice(0, 200);
    for (const sub of subs) {
      const ok = await sendPushNotification(sub, { title, body, url: "/" });
      if (ok) sent++;
    }
    for (const t of tasks) {
      if (!t.isRecurring) toMarkDone.push(t.id);
    }
  }

  for (const id of toMarkDone) {
    await db.execute({
      sql: "UPDATE heartbeat_tasks SET done = 1 WHERE id = ?",
      args: [id],
    });
  }

  return NextResponse.json({ ok: true, sent, markedDone: toMarkDone.length });
}
