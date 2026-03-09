/**
 * 按意图只挂载部分 MCP 工具（随用随下）
 * 根据用户输入文本与工具 name/description 做关键词匹配，返回本轮应挂载的工具子集，以节省 Token
 */
import type { McpTool } from "@/lib/mcp-client";

/** 从一段文本中提取用于匹配的 token（小写、去空、简单分词） */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[\s\p{P}]/gu, " ")
    .split(/\s+/)
    .filter((s) => s.length > 0);
}

/** 计算工具与用户文本的匹配得分：name/description 中命中用户 token 的数量 */
function scoreTool(userTokens: string[], tool: McpTool): number {
  const toolText = [tool.name, tool.description ?? ""].join(" ").toLowerCase();
  let score = 0;
  for (const t of userTokens) {
    if (t.length < 2) continue;
    if (toolText.includes(t)) score += 1;
    if (tool.name.toLowerCase().includes(t)) score += 2;
  }
  return score;
}

/**
 * 按意图筛选本轮应挂载的 MCP 工具
 * @param userText 当前用户输入（或任务描述）
 * @param tools MCP 服务器返回的完整工具列表
 * @param options.maxTools 最多返回的工具数，默认 5
 * @returns 按相关性排序的工具子集，仅当轮挂载用后即删
 */
export function selectMcpToolsForIntent(
  userText: string,
  tools: McpTool[],
  options?: { maxTools?: number },
): McpTool[] {
  const maxTools = options?.maxTools ?? 5;
  if (!userText?.trim() || tools.length === 0) return [];

  const userTokens = tokenize(userText);
  if (userTokens.length === 0) return [];

  const scored = tools.map((tool) => ({
    tool,
    score: scoreTool(userTokens, tool),
  }));

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxTools)
    .map((x) => x.tool);
}
