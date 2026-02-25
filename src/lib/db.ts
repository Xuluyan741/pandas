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
    "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT, image TEXT, password_hash TEXT, google_id TEXT, created_at TEXT DEFAULT (datetime('now','localtime')))"
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
}

// 启动时初始化（异步，不阻塞模块加载）
initDb().catch(console.error);
