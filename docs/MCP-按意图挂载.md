# MCP 按意图只挂载部分工具 — 接口与调用流程

## 目标

只把与当前用户输入**相关**的 MCP 工具注入当轮对话，用后即删，节省 Token（随用随下）。

## 接口

### 1. 按意图获取本轮应挂载的工具列表

```
GET /api/agent/mcp/tools/for-intent?text=<用户输入>&max=5
```

- **text**（必填）：当前用户输入或任务描述，用于关键词匹配。
- **max**（可选）：最多返回的工具数，默认 5，上限 20。

**响应示例：**

```json
{
  "tools": [
    {
      "name": "read_file",
      "description": "Read file contents from workspace",
      "inputSchema": { "type": "object", "properties": { "path": { "type": "string" } } }
    }
  ]
}
```

- 若未配置 `MCP_SERVER_URL` 或未提供 `text`，返回 `tools: []`。

### 2. 带按意图挂载的 MCP 对话（一步到位）

```
POST /api/agent/mcp/chat
Content-Type: application/json

{ "text": "帮我查一下项目根目录的 README 内容" }
```

**流程简述：**

1. **探测**：用 `text` 请求 MCP 服务器拿到全部工具列表。
2. **意图筛选**：`selectMcpToolsForIntent(text, allTools)` 按 name/description 与 `text` 关键词匹配，取 top‑K（默认 5）。
3. **挂载**：仅将筛选后的工具转为 OpenAI/DeepSeek 的 `tools` 入参。
4. **补全**：调用 `getUnifiedCompletionWithTools(messages, tools)`。
5. **执行**：若返回 `tool_calls`，对每个调用 `mcpCallTool`，将结果以 `role: "tool"` 追加到消息。
6. **再补全**：带 tool 结果再请求一轮（最多 2 轮工具调用），返回最终 `content`。

**响应示例：**

```json
{
  "content": "README 的内容是……",
  "toolsMounted": ["read_file"],
  "toolCallsUsed": 1
}
```

## 调用流程示意

```
[客户端] 用户输入 text
    ↓
[GET /api/agent/mcp/tools/for-intent?text=...]  （可选：仅需工具列表时）
    ↓
[服务端] mcpListTools → selectMcpToolsForIntent → 返回 tools 子集
    ↓
[客户端] 若自己做对话：仅将上述 tools 注入当轮 prompt/API
────────────────────────────────────────────────────────────
[或] [POST /api/agent/mcp/chat] body: { text }
    ↓
[服务端] 意图筛选 → 挂载工具 → LLM 补全 → 若有 tool_calls 则执行 MCP → 再补全 → 返回 content
```

## 实现位置

| 能力 | 文件 |
|------|------|
| 意图筛选 | `src/lib/mcp-intent.ts` — `selectMcpToolsForIntent(text, tools, { maxTools })` |
| 按意图列工具 API | `src/app/api/agent/mcp/tools/for-intent/route.ts` |
| 带工具补全 | `src/lib/ai/unified.ts` — `getUnifiedCompletionWithTools(messages, tools)` |
| 按意图对话 API | `src/app/api/agent/mcp/chat/route.ts` |
| MCP 客户端 | `src/lib/mcp-client.ts` — `mcpListTools`、`mcpCallTool`、`getMcpConfig` |

## 意图匹配规则

- 对用户文本做简单分词（小写、去标点、按空格分）。
- 对每个 MCP 工具：用其 `name` 与 `description` 与用户 token 做包含匹配；命中 `name` 权重更高。
- 按得分排序后取前 `maxTools` 个，仅当轮有效，不持久化。

## 与主对话的关系

- 主日程解析对话（`POST /api/agent/chat`）**不**注入 MCP 工具，仍为「解析任务 + 冲突检测 + Deep Link」。
- 需要「随用随下」的 MCP 能力时，可：
  - 前端调 `GET /api/agent/mcp/tools/for-intent?text=...` 拿到当轮工具列表，再在自建 Agent 里只注入这些工具；或
  - 直接调 `POST /api/agent/mcp/chat` 由服务端完成意图挂载与工具执行。
