# 与 nanobot 能力对齐说明

> 对照 [nanobot](https://github.com/HKUDS/nanobot) 的典型能力，说明小熊猫当前实现与后续规划。

## 已具备

| 能力 | 说明 |
|------|------|
| **多模型 / 意图路由** | `src/lib/ai/`：多 Provider（DeepSeek / Anthropic / OpenAI / Google）、意图分类、主/备降级。主流程（`/api/agent/chat`、`/api/ai/parse-tasks`）通过 `getUnifiedCompletion` 接入：仅配 DeepSeek 时直连；配置任一项其他 key 时走路由。 |
| **持久化记忆** | `agent_memory` 表 + `GET/POST /api/agent/memory` + `agent_memory` Skill。对话前会加载当前用户记忆并注入 system prompt。 |
| **用户定时任务 (Cron)** | `scheduled_reminders` 表 + `GET/POST /api/cron/jobs`、`DELETE /api/cron/jobs/[id]`。支持 cron 表达式或固定间隔；`/api/cron/agent-push` 会执行到期的提醒并更新下次执行时间。 |
| **技能发现 API** | `GET /api/agent/skills` 返回已注册技能列表（id、name、description、riskLevel、requiredInputs），供前端或 ClawHub 风格安装流程使用。 |

## 后续规划

| 能力 | 说明 |
|------|------|
| **MCP (Model Context Protocol)** | 计划接入 MCP Server（环境变量占位 `MCP_SERVER_URL`），使 Agent 可调用外部工具（文件、搜索等）。需在 API 路由中实现 HTTP/SSE 传输。 |
| **Heartbeat 周期性执行** | nanobot 的 `HEARTBEAT.md` 式「定期唤醒执行任务并推送结果」。可复用 `scheduled_reminders` 扩展类型（如 `type: heartbeat`）或单独表，由 cron 触发 Agent 执行并将结果通过 Web Push 或站内通知下发。 |
| **多通道 (Gateway)** | Telegram / Discord / 飞书等：需独立网关进程或 Serverless 回调，与当前 Web 单端分离，列为后续阶段。 |
| **ClawHub 动态安装** | 当前技能为代码内注册；从远程 manifest 拉取并动态注册技能的安装流程，可在技能发现 API 之上再扩展。 |

## 环境变量（与 nanobot 对齐）

- **多模型**：`DEEPSEEK_API_KEY` 必填；`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` 任选，配置后自动走意图路由。
- **MCP（占位）**：`MCP_SERVER_URL` 预留，后续接入 MCP 时使用。

详见 `.env.local.example`。
