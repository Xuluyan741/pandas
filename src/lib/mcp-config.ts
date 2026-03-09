/**
 * MCP 多服务器配置（环境变量 + 用户已安装）
 * 支持：单 env MCP_SERVER_URL、多 env MCP_SERVERS、用户表 user_mcp_servers
 */
import { db } from "@/lib/db";

export interface McpServerConfig {
  slug: string;
  name: string;
  url: string;
  headers?: Record<string, string>;
}

/** 从 URL 生成短 slug（用于工具名前缀，避免冲突） */
function urlToSlug(url: string, index: number): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/\./g, "_").slice(0, 12);
    return `mcp_${host}_${index}`;
  } catch {
    return `mcp_${index}`;
  }
}

/**
 * 获取当前生效的 MCP 服务器列表（合并 env 与用户已安装）
 * @param userId 登录用户 id，不传则只返回 env 配置
 */
export async function getMcpConfigList(
  userId?: string | null,
): Promise<McpServerConfig[]> {
  const list: McpServerConfig[] = [];
  let index = 0;

  const url = process.env.MCP_SERVER_URL?.trim();
  if (url) {
    let headers: Record<string, string> | undefined;
    const raw = process.env.MCP_SERVER_HEADERS?.trim();
    if (raw) {
      try {
        headers = JSON.parse(raw) as Record<string, string>;
      } catch {
        // ignore
      }
    }
    list.push({
      slug: urlToSlug(url, index++),
      name: "默认 MCP",
      url,
      headers,
    });
  }

  const serversJson = process.env.MCP_SERVERS?.trim();
  if (serversJson) {
    try {
      const arr = JSON.parse(serversJson) as Array<{ url: string; name?: string; headers?: Record<string, string> }>;
      if (Array.isArray(arr)) {
        for (const s of arr) {
          if (s?.url?.trim()) {
            list.push({
              slug: urlToSlug(s.url, index++),
              name: (s.name || s.url).trim().slice(0, 64),
              url: s.url.trim(),
              headers: s.headers,
            });
          }
        }
      }
    } catch {
      // ignore invalid JSON
    }
  }

  if (userId) {
    const r = await db.execute({
      sql: "SELECT url, name, headers FROM user_mcp_servers WHERE user_id = ? AND enabled = 1 ORDER BY created_at ASC",
      args: [userId],
    });
    const rows = (r.rows || []) as Record<string, unknown>[];
    for (const row of rows) {
      const u = (row.url as string)?.trim();
      if (!u) continue;
      if (list.some((c) => c.url === u)) continue;
      let headers: Record<string, string> | undefined;
      const raw = row.headers as string | null;
      if (raw) {
        try {
          headers = JSON.parse(raw) as Record<string, string>;
        } catch {
          // ignore
        }
      }
      list.push({
        slug: urlToSlug(u, index++),
        name: ((row.name as string) || u).trim().slice(0, 64),
        url: u,
        headers,
      });
    }
  }

  return list;
}
