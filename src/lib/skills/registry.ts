import type { AnySkill, Skill, SkillRunContext } from "./types";
import type { Task } from "@/types";
import { detectConflicts, formatConflictsForLLM } from "@/lib/scheduler";
import { buildDeepLink } from "@/lib/deep-links";
import type { ActionHint } from "@/lib/ai/types";
import { researchForGoal } from "@/lib/agent-research";
import { planGoal } from "@/lib/goal-planner";
import type { GoalCategory } from "@/types";
import { db } from "@/lib/db";
import { resolveWithinWorkspace, isRestrictToWorkspace } from "@/lib/workspace";
import { readFile, writeFile, readdir } from "fs/promises";
import { getMcpConfig, mcpListTools, mcpCallTool } from "@/lib/mcp-client";

/**
 * 全局 Skill 注册表（内存级，适合当前单进程场景）
 */
const registry = new Map<string, AnySkill>();

export function registerSkill<TInput, TOutput>(
  skill: Skill<TInput, TOutput>,
): void {
  registry.set(skill.id, skill as AnySkill);
}

export function listSkills(): AnySkill[] {
  return Array.from(registry.values());
}

/**
 * 意图关键词 → 推荐技能 ID 映射（PRD 第十一章：自主技能发现）
 * 从任务名称/描述中匹配关键词，推荐可能用到的内置技能；后续可扩展为 ClawHub/APM 语义检索。
 */
const INTENT_TO_SKILL: Array<{ keywords: RegExp; skillId: string }> = [
  { keywords: /订票|火车|高铁|12306|机票|买票|抢票/, skillId: "deep_link_executor" },
  { keywords: /打车|滴滴|叫车|高德|出行/, skillId: "deep_link_executor" },
  { keywords: /外卖|订餐|点餐|美团|饿了么/, skillId: "deep_link_executor" },
  { keywords: /开会|会议|腾讯会议|飞书|zoom|线上会/, skillId: "deep_link_executor" },
  { keywords: /购物|淘宝|京东|买.*东西/, skillId: "deep_link_executor" },
  { keywords: /冲突|重叠|排期|时间冲突|撞期/, skillId: "schedule_conflict" },
  { keywords: /周报|复盘|汇报|会议纪要|发给.*同事|请求延期/, skillId: "message_draft" },
  { keywords: /考试|备考|减肥|健身|长期目标|旅游|上线|交付/, skillId: "long_term_goal_planner" },
  { keywords: /查资料|搜索|调研|了解.*信息/, skillId: "web_search" },
];

/**
 * 自主技能发现（PRD 第十一章 + 第十章 V3 扩展点）
 * 根据用户日程/任务推断所需能力，先匹配内置技能关键词，后续可接入 ClawHub API 或自建 APM + Embedding 检索。
 * @returns 推荐技能 ID 列表（去重，仅包含当前已注册的技能）
 */
export async function discoverSkillsFromSchedule(
  _userId: string,
  tasks: Task[],
): Promise<string[]> {
  const text = tasks.map((t) => t.name).join(" ");
  if (!text.trim()) return [];

  const recommended = new Set<string>();
  for (const { keywords, skillId } of INTENT_TO_SKILL) {
    if (keywords.test(text)) recommended.add(skillId);
  }

  const validIds = new Set(registry.keys());
  return Array.from(recommended).filter((id) => validIds.has(id));
}

export async function runSkill<TInput, TOutput>(
  id: string,
  input: TInput,
  context?: SkillRunContext,
): Promise<TOutput> {
  const skill = registry.get(id);
  if (!skill) {
    throw new Error(`Skill not found: ${id}`);
  }
  // 运行时不做强校验，只由各 Skill 自己解析 input
  const result = await (skill as Skill<TInput, TOutput>).run(input, context);
  return result;
}

/* ─── 内置 Skill 定义 ─── */

/**
 * schedule_conflict：对单个新任务进行冲突检测，并生成结构化说明
 */
interface ScheduleConflictInput {
  /** 待检测的新任务 */
  newTask: Task;
  /** 当前已有任务列表 */
  existingTasks: Task[];
}

interface ScheduleConflictOutput {
  hasConflict: boolean;
  /** 算法原始结果（供前端 / 其他 Skill 复用） */
  raw: ReturnType<typeof detectConflicts>;
  /** 供 LLM 使用的结构化上下文 */
  llmContext: string;
}

registerSkill<ScheduleConflictInput, ScheduleConflictOutput>({
  id: "schedule_conflict",
  name: "冲突消解建议",
  description: "对新任务进行时间冲突检测，并给出算法级重排建议。",
  requiredInputs: ["newTask", "existingTasks"],
  riskLevel: "low",
  run: ({ newTask, existingTasks }: ScheduleConflictInput) => {
    const result = detectConflicts(newTask, existingTasks);
    return {
      hasConflict: result.hasConflict,
      raw: result,
      llmContext: formatConflictsForLLM(result),
    };
  },
});

/**
 * deep_link_executor：根据动作类型与上下文生成 Deep Link
 */
interface DeepLinkExecutorInput {
  action: ActionHint;
  /** 原始自然语言输入，用于提取地点/关键字（当前版本主要用于展示） */
  text: string;
}

interface DeepLinkExecutorOutput {
  url: string;
  appName: string;
  title: string;
  description: string;
  /** 风险等级：前端可据此决定是否需要显式确认 */
  riskLevel: "low" | "medium" | "high";
}

registerSkill<DeepLinkExecutorInput, DeepLinkExecutorOutput>({
  id: "deep_link_executor",
  name: "Deep Link 执行器",
  description:
    "为订餐/打车/买票/会议等场景生成预填参数的 Deep Link，仅做跳转与草稿，不直接下单或支付。",
  requiredInputs: ["action", "text"],
  riskLevel: "medium",
  run: ({ action, text }: DeepLinkExecutorInput) => {
    return buildDeepLink(action, { rawText: text });
  },
});

/**
 * message_draft：根据上下文生成一份待发送的消息草稿
 * 当前实现为轻量占位实现，主要提供统一接口，后续可接入 LLM 润色。
 */
interface MessageDraftInput {
  /** 消息用途，例如 "向同事请求延期" / "向客户确认会议时间" */
  intent: string;
  /** 相关任务或场景的简要描述（可选） */
  context?: string;
}

interface MessageDraftOutput {
  /** 生成的消息草稿（纯文本，由用户确认后再发送） */
  draft: string;
}

registerSkill<MessageDraftInput, MessageDraftOutput>({
  id: "message_draft",
  name: "消息草稿助手",
  description: "根据意图与上下文生成一份短消息草稿，交由用户确认后再发送。",
  requiredInputs: ["intent"],
  riskLevel: "low",
  run: ({ intent, context }: MessageDraftInput) => {
    const prefix = "这是根据你的意图生成的一份草稿：";
    const bodyLines: string[] = [];
    bodyLines.push(`【意图】${intent}`);
    if (context?.trim()) {
      bodyLines.push(`【背景】${context.trim()}`);
    }
    bodyLines.push("【建议措辞】你好，我这边根据当前安排有一些调整建议，想和你简单确认一下。");
    return {
      draft: `${prefix}\n${bodyLines.join("\n")}`,
    };
  },
});

/**
 * long_term_goal_planner：长期目标规划助手（PRD Phase 6）
 * 返回 LLM 生成的子任务列表（含资料链接）和推荐资料
 */
interface LongTermGoalPlannerInput {
  goalId: string;
  title: string;
  deadline: string;
  category: GoalCategory;
  existingTasks: Task[];
}

interface LongTermGoalPlannerOutput {
  plan: Awaited<ReturnType<typeof planGoal>>;
  research: Awaited<ReturnType<typeof researchForGoal>>;
}

registerSkill<LongTermGoalPlannerInput, LongTermGoalPlannerOutput>({
  id: "long_term_goal_planner",
  name: "长期目标管家",
  description: "为考试/减肥/项目/旅行等长期目标生成分阶段计划与推荐资料。",
  requiredInputs: ["goalId", "title", "deadline", "category", "existingTasks"],
  riskLevel: "low",
  run: async ({ goalId, title, deadline, category, existingTasks }: LongTermGoalPlannerInput) => {
    const [plan, research] = await Promise.all([
      planGoal({ goalId, title, deadline, category, existingTasks }),
      researchForGoal({ goal: title, category }),
    ]);
    return { plan, research };
  },
});

/**
 * agent_memory：nanobot 风格持久化记忆（读/写/列举）
 * 供对话上下文与后续决策使用
 */
interface AgentMemoryInput {
  action: "get" | "set" | "list";
  key?: string;
  value?: string;
}

interface AgentMemoryOutput {
  value?: string | null;
  map?: Record<string, string>;
  ok?: boolean;
}

registerSkill<AgentMemoryInput, AgentMemoryOutput>({
  id: "agent_memory",
  name: "Agent 记忆",
  description: "读取或写入用户相关的持久化记忆（key-value），用于跨轮次上下文。",
  requiredInputs: ["action"],
  riskLevel: "low",
  run: async (
    { action, key, value }: AgentMemoryInput,
    context?: SkillRunContext,
  ): Promise<AgentMemoryOutput> => {
    const userId = context?.userId;
    if (!userId) {
      return { value: null, map: {} };
    }
    if (action === "list") {
      const r = await db.execute({
        sql: "SELECT key, value FROM agent_memory WHERE user_id = ?",
        args: [userId],
      });
      const rows = (r.rows || []) as Record<string, string>[];
      const map: Record<string, string> = {};
      for (const row of rows) {
        map[row.key] = row.value;
      }
      return { map };
    }
    if (action === "get" && key) {
      const r = await db.execute({
        sql: "SELECT value FROM agent_memory WHERE user_id = ? AND key = ?",
        args: [userId, key],
      });
      const rows = (r.rows || []) as Record<string, unknown>[];
      return {
        value: rows.length > 0 ? (rows[0].value as string) : null,
      };
    }
    if (action === "set" && key?.trim()) {
      const now = new Date().toISOString();
      await db.execute({
        sql: `INSERT INTO agent_memory (user_id, key, value, updated_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        args: [userId, key.trim(), typeof value === "string" ? value : "", now],
      });
      return { ok: true };
    }
    return { value: null };
  },
});

/**
 * filesystem：在工作区内读/写/列目录（nanobot 风格，restrictToWorkspace）
 */
interface FilesystemInput {
  action: "read" | "write" | "list";
  path: string;
  content?: string;
}

interface FilesystemOutput {
  content?: string;
  entries?: string[];
  ok?: boolean;
  error?: string;
}

registerSkill<FilesystemInput, FilesystemOutput>({
  id: "filesystem",
  name: "文件系统",
  description: "在工作区目录内读取文件、写入文件或列出目录。路径为相对工作区的路径。",
  requiredInputs: ["action", "path"],
  riskLevel: "medium",
  run: async ({ action, path: relPath, content }: FilesystemInput): Promise<FilesystemOutput> => {
    if (isRestrictToWorkspace()) {
      const abs = resolveWithinWorkspace(relPath);
      if (!abs) return { error: "路径超出工作区或非法" };
      try {
        if (action === "read") {
          const data = await readFile(abs, "utf-8");
          return { content: data };
        }
        if (action === "write" && content !== undefined) {
          await writeFile(abs, content, "utf-8");
          return { ok: true };
        }
        if (action === "list") {
          const entries = await readdir(abs);
          return { entries };
        }
      } catch (e) {
        return { error: (e as Error).message };
      }
    }
    return { error: "未启用工作区限制，拒绝文件操作" };
  },
});

/**
 * web_search：网页搜索（Serper 或 Brave），返回摘要与链接
 */
interface WebSearchInput {
  query: string;
  num?: number;
}

interface WebSearchOutput {
  results: { title: string; url: string; snippet: string }[];
  error?: string;
}

registerSkill<WebSearchInput, WebSearchOutput>({
  id: "web_search",
  name: "网页搜索",
  description: "根据关键词进行网页搜索，返回标题、链接和摘要。",
  requiredInputs: ["query"],
  riskLevel: "low",
  run: async ({ query, num = 5 }: WebSearchInput): Promise<WebSearchOutput> => {
    const serperKey = process.env.SERPER_API_KEY;
    const braveKey = process.env.BRAVE_API_KEY;
    if (serperKey) {
      try {
        const res = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
          body: JSON.stringify({ q: query, num }),
        });
        if (!res.ok) return { results: [], error: `Serper ${res.status}` };
        const data = (await res.json()) as { organic?: { title?: string; link?: string; snippet?: string }[] };
        const organic = data.organic || [];
        return {
          results: organic.slice(0, num).map((o) => ({
            title: o.title || "",
            url: o.link || "",
            snippet: o.snippet || "",
          })),
        };
      } catch (e) {
        return { results: [], error: (e as Error).message };
      }
    }
    if (braveKey) {
      try {
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${num}`;
        const res = await fetch(url, {
          headers: { "X-Subscription-Token": braveKey },
        });
        if (!res.ok) return { results: [], error: `Brave ${res.status}` };
        const data = (await res.json()) as { web?: { results?: { title?: string; url?: string; description?: string }[] } };
        const web = data.web?.results || [];
        return {
          results: web.slice(0, num).map((o) => ({
            title: o.title || "",
            url: o.url || "",
            snippet: o.description || "",
          })),
        };
      } catch (e) {
        return { results: [], error: (e as Error).message };
      }
    }
    return { results: [], error: "未配置 SERPER_API_KEY 或 BRAVE_API_KEY" };
  },
});

/**
 * shell：在工作区内执行 shell 命令（沙箱，超时 30s）
 * 仅当 AGENT_SHELL_ENABLED=true 时可用
 */
interface ShellInput {
  command: string;
  cwd?: string;
}

interface ShellOutput {
  stdout: string;
  stderr: string;
  code: number | null;
  error?: string;
}

registerSkill<ShellInput, ShellOutput>({
  id: "shell",
  name: "Shell 执行",
  description: "在工作区目录下执行单条 shell 命令，超时 30 秒，仅读/写工作区内文件。",
  requiredInputs: ["command"],
  riskLevel: "high",
  run: async ({ command, cwd }: ShellInput): Promise<ShellOutput> => {
    if (process.env.AGENT_SHELL_ENABLED !== "true") {
      return { stdout: "", stderr: "", code: null, error: "Shell 未启用（需设置 AGENT_SHELL_ENABLED=true）" };
    }
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const { getWorkspaceRoot } = await import("@/lib/workspace");
    const execAsync = promisify(exec);
    const root = getWorkspaceRoot();
    const workDir = cwd ? resolveWithinWorkspace(cwd) ?? root : root;
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workDir,
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });
      return { stdout: String(stdout), stderr: String(stderr), code: 0 };
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; code?: number };
      return {
        stdout: err.stdout ? String(err.stdout) : "",
        stderr: err.stderr ? String(err.stderr) : (e as Error).message,
        code: err.code ?? null,
      };
    }
  },
});

/**
 * mcp_call：调用已配置的 MCP 服务器上的工具
 */
interface McpCallInput {
  toolName: string;
  arguments?: Record<string, unknown>;
}

interface McpCallOutput {
  content: string;
  isError?: boolean;
  error?: string;
}

registerSkill<McpCallInput, McpCallOutput>({
  id: "mcp_call",
  name: "MCP 工具调用",
  description: "调用 MCP 服务器上注册的工具，需配置 MCP_SERVER_URL。",
  requiredInputs: ["toolName"],
  riskLevel: "medium",
  run: async ({ toolName, arguments: args }: McpCallInput): Promise<McpCallOutput> => {
    const config = getMcpConfig();
    if (!config) {
      return { content: "", isError: true, error: "未配置 MCP_SERVER_URL" };
    }
    try {
      const result = await mcpCallTool(config.url, toolName, args ?? {}, config.headers);
      const text = result.content?.map((c) => c.text).filter(Boolean).join("\n") ?? "";
      return { content: text, isError: result.isError };
    } catch (e) {
      return { content: "", isError: true, error: (e as Error).message };
    }
  },
});


