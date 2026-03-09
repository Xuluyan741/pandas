/**
 * 数据库客户端 — @libsql/client (Turso)
 * 本地开发：TURSO_DATABASE_URL 未设置时自动使用本地 SQLite 文件
 * 生产部署：设置 TURSO_DATABASE_URL + TURSO_AUTH_TOKEN 指向 Turso 云数据库
 */
import { createClient } from "@libsql/client";
import path from "path";
import { existsSync, mkdirSync } from "fs";

function makeClient() {
  const url = process.env.TURSO_DATABASE_URL;
  if (url && !url.startsWith("file:")) {
    // 生产：Turso 云数据库
    return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  // 本地开发：SQLite 文件
  const dataDir = path.join(process.cwd(), "data");
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  return createClient({ url: `file:${path.join(dataDir, "app.db")}` });
}

// 单例（防止 Next.js dev 热重载重复创建）
const g = global as typeof globalThis & { __libsql?: ReturnType<typeof createClient> };
if (!g.__libsql) g.__libsql = makeClient();
export const db = g.__libsql;

/** 初始化表结构（幂等，IF NOT EXISTS） */
export async function initDb() {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT, image TEXT, password_hash TEXT, google_id TEXT, created_at TEXT DEFAULT (datetime('now','localtime')), subscription_status TEXT, subscription_plan TEXT, subscription_end_date TEXT, stripe_customer_id TEXT)"
  );
  await db.execute(
    "CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, group_name TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
  );
  await db.execute(
    "CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT NOT NULL, name TEXT NOT NULL, start_date TEXT NOT NULL, duration INTEGER NOT NULL DEFAULT 1, dependencies TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'To Do', priority TEXT NOT NULL DEFAULT '中', is_recurring INTEGER NOT NULL DEFAULT 0, progress INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
  );
  await db.execute(
    "CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now','localtime')))"
  );
  await db.execute(
    "CREATE TABLE IF NOT EXISTS ai_usage (user_id TEXT NOT NULL, kind TEXT NOT NULL, period TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, kind, period))"
  );

  /** nanobot 风格：用户自定义定时提醒（cron 或固定间隔） */
  await db.execute(
    `CREATE TABLE IF NOT EXISTS scheduled_reminders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      message TEXT NOT NULL,
      cron_expr TEXT,
      interval_seconds INTEGER,
      next_run_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`
  );

  /** nanobot 风格：Agent 持久化记忆（供 memory skill 与对话上下文使用） */
  await db.execute(
    `CREATE TABLE IF NOT EXISTS agent_memory (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (user_id, key)
    )`
  );

  /** Heartbeat：用户周期性任务列表（nanobot HEARTBEAT.md 等价） */
  await db.execute(
    `CREATE TABLE IF NOT EXISTS heartbeat_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`
  );

  /** 后台任务队列（子 Agent / 异步执行） */
  await db.execute(
    `CREATE TABLE IF NOT EXISTS background_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`
  );

  /** 通道绑定：多通道（Telegram/Discord 等）与用户关联 */
  await db.execute(
    `CREATE TABLE IF NOT EXISTS channel_bindings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      channel_user_id TEXT,
      channel_chat_id TEXT,
      token_or_meta TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(user_id, channel)
    )`
  );

  /** 用户启用的技能（技能市场安装/启用） */
  await db.execute(
    `CREATE TABLE IF NOT EXISTS user_skills (
      user_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (user_id, skill_id)
    )`
  );

  /** PRD 第十一章：社区技能安装（ClawHub 等），支持自主搜寻后安装与执行 */
  await db.execute(
    `CREATE TABLE IF NOT EXISTS community_skills_installed (
      user_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'clawhub',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (user_id, slug)
    )`
  );

  /** 用户安装的 MCP 服务器（多 MCP 配置 + MCP 商店安装） */
  await db.execute(
    `CREATE TABLE IF NOT EXISTS user_mcp_servers (
      user_id TEXT NOT NULL,
      url TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      headers TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (user_id, url)
    )`
  );

  /** 长期目标（PRD Phase 6） */
  await db.execute(
    `CREATE TABLE IF NOT EXISTS long_term_goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      deadline TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`
  );

  /** 用户偏好（PRD Phase 7+，冲突消解/建议前读取） */
  await db.execute(
    `CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (user_id, key)
    )`
  );

  /** PMF 埋点事件（PRD 1.5：事件名 + 时间 + userId 脱敏，不存任务/语音内容） */
  await db.execute(
    `CREATE TABLE IF NOT EXISTS pmf_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      event_name TEXT NOT NULL,
      payload TEXT,
      created_at TEXT NOT NULL
    )`
  );

  /** 配额奖励（高价值行为返还额度，参考 ClawWork 改进建议） */
  await db.execute(
    `CREATE TABLE IF NOT EXISTS quota_rewards (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      period TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`
  );

  /** 产出物可追溯（计划/冲突建议摘要等，供回顾与质量统计） */
  await db.execute(
    `CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      ref_id TEXT,
      summary TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`
  );

  /** 路由/模型调用日志（A/B 分析与成本归因） */
  await db.execute(
    `CREATE TABLE IF NOT EXISTS router_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      model TEXT NOT NULL,
      cost_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`
  );

  /**
   * 会员相关字段迁移（老库没有这些列时补齐）
   * - 使用 PRAGMA table_info 查询现有列，缺啥补啥，保证多次调用幂等
   */
  const cols = await db.execute("PRAGMA table_info(users)");
  const existing = (cols.rows as unknown as { name: string }[]).map((c) => c.name);
  const addIfMissing = async (name: string, type = "TEXT") => {
    if (!existing.includes(name)) {
      await db.execute(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
    }
  };
  await addIfMissing("subscription_status");
  await addIfMissing("subscription_plan");
  await addIfMissing("subscription_end_date");
  await addIfMissing("stripe_customer_id");
  /** 新客试用（PRD 1.4）：7 天或 20 次，先到先止 */
  await addIfMissing("trial_until");
  await addIfMissing("trial_count_used", "INTEGER");

  /**
   * Tasks 表迁移
   */
  const taskCols = await db.execute("PRAGMA table_info(tasks)");
  const existingTaskCols = (taskCols.rows as unknown as { name: string }[]).map((c) => c.name);
  const addTaskColIfMissing = async (name: string) => {
    if (!existingTaskCols.includes(name)) {
      await db.execute(`ALTER TABLE tasks ADD COLUMN ${name} TEXT`);
    }
  };
  await addTaskColIfMissing("start_time");
  await addTaskColIfMissing("end_time");
  await addTaskColIfMissing("parent_goal_id");
  await addTaskColIfMissing("resource_url");

  /** ai_usage 表增加成本累计（参考 ClawWork 改进：成本可视化） */
  const usageCols = await db.execute("PRAGMA table_info(ai_usage)");
  const usageColNames = (usageCols.rows as unknown as { name: string }[]).map((c) => c.name);
  if (!usageColNames.includes("total_cost_usd")) {
    await db.execute("ALTER TABLE ai_usage ADD COLUMN total_cost_usd REAL NOT NULL DEFAULT 0");
  }
}

// 启动时初始化（异步，不阻塞模块加载）
initDb().catch(console.error);
