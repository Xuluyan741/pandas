# 能力对比：小熊猫智能管家 vs nanobot

> 便于看清当前差异与后续可补齐点。小熊猫为 Next.js Web 应用，nanobot 为 Python CLI + 多通道网关。

---

## 一、总览对照

| 维度 | 小熊猫（当前） | nanobot |
|------|----------------|--------|
| **形态** | Web 端（Next.js）+ Web Push | CLI + Gateway，多通道接入 |
| **入口** | 浏览器 / PWA | 终端 `nanobot agent`、Telegram/Discord/Email 等 |
| **用户与数据** | NextAuth + Turso/SQLite，多用户 | 单用户，`~/.nanobot` 配置与 workspace |
| **部署** | 单应用（Vercel/Node） | 需跑 Python 进程（gateway + 可选 cron） |

---

## 二、能力逐项对比

### 1. 对话与 Agent

| 能力 | 小熊猫 | nanobot |
|------|--------|--------|
| 流式对话 | ✅ 有（SSE，PandaChat） | ✅ 有（CLI 交互 / 各通道） |
| 拟人化（Thought/Action/Observation） | ✅ 有 | ✅ 有（agent loop） |
| 多轮会话 / 上下文 | ✅ 有（单次请求内） | ✅ 有（session 持久化） |
| 子 Agent / 后台任务 | ❌ 无 | ✅ 有（subagent） |

### 2. 通道与触达

| 能力 | 小熊猫 | nanobot |
|------|--------|--------|
| Web 端对话 | ✅ 主入口 | ✅ 通过 bridge/Web 可接 |
| Web Push | ✅ 有（每日/Agent 推送 + 定时提醒） | ❌ 无（用各通道代替） |
| Telegram | ❌ 无 | ✅ 有 |
| Discord | ❌ 无 | ✅ 有 |
| 飞书 / 钉钉 / Slack / QQ / Email / WhatsApp / Matrix 等 | ❌ 无 | ✅ 有 |
| 推送频率与退避 | ✅ 有（决策引擎，每日条数可控） | ✅ 有（heartbeat 约 30 分钟） |

### 3. 定时与 Heartbeat

| 能力 | 小熊猫 | nanobot |
|------|--------|--------|
| 用户自定义定时提醒 | ✅ 有（cron 表达式 / 固定间隔，`/api/cron/jobs`） | ✅ 有（`nanobot cron add/list/remove`） |
| 到点发推送 | ✅ 有（agent-push 中处理 scheduled_reminders） | ✅ 有（cron 任务投递到通道） |
| Heartbeat 文件（如 HEARTBEAT.md） | ❌ 无（用「定时提醒 + Agent 决策」代替） | ✅ 有（每 30 分钟检查并执行） |
| 由 Agent 自己维护周期性任务列表 | ❌ 无 | ✅ 有（可编辑 HEARTBEAT.md） |

### 4. 技能（Skills）与工具（Tools）

| 能力 | 小熊猫 | nanobot |
|------|--------|--------|
| 冲突检测 / 日程建议 | ✅ schedule_conflict | ✅ 类似（逻辑在 agent 内） |
| Deep Link（打车/外卖/订票等） | ✅ deep_link_executor | ✅ 类似 |
| 消息草稿 | ✅ message_draft | ✅ message 相关 |
| 长期目标（搜资料 + 规划 + 监督） | ✅ long_term_goal_planner | ❌ 无现成等价（可自建 skill） |
| Agent 持久化记忆 | ✅ agent_memory（DB + skill） | ✅ memory skill |
| 天气 / GitHub / 总结 / tmux / ClawHub 等 | ❌ 无 | ✅ 有内置 skill |
| Shell / 文件系统 / 网页搜索 | ❌ 无 | ✅ 有（tools） |
| MCP 协议（挂载外部工具） | ❌ 仅文档占位（docs/MCP.md） | ✅ 有（stdio + HTTP） |
| 技能发现 / 安装（如 ClawHub） | ❌ 无 | ✅ 有 |

### 5. 模型与路由

| 能力 | 小熊猫 | nanobot |
|------|--------|--------|
| 多模型路由（按意图选模型） | ✅ 有（lib/ai/router，如 Gemini Flash 预判 + DeepSeek 等） | ✅ 有（LiteLLM + 多 provider） |
| 支持的 Provider | 当前：DeepSeek、Gemini 等（见 lib/ai） | OpenRouter、Anthropic、OpenAI、DeepSeek、Groq、vLLM 等大量 |
| OAuth 登录型模型（如 Codex/Copilot） | ❌ 无 | ✅ 有 |
| 本地模型（vLLM 等） | ❌ 无 | ✅ 有 |

### 6. 日程与任务（小熊猫强项）

| 能力 | 小熊猫 | nanobot |
|------|--------|--------|
| 项目 / 任务 CRUD | ✅ 有（含长期目标） | ❌ 非重点（偏通用助手） |
| 甘特图 / 日历视图 | ✅ 有 | ❌ 无 |
| WBS 批量录入 | ✅ 有 | ❌ 无 |
| 语音输入 → 解析任务 | ✅ 有（Whisper + parse-tasks） | ✅ 有（如 Groq 转录） |
| 冲突消解 + LLM 建议 | ✅ 有（scheduler API + 技能） | 需自建或接工具 |
| 长期目标拆解 + 资料推荐 + 每日监督 | ✅ 有 | ❌ 无 |

### 7. 其他

| 能力 | 小熊猫 | nanobot |
|------|--------|--------|
| Docker / 一键部署 | 可 Docker 化（Next.js） | ✅ 有（docker-compose） |
| systemd 服务示例 | ❌ 无 | ✅ 有 |
| Agent 社交网络（Moltbook/ClawdChat） | ❌ 无 | ✅ 有 |
| 安全沙箱（如 restrictToWorkspace） | ❌ 无 | ✅ 有 |

---

## 三、总结：主要差别

**小熊猫有、nanobot 没有或较弱的：**

- 完整日程/任务/项目体系（含甘特图、WBS、长期目标、冲突消解）
- Web 端统一入口 + Web Push
- 多用户、账号体系（NextAuth）
- 长期目标管家（搜资料、规划、监督）

**nanobot 有、小熊猫当前没有的：**

- 多通道（Telegram、Discord、飞书、Slack、Email 等）
- Shell / 文件系统 / 网页搜索等「执行类」工具
- MCP 实际接入（当前仅文档）
- Heartbeat 文件（由 Agent 维护的周期性任务列表）
- 子 Agent、技能市场（ClawHub）、OAuth 模型、本地 vLLM 等

**两边都有的（概念对齐）：**

- 定时提醒（cron / 固定间隔）
- Agent 持久化记忆
- 多模型/路由思路
- 拟人化对话与推送决策

若要「尽量对齐 nanobot」，优先可做：**MCP 客户端**、**Heartbeat 式周期性任务列表**（或等价产品设计）、以及按需选 1～2 个通道（如 Telegram）做试点。
