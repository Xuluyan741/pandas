/**
 * GET/POST /api/agent/memory — nanobot 风格 Agent 持久化记忆
 * GET：获取当前用户全部记忆或指定 key；POST：写入/更新 key-value
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/** GET：?key=xxx 返回单条，否则返回全部（{ key: value }） */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const key = req.nextUrl.searchParams.get("key");
  if (key) {
    const r = await db.execute({
      sql: "SELECT value FROM agent_memory WHERE user_id = ? AND key = ?",
      args: [userId, key],
    });
    const rows = (r.rows || []) as Record<string, unknown>[];
    if (rows.length === 0) {
      return NextResponse.json({ value: null });
    }
    return NextResponse.json({ key, value: rows[0].value as string });
  }
  const r = await db.execute({
    sql: "SELECT key, value FROM agent_memory WHERE user_id = ?",
    args: [userId],
  });
  const rows = (r.rows || []) as Record<string, string>[];
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return NextResponse.json(map);
}

/** POST：{ key, value } 写入或更新一条记忆 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  let body: { key: string; value: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { key, value } = body;
  if (!key?.trim()) {
    return NextResponse.json({ error: "key 必填" }, { status: 400 });
  }
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO agent_memory (user_id, key, value, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [userId, key.trim(), typeof value === "string" ? value : JSON.stringify(value ?? ""), now],
  });
  return NextResponse.json({ ok: true, key: key.trim() });
}
