/**
 * GET /api/agent/mcp/tools/for-intent?text=...&max=5
 * 按意图返回本轮应挂载的 MCP 工具子集（多服务器合并后筛选）
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMcpConfigList } from "@/lib/mcp-config";
import { mcpListTools } from "@/lib/mcp-client";
import { selectMcpToolsForIntent } from "@/lib/mcp-intent";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  const configList = await getMcpConfigList(userId);
  if (configList.length === 0) {
    return NextResponse.json({ tools: [], error: "未配置 MCP_SERVER_URL 或未安装任何 MCP 服务器" });
  }

  const text = req.nextUrl.searchParams.get("text") ?? "";
  const max = Math.min(20, Math.max(1, parseInt(req.nextUrl.searchParams.get("max") ?? "5", 10) || 5));
  if (!text.trim()) {
    return NextResponse.json({ tools: [], message: "未提供 text" });
  }

  const merged: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> = [];
  for (const config of configList) {
    try {
      const { tools: ts } = await mcpListTools(config.url, config.headers);
      for (const t of ts) {
        merged.push({
          name: `${config.slug}_${t.name}`,
          description: t.description ? `[${config.name}] ${t.description}` : `[${config.name}]`,
          inputSchema: t.inputSchema,
        });
      }
    } catch {
      // ignore
    }
  }
  const tools = selectMcpToolsForIntent(text, merged, { maxTools: max });
  return NextResponse.json({
    tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  });
}
