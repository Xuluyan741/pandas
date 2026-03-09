/**
 * GET /api/agent/mcp/tools — 列出已配置的多个 MCP 服务器提供的工具（合并列表，带 server 信息）
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMcpConfigList } from "@/lib/mcp-config";
import { mcpListTools } from "@/lib/mcp-client";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  const configList = await getMcpConfigList(userId);
  if (configList.length === 0) {
    return NextResponse.json({ tools: [], error: "未配置 MCP：请设置 MCP_SERVER_URL 或在 MCP 商店安装" });
  }
  const tools: Array<{ name: string; description?: string; inputSchema?: unknown; server?: string }> = [];
  for (const config of configList) {
    try {
      const { tools: ts } = await mcpListTools(config.url, config.headers);
      for (const t of ts) {
        tools.push({
          name: `${config.slug}_${t.name}`,
          description: t.description,
          inputSchema: t.inputSchema,
          server: config.name,
        });
      }
    } catch {
      // 单台失败不影响其他
    }
  }
  return NextResponse.json({ tools, servers: configList.map((c) => ({ slug: c.slug, name: c.name })) });
}
