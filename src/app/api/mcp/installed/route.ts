/**
 * GET /api/mcp/installed — 当前用户已安装的 MCP 服务器（仅 DB，不含 env 配置）
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await db.execute({
    sql: "SELECT url, name, created_at FROM user_mcp_servers WHERE user_id = ? AND enabled = 1 ORDER BY created_at ASC",
    args: [session.user.id],
  });
  const rows = (r.rows || []) as Record<string, unknown>[];
  const installed = rows.map((row) => ({
    url: row.url as string,
    name: (row.name as string) || "",
    createdAt: row.created_at as string,
  }));
  return NextResponse.json({ installed });
}
