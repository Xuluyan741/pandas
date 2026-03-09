# PMF 统计说明（PRD 1.5）

埋点写入表 `pmf_events`，字段：`id`、`user_id`（脱敏）、`event_name`、`payload`（JSON）、`created_at`。

## 事件名

| event_name | 说明 |
|------------|------|
| parse_tasks_success | 成功调用 /api/ai/parse-tasks 解析出任务（payload 含 source: voice/text） |
| scheduler_success | 成功调用 /api/scheduler 返回冲突检测/AI 建议 |
| agent_chat_schedule_suggested | Agent 对话成功返回带冲突消解/建议的日程 |
| schedule_created_with_ai | 用户确认并创建了 AI 建议的日程（可选，由前端或后续流程上报） |
| push_click | 用户点击了推送通知（前端在打开应用时调用 POST /api/analytics/event） |

## 简易统计 SQL（手动导出）

在项目根目录使用本地 SQLite 时，可用：

```bash
sqlite3 data/app.db
```

或通过 Turso CLI 连接生产库后执行以下 SQL。

### 各事件今日/本周次数

```sql
SELECT event_name, COUNT(*) AS cnt
FROM pmf_events
WHERE date(created_at) >= date('now', '-7 days')
GROUP BY event_name
ORDER BY cnt DESC;
```

### Aha Moment：至少发生过一次「成功解析/AI 建议日程」的独立用户数（近 7 天）

```sql
SELECT COUNT(DISTINCT user_id) AS aha_users
FROM pmf_events
WHERE event_name IN ('parse_tasks_success', 'scheduler_success', 'agent_chat_schedule_suggested')
  AND created_at >= datetime('now', '-7 days');
```

### Day 7 留存思路

需要用户注册时间。若 `users` 表有 `created_at`，可先算「注册满 7 天的用户」集合，再与 `pmf_events` 中 7 天内有任意事件的 `user_id` 做交集。注意：`pmf_events.user_id` 为脱敏 id，无法直接与 `users.id` 关联；若要做真实 Day 7 留存，需在埋点时额外存一份可关联的匿名 id（如 hash(user_id) 固定写入另一列），或仅在日志侧用真实 userId 做离线统计。

当前设计：**同一用户多次请求会得到相同的脱敏 user_id**（见 `maskUserId`），因此可统计「去重用户数」和「事件次数」，无法与 users 表做 JOIN。若要 Day 7 留存，建议后续增加「注册日」维度的汇总表或离线任务。

### 互动频率（按日）

```sql
SELECT date(created_at) AS d, event_name, COUNT(*) AS cnt
FROM pmf_events
WHERE created_at >= datetime('now', '-30 days')
GROUP BY date(created_at), event_name
ORDER BY d DESC, cnt DESC;
```

## 推送点击上报

前端在用户通过点击推送打开应用时，调用：

```ts
fetch("/api/analytics/event", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ event: "push_click" }),
});
```

（需在已登录状态下调用，否则以 guest 记录。）
