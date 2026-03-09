# API 认证清单（PRD 四-A）

所有需鉴权的 API 统一使用 **NextAuth Session/JWT**：
- `getServerSession(authOptions)` 获取当前用户，未登录为 `null`，部分接口允许 guest（如 parse-tasks、scheduler、agent/chat 以 guest 计 quota）
- `requireUserId()`（见 `src/lib/api-helpers.ts`）在必须登录时使用，未登录返回 401

## 需登录（requireUserId 或 session 必填）

| 路径 | 说明 |
|------|------|
| GET/POST /api/projects | 项目列表/创建 |
| GET/POST/DELETE /api/projects/[id] | 项目详情/更新/删除 |
| GET/POST /api/tasks | 任务列表/创建 |
| POST /api/tasks/[id] | 任务更新/删除 |
| GET/POST /api/goals | 长期目标 |
| GET/PATCH/DELETE /api/goals/[id] | 长期目标单条 |
| GET/POST /api/skills/me | 用户技能启用状态 |
| GET /api/skills/recommend | 根据日程推荐技能（PRD 第十一章） |
| GET/POST /api/agent/background | 后台任务提交 |
| GET/POST /api/agent/memory | Agent 记忆读写 |
| GET/POST /api/channels/bind | 通道绑定 |
| GET/POST/PATCH/DELETE /api/heartbeat | 心跳任务 |
| POST /api/heartbeat/[id] | 心跳单条更新 |
| GET/POST/DELETE /api/cron/jobs | 用户定时任务（需登录） |
| GET/DELETE /api/cron/jobs/[id] | 单条定时任务 |
| POST /api/push/subscribe | 推送订阅 |
| POST /api/push/unsubscribe | 取消推送 |
| POST /api/analytics/event | 前端埋点上报 |
| POST /api/stripe/checkout | 创建支付链接 |

## 可选登录（session 有则用 userId，无则 guest）

| 路径 | 说明 |
|------|------|
| POST /api/ai/parse-tasks | 解析任务，guest 计 quota |
| POST /api/scheduler | 冲突检测，guest 计 quota |
| POST /api/agent/chat | 对话，guest 计 quota |

## 内部/Cron（CRON_SECRET 或 X-Internal 头，不依赖用户 Session）

| 路径 | 说明 |
|------|------|
| GET/POST /api/cron/agent-push | 定时 Agent 推送 |
| GET/POST /api/cron/daily-push | 每日推送 |
| POST /api/cron/process-jobs | 处理后台任务 |
| POST /api/cron/heartbeat | 心跳执行 |
| POST /api/agent/chat | 支持 X-Internal-User-Id + X-Internal-Secret 内部调用 |

## 公开或仅配置

| 路径 | 说明 |
|------|------|
| GET /api/push/vapid-public | 推送公钥，无需登录 |
| POST /api/stripe/webhook | Stripe 回调，用签名校验，不用 Session |
| GET/POST /api/auth/[...nextauth] | NextAuth 路由 |
| POST /api/channels/telegram/webhook | Telegram Bot，用 token 校验 |

**敏感变量**：DB 连接、API Key、Stripe 密钥等仅从 `process.env` 读取，不入库、不打印。
