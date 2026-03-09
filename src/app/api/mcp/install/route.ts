/**
 * POST /api/mcp/install — 安装 MCP 服务器（加入当前用户的已安装列表）
 * body: { url: string, name?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { url: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const url = (body.url || "").trim();
  if (!url) {
    return NextResponse.json({ error: "url 必填" }, { status: 400 });
  }
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "url 格式无效" }, { status: 400 });
  }
  const name = (body.name || url).trim().slice(0, 64);
  await db.execute({
    sql: `INSERT INTO user_mcp_servers (user_id, url, name, enabled) VALUES (?, ?, ?, 1)
          ON CONFLICT(user_id, url) DO UPDATE SET name = excluded.name, enabled = 1`,
    args: [session.user.id, url, name],
  });
  return NextResponse.json({ ok: true, url, name });
}
