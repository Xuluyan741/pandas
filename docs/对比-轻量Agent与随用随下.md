# 轻量 Agent 生态对比与「随用随下」技术建议

> 参考 HKUDS 系（Nanobot、ClawWork）的**极致性能**与**代码透明度**取向，对比同类项目，并记录「随用随下」的落地思路与小熊猫的对应关系。

---

## 一、小熊猫在生态中的位置

| 维度 | 小熊猫 | Nanobot | OpenClaw |
|------|--------|---------|----------|
| 形态 | Next.js Web，日程垂直 | Python CLI + 多通道 | TypeScript 全平台 |
| 体量 | 单应用，技能内置+ClawHub | ~4k 行核心 | 数十万行级 |
| Token 策略 | 按次配额 + 加权 + 即用即删（ClawHub 仅当轮注入） | 经济压力（ClawWork）/ 轻量路由 | 能力全开，易堆 context |
| 技能扩展 | 内置 9 个 + ClawHub 语义搜索、按轮注入 SKILL.md | 内置 + ClawHub，可 MCP | ClawHub + MCP + 大量内置 |
| 记忆 | agent_memory (key-value) + 策略 key 约定 | memory skill + HEARTBEAT | Session + 多端 |

小熊猫的定位：**日程/任务垂直 + 轻量 Token（加权+奖励+即用即删）+ Web 优先**，与「通用 CLI/多通道」的 Nanobot/OpenClaw 形成差异。

---

## 二、三类「同类」项目对照

### 1. 极致轻量派（Nanobot 亲兄弟）

| 项目 | 特点 | Token/性能 | 动态技能 | 与小熊猫的关联 |
|------|------|------------|----------|----------------|
| **NanoClaw** (qwibitai/nanoclaw) | Docker/容器隔离执行，~3.9k 行，多通道 + Agent Swarms | 与 Nanobot 同档 | 容器内随用随拆，适合「任务结束即销毁」 | 安全与隔离可借鉴；小熊猫为 Web 单进程，暂无容器化技能 |
| **memU** (NevaMind-AI/memU) | 长期记忆框架：分层记忆 + 双模式检索（RAG 快 / LLM 深） | 仅必要时用 LLM，显著省 Token | 记忆即「能力」，非传统插件 | 与 agent_memory + 策略复用方向一致；可考虑接入 memU 做「深度回忆」 |

**小结**：NanoClaw 的「执行即隔离、用完即毁」与「随用随下」高度一致；memU 解决的是「记性 + Token」问题，可与现有 memory 与配额设计互补。

---

### 2. 现代架构派（MCP = 随用随下的关键）

| 项目 | 特点 | Token 控制 | 动态工具/技能 | 与小熊猫的关联 |
|------|------|------------|----------------|----------------|
| **PydanticAI** | 类型安全、极简 Agent 框架；**原生 MCP Client/Server** | 可仅在被请求时注入某 type 的工具描述 | MCP 作为 toolset，按需挂载 | 小熊猫已有 mcp_call 技能；可进一步做「按意图只挂载当前需要的 MCP 工具」 |
| **Claude Code** (Anthropic) | 官方 CLI Agent，按当前目录/上下文**自动决定加载哪些能力** | 动态加载 ≈ 按需 Token | 成熟的产品级「动态工具发现」 | 产品形态不同，但「按上下文决定加载什么」的思路可借鉴到技能推荐与注入 |

**小结**：随用随下的实现关键在 **MCP**：技能 = MCP Server，按请求/会话挂载，用完断开；小熊猫已支持 MCP 调用，可演进为「探测 → 挂载当轮所需 MCP → 用毕不保留」。

---

### 3. 工具箱/桌面派（功能更全的平替）

| 项目 | 特点 | Token/上下文 | 与小熊猫的关联 |
|------|------|--------------|----------------|
| **AnythingLLM** | 本地 LLM 桌面端，强插件系统，支持 MCP | 上下文压缩、可配置「总结过去对话」频率 | 若要做桌面/本地部署版，可参考其插件与压缩策略 |
| **PicoClaw** (Go) | 从 Nanobot 重构，约 10MB 内存、1 秒启动 | 极低资源占用 | 与 小熊猫 场景不同（嵌入式/边缘 vs Web 日程），可作轻量参考 |
| **TrustClaw** | 文档中与 PicoClaw 并提，多为 OpenClaw 精简分支 | 修复过度消耗 Token，保留自动化 | 与「省 Token + 保留核心能力」目标一致 |

---

## 三、「随用随下」技术建议（与现有实现的对应）

建议的**四阶段工作流**与**小熊猫现状**对照：

| 阶段 | 建议做法 | 小熊猫现状 | 可演进方向 |
|------|----------|------------|------------|
| **探测** | 基础 Prompt 只放一个 `search_skill_market` 类工具 | 已有 ClawHub 语义搜索 + `discoverClawHubSkillsForTask` | 可把「搜索技能市场」抽象为统一工具，支持自建 APM + ClawHub |
| **下载** | Agent 调用工具从仓库拉取临时脚本/包 | 未做「下载到本地」；ClawHub 只拉 SKILL.md 内容 | 若要做可执行技能：可拉取 manifest 指定脚本或 MCP server 配置，落盘到临时目录 |
| **挂载** | 动态加载（如 Python `importlib`）或挂载 MCP，此时才把该技能描述注入 context | **即用即删**：当轮只注入 top-K 的 SKILL.md 片段，不持久化 | 保持「仅当轮注入」；若引入 MCP 技能，可「当轮挂载指定 MCP server，用毕断开」 |
| **销毁** | 执行完后 `del sys.modules[module_name]`、删文件；或断开 MCP | 无长期挂载，当轮结束即「逻辑销毁」 | 若有临时下载文件，可在请求结束时删除；MCP 会话按请求建立、不常驻 |

**结论**：小熊猫的 **ClawHub 即用即删（按用户输入搜技能 → 仅当轮注入 SKILL.md → 不落库）** 已经实现「随用随下」的**探测 + 挂载 + 销毁**；**MCP 工具**已支持按意图只挂载部分工具（见下文及 `docs/MCP-按意图挂载.md`）。

---

## 四、小熊猫已实现：按意图只挂载 MCP 工具

- **接口**：`GET /api/agent/mcp/tools/for-intent?text=...&max=5` 返回本轮应挂载的工具子集；`POST /api/agent/mcp/chat` body `{ text }` 完成「意图筛选 → 挂载 → 补全 → 执行 tool_calls → 再补全」。
- **意图筛选**：`src/lib/mcp-intent.ts` 的 `selectMcpToolsForIntent(userText, tools)` 按 name/description 与用户文本关键词匹配，取 top-K，仅当轮有效。
- **调用流程**与实现位置见 **`docs/MCP-按意图挂载.md`**。

## 五、用 MCP 实现「技能随用随下」的推荐形态

- **技能形态**：每个「可执行技能」 = 一个 **MCP Server**（或一个 manifest 指向的 MCP 端点）。
- **流程**：
  1. **探测**：用现有 `discoverClawHubSkillsForTask` 或统一 `search_skill_market` 得到候选技能（含 MCP 配置或 slug）。
  2. **下载/解析**：从 ClawHub 或自建仓库取 manifest，得到 `mcp_server_url` 或启动参数。
  3. **挂载**：仅在本请求内，为该用户/会话创建到该 MCP 的客户端，把其 **tools** 注入当轮 LLM 调用（不写入全局技能表）。
  4. **销毁**：请求结束关闭连接，不保留该 MCP 的 tool 描述到下一轮。

这样 **Token 只花在「当轮用到的工具」**，与 PydanticAI 的「MCP 作为按需 toolset」、Claude Code 的「按上下文加载能力」一致。

---

## 六、Python 侧「热加载/热卸载」参考（供自建技能运行时用）

若在 **Python 环境**（如 Nanobot 或自建 Worker）里做「下载脚本 → 执行 → 卸载」，可参考：

```python
import importlib.util
import sys

def load_skill_once(path: str, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    return mod

def unload_skill(module_name: str):
    if module_name in sys.modules:
        del sys.modules[module_name]
```

- **挂载**：`load_skill_once("/tmp/skill_excel.py", "skill_excel")`，再在当次请求里把该模块暴露的工具描述传给 LLM。
- **销毁**：请求结束后 `unload_skill("skill_excel")`，并删除 `/tmp/skill_excel.py`。

小熊猫当前是 **Next.js/TypeScript**，不直接跑 Python；若要做「可执行技能」，更稳妥的是：**技能以 MCP Server 形式存在**，Next 端只做 MCP Client，按请求连接/断开，实现逻辑上的「随用随下」。

---

## 七、小结表

| 需求 | 可参考项目 | 小熊猫当前 | 建议 |
|------|------------|------------|------|
| 轻量 + 省 Token | Nanobot、PicoClaw、PydanticAI | 加权配额 + 即用即删 + 成本可视化 | 保持；可加「按意图只挂载部分 MCP 工具」 |
| 安全/隔离执行 | NanoClaw | 无容器化技能 | 若上「可执行技能」，优先 MCP 或独立 Worker，慎在 Next 进程内执行任意代码 |
| 长期记忆 + 省 Token | memU | agent_memory + 策略 key | 可评估 memU 做「深度回忆」与检索策略 |
| 动态技能/随用随下 | MCP（PydanticAI、Claude Code） | ClawHub 即用即删（内容注入） | 技能执行层以 MCP Server 为单位，按请求挂载/断开 |
| 代码透明度 | HKUDS 系（Nanobot、ClawWork） | 单仓、规则清晰、文档在 docs/ | 保持；新能力尽量用 MCP/配置扩展，少堆内置分支 |

---

## 八、参考链接

- [Nanobot](https://github.com/HKUDS/nanobot)
- [NanoClaw](https://github.com/qwibitai/nanoclaw) / [Docker 沙箱](https://www.docker.com/blog/run-nanoclaw-in-docker-shell-sandboxes/)
- [memU](https://github.com/NevaMind-AI/memU)
- [PydanticAI MCP](https://ai.pydantic.dev/mcp/overview/)
- [PicoClaw](https://picoclaw.org/)
- 小熊猫：ClawHub 即用即删见 `docs/Phase7-与远期规划.md`、`src/lib/skills/clawhub.ts`
