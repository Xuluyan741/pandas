# MCP（Model Context Protocol）扩展说明

> 对齐 nanobot：支持外部 MCP 服务器，将能力作为 Agent 工具挂载。

---

## MCP 怎么用（人话版）

**MCP 是什么？**  
就是「外部工具箱」：别人写好的一套能力（例如读文件、联网搜索、做 PPT），通过一个 HTTP 地址提供，小熊猫可以按你的话去**调用**这些工具，把结果给你。

**怎么才能直接用？**

1. **你只配一个地址（推荐）**  
   在项目根目录的 `.env.local` 里加一行：  
   `MCP_SERVER_URL=https://你的MCP服务地址`  
   保存后重启 `pnpm dev`。之后在**主界面和平时一样说话**，例如「帮我查一下 XXX」「读一下某文件」，只要你的 MCP 服务提供对应工具，小熊猫会在回复里自动带上「【MCP】」的结果，**不用点别的入口**。

2. **想用多台 MCP**  
   - 要么在 `.env.local` 里配 `MCP_SERVERS`（JSON 数组，写多个地址）；  
   - 要么登录后去「MCP 商店」（若前端做了该页）点「安装」把某台 MCP 加到自己列表。  
   对话时会把「env 里配的 + 你已安装的」一起用，还是**在主界面直接说就行**。

3. **没有 MCP 地址时**  
   主界面照常用：日程、搜索、长期目标都不受影响。只是不会出现「【MCP】」这类工具结果。等你有可用的 MCP 服务地址再配即可。

**小结**：配好 `MCP_SERVER_URL`（或安装过 MCP）之后，**在主界面正常对话就会自动用 MCP**，不需要单独打开别的页面或调 API。

---

## 当前状态

- **内置 Skills**：冲突消解、Deep Link 执行器、消息草稿、长期目标管家、Agent 记忆、MCP 调用等，已在 `src/lib/skills/registry.ts` 注册。
- **MCP 客户端**：已实现。`src/lib/mcp-client.ts` 支持 HTTP MCP 服务器。
- **多 MCP 配置**：支持同时使用多台 MCP 服务器。配置来源：(1) 环境变量 `MCP_SERVER_URL`（单条）、(2) 环境变量 `MCP_SERVERS`（JSON 数组，每项 `{ url, name?, headers? }`）、(3) 用户已安装列表（表 `user_mcp_servers`，通过 MCP 商店或 API 安装）。对话时合并所有服务器的工具，按意图挂载，工具名带服务器前缀避免冲突。
- **MCP 商店**：`GET /api/mcp/store` 返回推荐可安装的 MCP 列表（当前为内置静态列表）；用户登录后可通过 `POST /api/mcp/install`（body: `{ url, name? }`）安装，`GET /api/mcp/installed` 查看已安装，`POST /api/mcp/uninstall` 卸载。

## 主聊天与 MCP 的关系

- **主界面对话**（`/api/agent/chat`）会做：解析日程、长期目标、打车/订餐等 Deep Link、冲突检测、网页搜索、社区技能、**以及 MCP**。
- **MCP 已接入主对话**：只要你配了 `MCP_SERVER_URL`（或通过 env 多台 / 用户安装），在主界面**正常说话**即可。后端会按你这句话筛选当前 MCP 工具，若匹配就自动执行一轮并把结果以「【MCP】」追加到同一条回复里，**不需要单独打开别的页面或调别的 API**。
- 单独接口 **POST /api/agent/mcp/chat** 仍然保留，适合只想要「纯 MCP 对话」的调用方（例如自己的前端或脚本）。

## 接入方案（已实现）

1. **单机/多机配置**：
   - 单条：`.env.local` 中 `MCP_SERVER_URL`（可选 `MCP_SERVER_HEADERS`）。
   - 多条：`MCP_SERVERS` 为 JSON 数组，如 `[{"url":"https://...","name":"文件"},{"url":"https://...","name":"搜索"}]`。
   - 用户安装：登录后调用 `POST /api/mcp/install` 或在前端 MCP 商店点「安装」，写入 `user_mcp_servers`。
2. **配置合并**：`getMcpConfigList(userId)`（`src/lib/mcp-config.ts`）按顺序合并：env 单条 → env 数组 → 用户已安装，返回 `{ slug, name, url, headers }[]`。MCP 对话与 tools 接口均基于该列表合并工具并前缀命名。
3. **按意图挂载**：`src/lib/mcp-intent.ts` 在合并后的工具列表上做关键词匹配，只挂载相关工具。
4. **安全**：生产环境建议对文件类工具限制 `restrictToWorkspace` 或仅在受控环境使用。

## PRD 第十一章：社区技能的搜寻、安装、执行（已实现）

- **搜寻**：对话时按用户输入语义搜索 ClawHub（`discoverClawHubSkillsForTask`），结果当轮注入 prompt，并下发给前端展示。
- **安装**：用户可在回复卡片中点击「安装」推荐技能；服务端 `POST /api/skills/community/install` 将 slug 写入 `community_skills_installed` 表（需登录）。`GET /api/skills/community/installed` 可查询当前用户已安装列表。
- **执行**：若本轮发现的技能中有**已安装**的，服务端会拉取该技能的 `SKILL.md`，以之为 system prompt 再调一次 LLM 完成用户请求，并将结果追加到回复（【技能「XXX」】…）。未安装的技能会以「推荐安装」卡片形式展示，用户确认后安装，下次对话即可自动执行。
- **说明**：当前「执行」是「按 SKILL.md 指引让 LLM 生成结果」，并非沙箱运行代码；若未来 ClawHub 提供可执行包或 MCP 形态，可再接入真正沙箱执行。

## 术语说明（你问的「无 MCP 商店、多 MCP 配置」）

- **MCP 商店**：指能「发现」可用 MCP 服务器并一键安装的地方。**已实现**：`GET /api/mcp/store` 提供推荐列表，`POST /api/mcp/install` 可安装（写入用户已安装表），前端可做「商店页」展示并安装。
- **多 MCP 配置**：指同时使用多台 MCP 服务器（例如一台文件、一台搜索）。**已实现**：env 可配多条 + 用户可安装多条，`getMcpConfigList()` 合并后，对话时工具来自所有服务器并带前缀区分，按意图挂载与调用。

## 后续可扩展

- 商店列表可改为从官方 [MCP Registry](https://registry.modelcontextprotocol.io) API 拉取，或对接 [mcp.so](https://mcp.so) 等子注册表。
- 支持「Agent 自主发现并建议安装」：根据用户输入推荐商店中的某台 MCP，用户确认后调用 install。

## 参考

- [nanobot MCP 说明](https://github.com/HKUDS/nanobot#mcp-model-context-protocol)
- [Model Context Protocol 规范](https://modelcontextprotocol.io/)
- [MCP 服务器列表示例](https://mcp.so)（可作「发现」数据源）
