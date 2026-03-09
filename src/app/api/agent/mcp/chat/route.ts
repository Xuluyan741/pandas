/**
 * POST /api/agent/mcp/chat — 按意图挂载 MCP 工具并执行对话
 * 支持多 MCP 配置：合并 env + 用户已安装的 MCP 服务器，工具名带前缀避免冲突
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMcpConfigList } from "@/lib/mcp-config";
import { mcpListTools, mcpCallTool } from "@/lib/mcp-client";
import { selectMcpToolsForIntent } from "@/lib/mcp-intent";
import type { ToolDefinition } from "@/lib/ai/types";
import { getUnifiedCompletionWithTools } from "@/lib/ai/unified";
import type { CompletionMessage } from "@/lib/ai/types";

const MAX_TOOL_ROUNDS = 2;

/** 带前缀的工具（用于多服务器合并） */
interface PrefixedTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** 将 MCP 工具转为 OpenAI/DeepSeek 工具定义 */
function mcpToolsToDefinitions(
  tools: { name: string; description?: string; inputSchema?: Record<string, unknown> }[],
): ToolDefinition[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description ?? "",
      parameters: t.inputSchema ?? { type: "object", properties: {} },
    },
  }));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  const configList = await getMcpConfigList(userId);
  if (configList.length === 0) {
    return NextResponse.json(
      { error: "未配置 MCP：请设置 MCP_SERVER_URL 或在 MCP 商店安装至少一个服务器" },
      { status: 503 },
    );
  }

  let body: { text: string };
  try {
    body = (await req.json()) as { text: string };
  } catch {
    return NextResponse.json(
      { error: "请求体必须为 JSON，且含 text 字段" },
      { status: 400 },
    );
  }

  const { text } = body;
  if (!text?.trim()) {
    return NextResponse.json(
      { error: "缺少 text" },
      { status: 400 },
    );
  }

  try {
    const mergedTools: PrefixedTool[] = [];
    const callMap: Record<
      string,
      { url: string; headers?: Record<string, string>; originalName: string }
    > = {};

    for (const config of configList) {
      try {
        const { tools } = await mcpListTools(config.url, config.headers);
        for (const t of tools) {
          const prefixedName = `${config.slug}_${t.name}`;
          mergedTools.push({
            name: prefixedName,
            description: t.description ? `[${config.name}] ${t.description}` : `[${config.name}]`,
            inputSchema: t.inputSchema,
          });
          callMap[prefixedName] = {
            url: config.url,
            headers: config.headers,
            originalName: t.name,
          };
        }
      } catch {
        // 单个服务器失败不影响其他
      }
    }

    const selected = selectMcpToolsForIntent(text, mergedTools, { maxTools: 5 });
    const toolDefs = mcpToolsToDefinitions(selected);

    const systemPrompt =
      "你是小熊猫的 MCP 助手。根据用户输入，若需要可调用当前已挂载的工具完成任务；若无须调用则直接回复。回复简洁友好。";
    let messages: CompletionMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ];

    let lastContent = "";
    let round = 0;

    while (round < MAX_TOOL_ROUNDS) {
      const result = await getUnifiedCompletionWithTools(
        messages,
        toolDefs,
        { temperature: 0.3, maxTokens: 1024 },
      );
      lastContent = result.content ?? "";

      if (!result.toolCalls?.length) {
        return NextResponse.json({
          content: lastContent,
          toolsMounted: selected.map((t) => t.name),
          toolCallsUsed: round,
          serversUsed: configList.map((c) => c.name),
        });
      }

      const assistantMsg: CompletionMessage = {
        role: "assistant",
        content: lastContent,
        tool_calls: result.toolCalls,
      };
      messages = [...messages, assistantMsg];

      for (const tc of result.toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.arguments || "{}") as Record<string, unknown>;
        } catch {
          // ignore
        }
        const lookup = callMap[tc.name];
        if (!lookup) {
          messages.push({
            role: "tool",
            content: "工具未找到或已卸载",
            tool_call_id: tc.id,
          });
          continue;
        }
        const callResult = await mcpCallTool(
          lookup.url,
          lookup.originalName,
          args,
          lookup.headers,
        );
        const textContent =
          callResult.content?.map((c) => c.text).filter(Boolean).join("\n") ?? "";
        messages.push({
          role: "tool",
          content: textContent,
          tool_call_id: tc.id,
        });
      }

      round += 1;
    }

    return NextResponse.json({
      content: lastContent,
      toolsMounted: selected.map((t) => t.name),
      toolCallsUsed: round,
      serversUsed: configList.map((c) => c.name),
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
