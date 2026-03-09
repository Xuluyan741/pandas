/**
 * GET /api/mcp/store — MCP 商店：推荐可安装的 MCP 服务器列表
 * 当前为内置静态列表；后续可对接 registry.modelcontextprotocol.io 等
 */
import { NextResponse } from "next/server";

export interface McpStoreItem {
  id: string;
  name: string;
  description: string;
  /** 可直接安装的 HTTP MCP 根地址；空则需用户自建或填 URL */
  url?: string;
  /** 文档或仓库链接 */
  link?: string;
}

/** 内置推荐列表（可后续改为从官方 Registry API 拉取） */
const STORE_ITEMS: McpStoreItem[] = [
  {
    id: "filesystem",
    name: "文件系统",
    description: "读写本地或指定目录文件，适合文档整理、代码片段保存。需自建 HTTP 转接或使用支持 HTTP 的 MCP 网关。",
    link: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
  },
  {
    id: "brave-search",
    name: "Brave 搜索",
    description: "联网搜索，适合查资料、验证信息。需自建或使用提供 HTTP 的 MCP 代理。",
    link: "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
  },
  {
    id: "fetch",
    name: "网页抓取",
    description: "抓取 URL 内容，适合摘要网页、提取正文。需 HTTP 形态的 MCP 服务。",
    link: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
  },
  {
    id: "custom",
    name: "自定义 URL",
    description: "已有 HTTP MCP 服务器地址时，可直接填写 URL 安装。",
  },
];

export async function GET() {
  return NextResponse.json({
    items: STORE_ITEMS,
    message: "安装后可在对话中按意图自动挂载该服务器的工具。部分需自建或填写可用的 HTTP MCP 地址。",
  });
}
