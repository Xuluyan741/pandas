/**
 * GET/POST /api/cron/process-jobs — 处理后台任务队列（建议每分钟调用）
 * 取 pending 任务，按 kind 执行，写回 result 并推送用户
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendPushNotification, isPushConfigured } from "@/lib/push";
import { runSkill } from "@/lib/skills/registry";

function getCronSecret(req: NextRequest): string | null {
  return (
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim() ||
    req.headers.get("x-cron-secret") ||
    req.nextUrl.searchParams.get("secret")
  );
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  const secret = getCronSecret(req);
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const r = await db.execute({
    sql: "SELECT id, user_id, kind, payload FROM background_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 20",
    args: [],
  });
  const rows = (r.rows || []) as Record<string, unknown>[];
  let processed = 0;
  const now = new Date().toISOString();

  for (const row of rows) {
    const id = row.id as string;
    const userId = row.user_id as string;
    const kind = row.kind as string;
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse((row.payload as string) || "{}");
    } catch {
      payload = {};
    }
    let resultText = "";
    try {
      if (kind === "skill" && typeof payload.skillId === "string") {
        const out = await runSkill(
          payload.skillId,
          (payload.input as Record<string, unknown>) ?? {},
          { userId },
        );
        resultText = typeof out === "string" ? out : JSON.stringify(out, null, 2);
      } else if (kind === "message" && payload.message) {
        resultText = String(payload.message);
      } else {
        resultText = "（未知任务类型或参数）";
      }
    } catch (e) {
      resultText = `执行失败：${(e as Error).message}`;
    }
    await db.execute({
      sql: "UPDATE background_jobs SET status = 'completed', result = ?, updated_at = ? WHERE id = ?",
      args: [resultText.slice(0, 10000), now, id],
    });
    processed++;
    if (isPushConfigured()) {
      const subRes = await db.execute({
        sql: "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ? LIMIT 1",
        args: [userId],
      });
      const subRows = (subRes.rows || []) as Record<string, unknown>[];
      if (subRows.length > 0) {
        const sub = subRows[0];
        await sendPushNotification(
          {
            endpoint: sub.endpoint as string,
            p256dh: sub.p256dh as string,
            auth: sub.auth as string,
          },
          {
            title: "后台任务完成",
            body: resultText.slice(0, 100),
            url: "/",
          },
        );
      }
    }
  }

  return NextResponse.json({ ok: true, processed });
}
