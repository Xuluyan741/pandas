/**
 * MCP（Model Context Protocol）最小 HTTP 客户端
 * 支持 tools/list 与 tools/call，用于接入外部 MCP 服务器
 */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: { type?: string; properties?: Record<string, unknown> };
}

let rpcId = 0;
function nextId() {
  return ++rpcId;
}

/**
 * 向 MCP 服务器发送 JSON-RPC 请求
 */
async function mcpRequest<T>(
  url: string,
  method: string,
  params?: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId(),
      method,
      params: params ?? {},
    }),
  });
  if (!res.ok) {
    throw new Error(`MCP HTTP ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { result?: T; error?: { message: string } };
  if (data.error) {
    throw new Error(data.error.message || "MCP error");
  }
  return data.result as T;
}

/**
 * 列出 MCP 服务器提供的工具
 */
export async function mcpListTools(
  baseUrl: string,
  headers?: Record<string, string>,
): Promise<{ tools: McpTool[] }> {
  const url = baseUrl.replace(/\/$/, "");
  const result = await mcpRequest<{ tools: McpTool[] }>(url, "tools/list", {}, headers);
  return result ?? { tools: [] };
}

/**
 * 调用 MCP 工具
 */
export async function mcpCallTool(
  baseUrl: string,
  name: string,
  args: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<{ content: { type: string; text?: string }[]; isError?: boolean }> {
  const url = baseUrl.replace(/\/$/, "");
  const result = await mcpRequest<{ content?: { type: string; text?: string }[]; isError?: boolean }>(
    url,
    "tools/call",
    { name, arguments: args },
    headers,
  );
  return result ?? { content: [], isError: true };
}

/** 从环境读取单条 MCP 配置（兼容旧逻辑；多服务器请用 getMcpConfigList） */
export function getMcpConfig(): { url: string; headers?: Record<string, string> } | null {
  const url = process.env.MCP_SERVER_URL;
  if (!url?.trim()) return null;
  let headers: Record<string, string> | undefined;
  const raw = process.env.MCP_SERVER_HEADERS;
  if (raw?.trim()) {
    try {
      headers = JSON.parse(raw) as Record<string, string>;
    } catch {
      // ignore
    }
  }
  return { url: url.trim(), headers };
}
