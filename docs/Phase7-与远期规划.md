# Phase 7 多端与远期规划

> 对应 PRD §1.5 产品形态演进、§3.2 Phase 7、**第十章 Zero-Shot Proactive Agency**、**第十一章自主技能发现**。

---

## 一、Phase 7：小程序 / App 迁移

### 1.1 目标

一套代码多端发布：**微信小程序** + **iOS/Android App**（可选 H5）。优先微信小程序（AI 能力支持成熟、订阅消息对日程提醒是刚需）。

### 1.2 技术选型：Uni-app vs Taro

| 维度 | Uni-app | Taro |
|------|---------|------|
| 语法 | Vue 为主，可选 Vue3 + TS | React / Vue 均可，React 生态更熟可优先 |
| 小程序支持 | 微信/支付宝/百度等 | 微信/支付宝/抖音等 |
| 包体积与性能 | 运行时略重，文档多 | 编译期优化多，可树摇 |
| 与现有栈 | 需重写前端（当前 Next 为 React） | 若选 React，组件/类型可部分复用 |
| 建议 | 团队以 Vue 为主时选 | 与当前 Next.js (React) 一致时选 Taro |

**结论**：当前仓库为 Next.js + React，多端若用 **Taro (React)** 更易共享类型与逻辑；若希望快速上线且团队更熟 Vue，选 **Uni-app** 亦可，API 层完全复用。

### 1.3 与现有 API 的复用方式

- **鉴权**：现有 NextAuth 使用 JWT Session。多端方案：
  - 方案 A：Web 登录后由后端下发一个 **长期有效的 token**（如 JWT，存于 cookie 或接口返回），小程序/App 请求时带 `Authorization: Bearer <token>`。
  - 方案 B：小程序使用微信登录，后端用 `code2session` 拿到 openid，与现有 `users` 表做绑定（新建 `wechat_openid` 等字段），请求时带 `X-Wechat-OpenId` 或由后端从 session 解析。
- **请求封装**：多端统一封装 `request(baseUrl, path, { method, body, headers })`，其中 `headers` 携带上述 token；`baseUrl` 指向当前 Next 部署域名（如 `https://your-domain.com`）。
- **接口清单**：现有需复用的 API 已支持 CORS（若部署在 Vercel/Next 默认行为），可直接复用：
  - `GET/POST /api/projects`、`GET/POST /api/tasks`、`GET/POST /api/goals`
  - `POST /api/agent/chat`（SSE 在小程序端可用 WebSocket 或短轮询替代）
  - `GET /api/skills/me`、`GET /api/skills/recommend`、`POST /api/skills/me`（技能推荐与开关）
  - `POST /api/ai/parse-tasks`、`POST /api/scheduler`

### 1.4 落地步骤（建议顺序）

1. **新建多端工程**  
   - 在 monorepo 下建子包（如 `apps/miniprogram`）或独立仓库。  
   - 使用 Taro 或 Uni-app 初始化，选择微信小程序模板。

2. **鉴权与用户绑定**  
   - 实现小程序登录 → 后端接口（如 `POST /api/auth/wechat`）用 code 换 openid，与 `users` 表绑定或创建用户。  
   - 下发 JWT 或 session 标识，后续请求均携带。

3. **推送通道**  
   - 小程序使用 **订阅消息** 替代 Web Push。  
   - 后端在 `agent-push` / `daily-push` 中增加「渠道：miniprogram」分支：若用户绑定为小程序，则走微信订阅消息 API 下发。

4. **页面与组件**  
   - 按模块迁移：日历/任务列表、对话界面、设置页。  
   - 与 Web 共享类型定义：可抽离 `shared/types`（如 Task、Project、Goal）到 npm 包或 git submodule，供 Next 与 Taro 共同引用。

5. **联调与发布**  
   - 配置小程序 request 合法域名为当前 API 域名。  
   - 完成主要流程联调（登录 → 任务列表 → 对话 → 推送）后提交审核。

**接口预留**：当前 `/api/*` 已支持 CORS 与 Session/JWT，多端可直接调用；无需改后端即可启动多端开发。

---

## 二、第十章：Zero-Shot Proactive Agency（V3）

### 2.1 目标

零配置主动 + **动态插件发现**：意图感知、ClawHub/APM、自动安装与推荐。

### 2.2 与当前半主动推送的差异

| 维度 | 当前实现（V2 半主动） | V3 目标 |
|------|------------------------|---------|
| 触发方式 | 定时/事件扫描日程，生成 ≤3 条推送建议 | 同上 + **按意图搜索外部技能** |
| 技能来源 | 仅内置技能（冲突消解、Deep Link、周报草稿等） | 内置 + **ClawHub / 自建 APM** 动态发现 |
| 推荐逻辑 | 基于任务状态（逾期、今日、情绪关怀等） | 基于任务 **语义** 推断缺什么能力 → 搜索技能库 → 推荐安装 |
| 用户感知 | 收到「要帮你排冲突吗？」等文案 | 收到「我为你找到了『一键周报』，要启用吗？」等 |

### 2.3 ClawHub / APM 方向（已实现对接）

- **ClawHub**：社区技能市场，可语义搜索、安装、调用；小熊猫可「自主搜寻」匹配的技能 ID 或 manifest。
- **自建 APM**：自建技能库，提供：
  - 技能列表 API（支持关键词/embedding 检索）
  - 统一 manifest：`id`、`name`、`description`、`triggers`、`actions`、`permissions`、`inputs`/`outputs`
- **扩展点**：在 `discoverSkillsFromSchedule` 中，当内置关键词无匹配时，可调用「外部技能源接口」并合并推荐列表（见下文代码扩展点）。

**当前已实现（ClawHub 对接 + 即用即删）：**

| 能力 | 实现位置 | 说明 |
|------|----------|------|
| 技能商店搜索 | `GET /api/skills/store/search?q=...&limit=5` | 调用 ClawHub 语义搜索，供前端或 Agent 按任务匹配 |
| 按 slug 获取详情 | `GET /api/skills/store/slug/[slug]` | 技能元信息（displayName、summary、latestVersion） |
| 获取技能文件 | `GET /api/skills/store/slug/[slug]/file?path=SKILL.md` | 用于预览或即用即删时拉取说明 |
| 即用即删 | `/api/agent/chat` 内 | 按用户输入在 ClawHub 搜索 top2 技能，仅当轮注入 system prompt，用后不持久化，**不增加长期 token 消耗** |
| 推荐合并 | `GET /api/skills/recommend` | 返回 `recommended`（内置 ID）+ `community`（ClawHub slug、displayName、summary） |

环境变量：`CLAWHUB_API_BASE` 默认 `https://clawhub.ai`；设为 `0` 可关闭 ClawHub。详见 `.env.local.example`。

### 2.4 技术路线（摘要）

1. **意图感知**：从任务/对话中抽取关键词或 embedding，与技能描述做语义匹配。  
2. **技能源**：ClawHub API 或自建技能库（manifest + 描述），统一「发现 → 推荐 → 安装」流程。  
3. **代码预留**：`src/lib/skills/registry.ts` 中 `discoverSkillsFromSchedule` 已实现基于任务名称关键词的**内置技能推荐**；后续在该函数内增加「调用外部 API 并合并结果」即可接 ClawHub/APM。

---

## 三、第十一章：自主技能发现

### 3.1 目标

小熊猫根据日程**自主搜寻、安装、调用**技能，用户无感或弱确认。

### 3.2 与 V3 的关系

- **V3**：提供「动态发现」能力（从哪里找技能、如何匹配意图）。  
- **第十一章**：在 V3 之上增加「**自主决策流程**」与「**分级确认机制**」：
  - 扫描任务 → 推断能力缺口 → 调用发现接口 → 安全验证（沙箱/白名单）→ 推荐或自动启用。

即：V3 是「能力层」，第十一章是「策略层」（何时自动启用、何时必须弹窗）。

### 3.3 安全策略

| 技能类型 | 确认策略 | 说明 |
|----------|----------|------|
| **内置 / 官方技能** | 可无感推荐或自动启用 | 代码内注册，无第三方执行；当前 `discoverSkillsFromSchedule` 仅推荐内置技能 ID |
| **社区 / 第三方插件** | 首次必须用户确认 | 后续调用可自动；涉及支付/外发消息时每次确认 |
| **执行前** | 涉及 Deep Link / 支付 / 外发 | 前端已有「允许并打开/暂不执行」；不替用户点击或支付 |

当前实现：仅推荐**已注册的内置技能**，无自动安装第三方插件；安全上等同于「推荐你可用哪些已有技能」，无新增风险。

### 3.4 代码扩展点说明

| 位置 | 说明 |
|------|------|
| `src/lib/skills/registry.ts` | `discoverSkillsFromSchedule(userId, tasks)`：根据任务名称关键词推荐技能 ID；可在此处增加「调用 ClawHub/APM API，合并推荐列表」。 |
| `src/app/api/skills/recommend/route.ts` | `GET /api/skills/recommend`：拉取当前用户未完成任务，调用 `discoverSkillsFromSchedule`，返回 `{ recommended: string[] }`；供前端「小熊猫为你推荐」或 agent-push/cron 使用。 |
| `src/lib/agent-push.ts` | 推送决策时可增加「若用户有推荐技能未启用，可加入一条弱提示推送」；需读取 `GET /api/skills/recommend` 或直接调用 `discoverSkillsFromSchedule`。 |
| 未来 cron / 后台任务 | 可新增「技能推荐」定时任务：为活跃用户生成推荐并写入 in-app 消息或推送（需产品约定频率与文案）。 |

### 3.5 当前已实现（PRD 第十一章 最小闭环）

- **意图 → 技能映射**：在 `registry.ts` 中通过 `INTENT_TO_SKILL`（订票/打车/会议/冲突/周报/长期目标/查资料等关键词）匹配到内置技能 ID。  
- **推荐 API**：`GET /api/skills/recommend` 返回当前用户日程衍生的推荐技能 ID 列表。  
- **扩展方式**：后续在 `discoverSkillsFromSchedule` 内增加对外部技能源（ClawHub/APM）的调用，返回并合并更多 skillId（含未安装的社区技能），再由前端或推送做「是否安装/启用」的确认。

---

## 四、代码预留与清单

- **技能发现**：`src/lib/skills/registry.ts` 中 `discoverSkillsFromSchedule(userId, tasks)` 已实现基于任务名称的**内置技能推荐**，并预留扩展为 ClawHub/APM 的入口。  
- **推荐接口**：`GET /api/skills/recommend` 已实现，需登录，返回 `{ recommended: string[] }`。  
- **多端**：无需在当前仓库新增代码；新端在独立仓库或 monorepo 子包中调用现有 API 即可。  
- **Stripe**：已实现 Checkout + Webhook，支付安全由 Stripe 处理，不落地卡号。
