# PRD 未实现清单

> 对照 `PRD-小熊猫智能管家.md` 与当前代码库整理，便于迭代与 Cursor 执行。  
> 更新日期：2026-02-28

---

## 一、已实现（供对照）

| PRD 目标 | 实现情况 |
|----------|----------|
| Phase 1 Spotlight UI | ✅ 已完成 |
| Phase 2 冲突消解引擎 | ✅ scheduler.ts + API + 前端确认 |
| 日/周日历视图 | ✅ CalendarView (react-big-calendar)，PRD 2.1 表格仍标 ❌ 属文档滞后 |
| Phase 3 补充 Agent 自主推送 | ✅ agent-push、每日 ≤3 条、退避、配额 |
| Phase 4 Skills + Deep Link 执行器 | ✅ registry、deep-links、执行预览卡「允许并打开/暂不执行」 |
| Phase 5 Token 配额 | ✅ quota.ts，parse-tasks/scheduler/agent-push/agent-chat 门控 |
| Phase 6 长期目标管家 | ✅ 解析 long_term_goal、goal-planner、agent-research、goals API、监督推送 |
| Phase 7+ 多模态 | ✅ parse-tasks 支持图片上传与识别 |
| Phase 7+ user_preferences | ✅ 表 + 读写接口 |
| 免费版 3 项目上限 | ✅ 在 /api/projects 中校验 |
| 拟人化 Agent | ✅ agent/chat 流式 Thought→Action→Observation、加载文案 |
| 定价页 | ✅ /pricing 有 Free vs Pro 展示（支付未接入） |

---

## 二、未实现或未完全实现

### 1. PMF 数据采集与埋点（PRD 1.5 checklist）— ✅ 已实现

| 条目 | 说明 |
|------|------|
| 埋点事件 | ✅ `lib/analytics.ts` + `pmf_events` 表；parse_tasks_success / scheduler_success / agent_chat_schedule_suggested / push_click（含 source: voice\|text） |
| 用户标识 | ✅ 登录用户 session.user.id 稳定；事件存储脱敏 userId（maskUserId） |
| 基础日志 | ✅ 各 API 内 logEvent 后打印 `[pmf] event=… userId=<masked> at=…`，不记录任务全文、语音内容 |
| 统计看板 | ✅ `docs/PMF-统计说明.md` 提供 SQL 示例（Aha Moment、按日互动、推送点击）；前端可上报 POST /api/analytics/event |

**对应 PRD**：§1.5 PMF 验证指标、checklist 四条。

---

### 2. 新客试用（PRD 1.4）— ✅ 已实现

| 条目 | 说明 |
|------|------|
| 试用权益 | ✅ 注册（邮箱/Google）即赠送 **7 天或 20 次** Pro 额度，先到先止；`users.trial_until`、`trial_count_used`，quota.ts 优先试用再订阅 |
| 当前状态 | 已实现 |

**对应 PRD**：§1.4 商业模式表格「新客试用」一行。

---

### 3. 付费墙与支付（PRD 1.4）— ✅ 已实现

| 条目 | 说明 |
|------|------|
| Pro 定价 | ✅ 定价页已落地 ¥19.9/月、¥199/年 |
| 支付通道 | ✅ Stripe 接入：POST /api/stripe/checkout 创建订阅 Session 跳转支付；POST /api/stripe/webhook 回调更新 users 订阅状态；支付不落地卡号 |
| 耗尽提示 | ✅ 已统一：`QUOTA_EXHAUSTED_MESSAGE`，parse-tasks/scheduler/agent-chat 均返回同一温和文案 |

**对应 PRD**：§1.4 付费墙策略、Token 控制、「带刺」阻断体验。

---

### 4. 安全与合规（PRD 四-A 技术实现 checklist）— ✅ 已实现

| 条目 | 说明 |
|------|------|
| API 认证 | ✅ 已整理：见 `docs/API-认证清单.md`，需鉴权 API 统一 getServerSession/requireUserId；Cron 用 CRON_SECRET |
| 敏感变量 | 需自检：DB、API Key 等不入库、不打印 |
| 日志脱敏 | ✅ 已实现：parse-tasks 错误日志不记录原文仅记录长度；pmf 仅事件名+脱敏 userId |
| 安全头 | ✅ 已实现：next.config 增加 X-Frame-Options、X-Content-Type-Options、Referrer-Policy、Permissions-Policy |
| 支付安全 | 未接入：支付仅跳转、不落地卡号；使用合规网关 |
| 隐私与协议 | ✅ 已实现：/privacy、/terms 页面覆盖数据收集、AI 调用、推送、导出与删除；登录页脚链入 |

**对应 PRD**：§四-A 技术实现 checklist、合规与声明。

---

### 5. 语音优先（Phase 5 Cursor Prompt）— 部分已落实

| 条目 | 说明 |
|------|------|
| 默认入口 | ✅ 已落实：PandaChat 占位符「按住麦克风说话，或直接输入…」+ 底部提示「按住麦克风说话，说完自动解析」；语音转写后自动触发 agent/chat 解析 |
| Yes/No 统一 | ✅ 已落实：冲突确认按钮改为「好的」/「暂不」；Deep Link 卡片保留「允许并打开/暂不执行」 |

**对应 PRD**：Phase 5 Prompt、§4.2 极致的语音优先交互。

---

### 6. Phase 7 小程序/App 迁移

| 条目 | 说明 |
|------|------|
| 多端 | 规划已落档：见 `docs/Phase7-与远期规划.md`；技术选型 Uni-app/Taro，API 已可复用，多端在独立仓库推进 |

**对应 PRD**：§1.5 产品形态演进、§3.2 Phase 7。

---

### 7. 远期（第十、十一节）

| 条目 | 说明 |
|------|------|
| Zero-Shot Proactive V3 | 规划与接口预留：见 `docs/Phase7-与远期规划.md`；当前半主动推送+配额已实现，V3 为动态技能发现与 ClawHub/APM 接入 |
| 自主技能发现 | 预留：`src/lib/skills/registry.ts` 中 `discoverSkillsFromSchedule()` 占位，后续接 ClawHub/APM 语义搜索与自动推荐 |

**对应 PRD**：第十章、第十一章。

---

### 8. 文档与表格同步

| 条目 | 说明 |
|------|------|
| PRD 2.1 已有能力表 | 需在 `PRD-小熊猫智能管家.md` 中将「日/周日历视图」从 ❌ 改为 ✅（实际已有 CalendarView） |
| Phase 状态表 3.2 | 需在 PRD 正文 §3.2 中将 Phase 3 推送、Phase 4 执行器、Phase 5 配额、Phase 6 长期目标 从「⏳ 规划中」改为「✅ 已完成」并注明完成时间（本清单 §一 已列） |

---

## 三、建议优先级（与 PRD 一致）

1. **P0 / 尽快**：PMF 埋点与安全 checklist（不做无法验证增长与合规）。
2. **P1**：新客试用逻辑（7 天/20 次）、付费墙耗尽提示文案统一、语音优先默认引导与 Yes/No 闭环。
3. **P2**：支付接入与 Pro 定价落地、隐私政策与用户协议。
4. **P3**：Phase 7 多端、第十/十一节主动与技能发现。

如需某一条的「可直接给 Cursor 执行的 Prompt」，可基于 PRD 对应章节拆成小步任务再写。
