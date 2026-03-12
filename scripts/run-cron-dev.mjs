#!/usr/bin/env node
/**
 * 本地开发：按「原频率」触发 cron 接口，便于测试完整流程
 * - heartbeat: 每 30 分钟
 * - process-jobs: 每分钟
 * 使用：先 pnpm dev，再开一个终端运行 pnpm run cron:dev
 * 需在 .env.local 中配置 CRON_SECRET（与 Next 使用同一值）
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env.local");

if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  });
}

const BASE = process.env.BASE_URL || "http://localhost:3001";
const SECRET = process.env.CRON_SECRET;

if (!SECRET) {
  console.error("[cron:dev] 请在 .env.local 中配置 CRON_SECRET 后重试");
  process.exit(1);
}

const headers = { "x-cron-secret": SECRET };

async function call(path) {
  try {
    const res = await fetch(`${BASE}${path}`, { method: "POST", headers });
    const ok = res.ok ? "ok" : res.status;
    console.log(`[${new Date().toISOString()}] ${path} → ${ok}`);
  } catch (e) {
    console.error(`[${new Date().toISOString()}] ${path} → error:`, e.message);
  }
}

// 启动时各执行一次
await call("/api/cron/heartbeat");
await call("/api/cron/process-jobs");

// 每 30 分钟 heartbeat
setInterval(() => call("/api/cron/heartbeat"), 30 * 60 * 1000);
// 每分钟 process-jobs
setInterval(() => call("/api/cron/process-jobs"), 60 * 1000);

console.log("[cron:dev] 本地 cron 已启动：heartbeat 每 30 分钟，process-jobs 每分钟。Ctrl+C 退出。");
