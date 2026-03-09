/**
 * POST /api/mcp/uninstall — 卸载当前用户已安装的 MCP 服务器
 * body: { url: string }
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
  let body: { url: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const url = (body.url || "").trim();
  if (!url) {
    return NextResponse.json({ error: "url 必填" }, { status: 400 });
  }
  await db.execute({
    sql: "UPDATE user_mcp_servers SET enabled = 0 WHERE user_id = ? AND url = ?",
    args: [session.user.id, url],
  });
  return NextResponse.json({ ok: true, url });
}
