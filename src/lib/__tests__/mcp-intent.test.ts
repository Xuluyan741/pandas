/**
 * 按意图筛选 MCP 工具的单元测试
 */
import { describe, it, expect } from "vitest";
import { selectMcpToolsForIntent } from "@/lib/mcp-intent";
import type { McpTool } from "@/lib/mcp-client";

const mockTools: McpTool[] = [
  { name: "read_file", description: "Read file contents from workspace" },
  { name: "write_file", description: "Write content to a file" },
  { name: "search_web", description: "Search the web for information" },
  { name: "run_shell", description: "Execute shell command" },
];

describe("selectMcpToolsForIntent", () => {
  it("无用户输入时返回空数组", () => {
    expect(selectMcpToolsForIntent("", mockTools)).toEqual([]);
    expect(selectMcpToolsForIntent("   ", mockTools)).toEqual([]);
  });

  it("空工具列表返回空数组", () => {
    expect(selectMcpToolsForIntent("读文件", [])).toEqual([]);
  });

  it("按关键词匹配并排序：命中 name 优先", () => {
    const r = selectMcpToolsForIntent("read file README", mockTools, { maxTools: 3 });
    expect(r.length).toBeLessThanOrEqual(3);
    expect(r[0].name).toBe("read_file");
  });

  it("命中 description 也会入选", () => {
    const r = selectMcpToolsForIntent("search web", mockTools, { maxTools: 5 });
    const names = r.map((t) => t.name);
    expect(names).toContain("search_web");
  });

  it("尊重 maxTools 上限", () => {
    const r = selectMcpToolsForIntent("file read write search shell", mockTools, {
      maxTools: 2,
    });
    expect(r.length).toBe(2);
  });

  it("无匹配时返回空数组", () => {
    const r = selectMcpToolsForIntent("今天天气真好", mockTools, { maxTools: 5 });
    expect(r.length).toBe(0);
  });
});
