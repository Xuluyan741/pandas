/**
 * GET/POST /api/channels/bind — 通道绑定（Telegram 等）
 * GET：当前用户的绑定列表；POST：添加/更新绑定
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await db.execute({
    sql: "SELECT id, channel, channel_chat_id, created_at FROM channel_bindings WHERE user_id = ?",
    args: [session.user.id],
  });
  const rows = (r.rows || []) as Record<string, unknown>[];
  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      channel: row.channel,
      channelChatId: row.channel_chat_id,
      createdAt: row.created_at,
    })),
  );
}

/** POST：body { channel: "telegram", channelChatId: "123456" } */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { channel: string; channelChatId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const channel = (body.channel || "telegram").toLowerCase();
  const channelChatId = String(body.channelChatId || "").trim();
  if (!channelChatId) {
    return NextResponse.json({ error: "channelChatId 必填" }, { status: 400 });
  }
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO channel_bindings (id, user_id, channel, channel_chat_id)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, channel) DO UPDATE SET channel_chat_id = excluded.channel_chat_id`,
    args: [id, session.user.id, channel, channelChatId],
  });
  return NextResponse.json({ ok: true, channel, channelChatId });
}
