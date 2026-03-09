/**
 * /api/agent/chat — 小熊猫流式对话 API（SSE）
 * 支持 Thought → Action → Observation 拟人化交互
 * Phase 6：长期目标识别 → 搜资料 → 生成计划 → 返回完整清单
 */
import { NextRequest } from "next/server";
import {
  detectConflicts,
  formatConflictsForUser,
  type ConflictResult,
} from "@/lib/scheduler";
import type { Task, GoalCategory } from "@/types";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { ActionHint } from "@/lib/ai/types";
import { runSkill } from "@/lib/skills/registry";
import { discoverClawHubSkillsForTask } from "@/lib/skills/clawhub";
import { getInstalledCommunitySlugs } from "@/lib/skills/community-installed";
import { runCommunitySkill } from "@/lib/skills/community-run";
import { canConsume, recordUsage, QUOTA_EXHAUSTED_MESSAGE } from "@/lib/quota";
import { logRouterCall } from "@/lib/router-log";
import { saveArtifact } from "@/lib/artifacts";
import { DEEPSEEK_API_KEY } from "@/lib/models";
import { getUnifiedCompletion, getUnifiedCompletionWithTools } from "@/lib/ai/unified";
import type { ToolDefinition } from "@/lib/ai/types";
import { loadMemoryForPrompt } from "@/lib/agent-memory";
import { logEvent } from "@/lib/analytics";
import { getMcpConfigList } from "@/lib/mcp-config";
import { mcpListTools, mcpCallTool } from "@/lib/mcp-client";
import { selectMcpToolsForIntent } from "@/lib/mcp-intent";

interface ChatRequest {
  text: string;
  tasks: Task[];
  projects: string[];
}

const NEW_TASK_ID = "__NEW_TASK__";

/** 将事件写入 SSE 流 */
function sseEvent(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  event: string,
  data: unknown,
) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return writer.write(encoder.encode(payload));
}

/** 日期/星期辅助 */
function getDateContext() {
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
  const hour = now.getHours();
  return { todayISO, weekday, hour };
}

/** 纯规则动作识别（Deep Link 触发信号） */
function detectActionHintFromText(text: string): ActionHint {
  const t = text.toLowerCase();

  if (/打车|滴滴|高德打车|叫车|回家/.test(text) || /\b(didi|gaode)\b/.test(t)) {
    return "ride_hailing";
  }
  if (/外卖|点餐|订餐|美团|饿了么/.test(text) || /\b(meituan|ele)\b/.test(t)) {
    return "food_delivery";
  }
  if (/火车票|高铁|动车|12306/.test(text) || /\b(train|ticket)\b/.test(t)) {
    return "train_ticket";
  }
  if (/开会|线上会议|视频会议|腾讯会议|飞书会议|zoom/.test(text) || /\bmeeting\b/.test(t)) {
    return "meeting";
  }
  if (/买.*东西|买衣服|购物|淘宝|京东|拼多多/.test(text) || /\b(taobao|jd|pdd)\b/.test(t)) {
    return "shopping";
  }
  return "none";
}

/** 检测是否为「查资料/搜索」意图（主对话内接入 web_search 用） */
function hasSearchIntent(text: string): boolean {
  return /搜一下|查一下|搜索|查资料|帮我搜|调研|了解一下|找.*资料/.test(text);
}

/** 从用户消息中提取搜索关键词 */
function extractSearchQuery(text: string): string {
  const cleaned = text
    .replace(/^(帮我)?(搜一下|查一下|搜索|查资料|调研)\s*[:：]?\s*/i, "")
    .replace(/^(了解一下|找一下)\s*[:：]?\s*/i, "")
    .trim();
  return cleaned || text.trim().slice(0, 80);
}

/** 检测是否为长期目标请求，返回类别。null 表示非长期目标 */
function detectGoalCategory(text: string): GoalCategory | null {
  if (/旅游|旅行|出国|行程|假期|韩国|日本|欧洲|美国|泰国|香港|澳门|机票|酒店/.test(text) ||
      /travel|trip|vacation|holiday/i.test(text)) {
    return "travel";
  }
  if (/考试|备考|考研|考公|雅思|托福|GRE|答辩|期末|高考|中考/.test(text) ||
      /exam|test prep/i.test(text)) {
    return "exam";
  }
  if (/减肥|健身|减脂|增肌|运动|跑步|马拉松|体重|瘦/.test(text) ||
      /fitness|diet|workout/i.test(text)) {
    return "fitness";
  }
  if (/上线|交付|项目|发布|里程碑|deadline/.test(text) ||
      /launch|deliver|release/i.test(text)) {
    return "project";
  }
  if (/规划|计划|目标|准备|安排.*长期/.test(text)) {
    return "custom";
  }
  return null;
}

/** 从文本中推断截止日期 */
function inferDeadline(text: string, todayISO: string): string | null {
  const year = todayISO.slice(0, 4);
  const todayDate = new Date(todayISO);
  const dayOfWeek = todayDate.getDay(); // 0=周日, 1=周一, ..., 6=周六

  // 这周/本周/这一周 → 本周最后一天（周日）
  if (/这周|本周|这一周|这周内|本周内/.test(text)) {
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    const d = new Date(todayDate);
    d.setDate(d.getDate() + daysUntilSunday);
    return d.toISOString().slice(0, 10);
  }

  // 下周 → 下周日（本周日 + 7 天）
  if (/下周|下一周/.test(text)) {
    const daysUntilNextSunday = dayOfWeek === 0 ? 7 : 14 - dayOfWeek;
    const d = new Date(todayDate);
    d.setDate(d.getDate() + daysUntilNextSunday);
    return d.toISOString().slice(0, 10);
  }

  const holidayMap: Record<string, string> = {
    "五一": `${year}-05-01`,
    "国庆": `${year}-10-01`,
    "元旦": `${Number(year) + 1}-01-01`,
    "春节": `${Number(year) + 1}-02-01`,
    "暑假": `${year}-07-01`,
    "寒假": `${Number(year) + 1}-01-15`,
  };

  for (const [keyword, dateStr] of Object.entries(holidayMap)) {
    if (text.includes(keyword)) {
      let d = new Date(dateStr);
      if (d < todayDate) {
        d = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
      }
      return d.toISOString().slice(0, 10);
    }
  }

  // "X月X日" 格式
  const dateMatch = text.match(/(\d{1,2})月(\d{1,2})[日号]/);
  if (dateMatch) {
    let d = new Date(Number(year), Number(dateMatch[1]) - 1, Number(dateMatch[2]));
    if (d < todayDate) {
      d = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
    }
    return d.toISOString().slice(0, 10);
  }

  return null;
}

/** 推断「明天」的日期（用于 fallback 单任务） */
function inferTomorrowISO(todayISO: string): string {
  const d = new Date(todayISO);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * 当 LLM 未输出任务但用户明显说了「时间+要完成的事」时，用规则补一条任务，避免只回复不写入日程
 */
function fallbackTaskFromText(text: string, todayISO: string): { title: string; startDate: string } | null {
  const hasDeadline =
    /明天|后天|这周|本周|下周|这两天|礼拜|星期|截止|之前要|之前得|之前完成|晚上要|早上要|今天|下午|早上/.test(text) ||
    /\d{1,2}月\d{1,2}/.test(text);
  const hasTask =
    /要完成|要做|得交|得完成|要交|要准备|要写|要做|完成.*PPT|做.*PPT|写.*报告|交.*作业|记.*日程|记一下|帮我记|安排一下/.test(text);
  if (!hasDeadline || !hasTask) return null;

  let startDate: string;
  if (/明天|明日/.test(text)) {
    startDate = inferTomorrowISO(todayISO);
  } else if (/后天/.test(text)) {
    const d = new Date(todayISO);
    d.setDate(d.getDate() + 2);
    startDate = d.toISOString().slice(0, 10);
  } else {
    startDate = inferDeadline(text, todayISO) ?? todayISO;
  }

  const titleMatch =
    text.match(/(?:要完成|要做|得完成|要交|要准备|要写)\s*[：:]*\s*([^，。！？\n]+)/) ||
    text.match(/完成\s*([^，。！？\n]+)/) ||
    text.match(/做\s*([^，。！？\n]+)/);
  const title = titleMatch ? titleMatch[1].trim().slice(0, 80) : "待办事项";
  return { title, startDate };
}

/**
 * 当用户说了多件事（如「写简历、模拟面试、投简历」）但 LLM 未输出多任务时，用规则拆成多条任务，确保「已记到日程」时真的写入
 */
function fallbackMultipleTasksFromText(
  text: string,
  todayISO: string,
): Array<{ title: string; startDate: string }> | null {
  const hasTaskIntent =
    /要完成|要做|得交|得完成|要交|要准备|要写|记.*日程|记一下|帮我记|安排一下|都?记到/.test(text);
  if (!hasTaskIntent) return null;

  let startDate: string;
  if (/明天|明日/.test(text)) {
    startDate = inferTomorrowISO(todayISO);
  } else if (/后天/.test(text)) {
    const d = new Date(todayISO);
    d.setDate(d.getDate() + 2);
    startDate = d.toISOString().slice(0, 10);
  } else {
    startDate = inferDeadline(text, todayISO) ?? todayISO;
  }

  const listMatch =
    text.match(/(?:要完成|要做|得完成|要交|要准备|要写|把|都)\s*[：:]*\s*([^。！？\n]+?)(?:都?记|了|$)/) ||
    text.match(/([^，。！？\n]+(?:、[^，。！？\n]+)+)/);
  const segment = listMatch ? listMatch[1].trim() : text;
  const parts = segment
    .split(/[、，]\s*|\s+和\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 60 && !/^(今天|明天|后天|这周|下周)/.test(s));
  if (parts.length < 2) return null;
  return parts.map((title) => ({ title, startDate }));
}

export async function POST(req: NextRequest) {
  if (!DEEPSEEK_API_KEY) {
    return new Response(
      JSON.stringify({ error: "DeepSeek API key 未配置" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return new Response(
      JSON.stringify({ error: "请求体必须为 JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { text, tasks, projects } = body;
  if (!text?.trim()) {
    return new Response(
      JSON.stringify({ error: "缺少要解析的文本" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      const { todayISO, weekday, hour } = getDateContext();
      const internalUserId = req.headers.get("x-internal-user-id");
      const internalSecret = req.headers.get("x-internal-secret");
      const cronSecret = process.env.CRON_SECRET;
      const isInternal = cronSecret && internalSecret === cronSecret && internalUserId;
      const session = isInternal ? null : await getServerSession(authOptions);
      const userId = isInternal ? internalUserId! : (session?.user?.id ?? "guest");

      const quota = await canConsume(userId, "agent_chat");
      if (!quota.allowed) {
        await sseEvent(writer, encoder, "reply", {
          text: QUOTA_EXHAUSTED_MESSAGE,
          tasks: [],
        });
        await writer.close();
        return;
      }

      const timeOfDay =
        hour < 6 ? "深夜" : hour < 12 ? "上午" : hour < 18 ? "下午" : "晚上";

      /* ── Step 1: Thought ── */
      await sseEvent(writer, encoder, "thought", {
        step: "parse",
        message: "正在理解你的意思…",
      });

      // ── 检测是否为长期目标 ──
      const goalCategory = detectGoalCategory(text);

      if (goalCategory) {
        // 长期目标流程：识别 → 搜资料 → 生成计划 → 返回完整清单
        await sseEvent(writer, encoder, "thought", {
          step: "goal_detect",
          message: "识别到长期目标，正在搜集资料并生成计划…",
        });

        let deadline = inferDeadline(text, todayISO);
        if (!deadline) {
          const d = new Date();
          d.setDate(d.getDate() + 30);
          deadline = d.toISOString().slice(0, 10);
        }

        await recordUsage(userId, "agent_chat");

        const goalId = `goal-${Date.now()}`;
        const baseTitle = text.replace(/帮我|规划|安排|制定|计划/g, "").trim() || text;

        try {
          const planResult = await runSkill<
            {
              goalId: string;
              title: string;
              deadline: string;
              category: GoalCategory;
              existingTasks: Task[];
            },
            {
              plan: {
                tasks: {
                  name: string;
                  startDate: string;
                  duration: number;
                  priority: "高" | "中" | "低";
                  resourceUrl?: string;
                }[];
              };
              research: {
                resources: { title: string; url: string; summary: string; type: string }[];
              };
            }
          >("long_term_goal_planner", {
            goalId,
            title: baseTitle,
            deadline,
            category: goalCategory,
            existingTasks: tasks,
          });

          await sseEvent(writer, encoder, "thought", {
            step: "goal_plan_done",
            message: "计划已生成，正在整理清单…",
          });

          const allTasks = planResult.plan.tasks;
          const resources = planResult.research.resources;

          // 安全声明（健康类）
          const healthDisclaimer = goalCategory === "fitness"
            ? "\n\n*以上健身/减肥建议仅供参考，具体方案请咨询专业人士。"
            : "";

          // 组装友好回复文案
          const taskLines = allTasks.map((t, i) => {
            let line = `${i + 1}. 📅 ${t.startDate} · ${t.name}（${t.priority}优先级）`;
            if (t.resourceUrl) {
              line += `\n   📎 参考：${t.resourceUrl}`;
            }
            return line;
          });

          const resourceLines = resources.length > 0
            ? "\n\n📚 推荐资料：\n" + resources.map((r) =>
                `  · [${r.title}](${r.url})\n    ${r.summary}`
              ).join("\n")
            : "";

          const replyText = [
            `好的！我已经为「${baseTitle}」制定了一份详细的准备计划（截止 ${deadline}）：\n`,
            taskLines.join("\n"),
            resourceLines,
            healthDisclaimer,
            "\n\n这只是初步方案，你可以点击「一键写入到日历」把它们加入你的日程，后续随时可以调整。",
          ].join("");

          await sseEvent(writer, encoder, "reply", {
            text: replyText,
            tasks: [],
            goalPlan: {
              goalId,
              title: baseTitle,
              deadline,
              category: goalCategory,
              preview: allTasks.map((t) => ({
                name: t.name,
                startDate: t.startDate,
                duration: t.duration,
                priority: t.priority,
                resourceUrl: t.resourceUrl,
              })),
              resources,
            },
          });
        } catch (err) {
          console.error("[agent/chat] goal planner failed", err);

          // LLM 和 Skill 都失败时的友好降级
          const aiReply = `我试着为你规划「${baseTitle}」，但遇到了一些问题。你可以先把这个目标记下来，稍后我再帮你生成详细的计划。`;
          await sseEvent(writer, encoder, "reply", {
            text: aiReply,
            tasks: [],
          });
        }

        await writer.close();
        return;
      }

      // ── 普通对话/任务流程 ──
      const systemPrompt = [
        `你是小熊猫，一个温暖又高效的智能日程管家。现在是${todayISO}（星期${weekday}）${timeOfDay}。`,
        "把用户的自然语言描述解析为结构化日程，同时用温暖关心的口吻回复。",
        "必须输出严格的 JSON，字段如下（不要包含其他文字）：",
        "{",
        '  "reply": "用一两句温暖口吻回复用户（纯文本，不要JSON）",',
        '  "tasks": [{',
        '    "title": "任务标题",',
        '    "projectName": "匹配的项目名/空字符串",',
        '    "startDate": "YYYY-MM-DD",',
        '    "startTime": "HH:mm/空字符串",',
        '    "endTime": "HH:mm/空字符串",',
        '    "durationDays": 1,',
        '    "priority": "高/中/低",',
        '    "isRecurring": false',
        "  }]",
        "}",
        "",
        "要求：",
        "1. 时间推算基于今天日期；'明天'=今天+1天；'明天晚上'=明天日期、可选 endTime 如 21:00；'这两天'=今天起共2天；'这周'=本周内；'下周一'=最近的下个周一。",
        "2. reply 要简短温暖，像好朋友说话，融入当前时间段的关心；但回复里可以同时提醒「已帮你记到日程」或「记得明天白天来做」。",
        "3. 只要用户提到了「要做的事」且带有时间意向（如「明天要完成」「明天晚上要交」「这周要做」「截止」「得完成」等），必须在 tasks 里输出至少一条任务，否则无法真正加入日程。不要只回复关心语而 tasks 为空。",
        "4. 例如：用户说「明天晚上要完成PPT」→ 必须输出 tasks: [{ title: \"完成PPT\", startDate: 明天日期, ... }]；用户说「这周要交报告」→ 必须输出至少一条对应任务。",
        '5. 仅当用户纯闲聊、问候或明确说「不用记」「不用安排」时，tasks 才为空数组。',
        "6. 不要输出 markdown 格式。",
      ].join("\n");

      const userPrompt = [
        projects.length > 0
          ? `用户已有项目：${projects.map((n) => `"${n}"`).join("、")}。尽量匹配已有项目。`
          : "用户目前没有已有项目。",
        "",
        `用户说：${text}`,
      ].join("\n");

      // 即用即删：按当前输入在 ClawHub 搜索匹配技能，仅当轮注入 context；PRD 第十一章：已安装则执行，未安装则推荐安装
      let communitySkillsBlock = "";
      let skillsUsedInTurn: { slug: string; displayName: string }[] = [];
      let toRunSkill: { slug: string; displayName: string } | null = null;
      let suggestInstall: { slug: string; displayName: string } | null = null;
      if (process.env.CLAWHUB_API_BASE !== "0") {
        try {
          const skillsForTurn = await discoverClawHubSkillsForTask(text, 2, 1800);
          if (skillsForTurn.length > 0) {
            skillsUsedInTurn = skillsForTurn.map((s) => ({
              slug: s.slug,
              displayName: s.displayName,
            }));
            communitySkillsBlock =
              "\n\n本轮参考的社区技能（仅当轮有效，用后即删）：\n" +
              skillsForTurn
                .map(
                  (s) =>
                    `【${s.displayName}】(slug: ${s.slug})\n${s.excerpt.slice(0, 900)}`,
                )
                .join("\n\n---\n\n");
            if (userId && userId !== "guest") {
              const installed = await getInstalledCommunitySlugs(userId);
              const toRun = skillsForTurn.find((s) => installed.includes(s.slug));
              const toSuggest = skillsForTurn.find((s) => !installed.includes(s.slug));
              if (toRun) toRunSkill = { slug: toRun.slug, displayName: toRun.displayName };
              if (toSuggest) suggestInstall = { slug: toSuggest.slug, displayName: toSuggest.displayName };
            }
            await sseEvent(writer, encoder, "skills_used", {
              skills: skillsUsedInTurn,
            });
          }
        } catch {
          // ClawHub 不可用时静默跳过，不影响主流程
        }
      }

      const memoryStr = await loadMemoryForPrompt(userId);
      const systemPromptWithMemory =
        systemPrompt +
        (memoryStr ? "\n\n用户相关记忆：\n" + memoryStr : "") +
        communitySkillsBlock;

      const completionResult = await getUnifiedCompletion(
        [
          { role: "system", content: systemPromptWithMemory },
          { role: "user", content: userPrompt },
        ],
        { temperature: 0.3, maxTokens: 800 },
      );
      const rawContent = completionResult.content;
      await recordUsage(userId, "agent_chat", new Date(), completionResult.costUSD);
      if (userId && completionResult.model && (completionResult.costUSD ?? 0) > 0) {
        logRouterCall(userId, "agent_chat", completionResult.model, completionResult.costUSD ?? 0);
      }
      const jsonText = extractJson(rawContent);

      let parsed: {
        reply?: string;
        tasks?: Array<{
          title: string;
          projectName?: string;
          startDate?: string;
          startTime?: string;
          endTime?: string;
          durationDays?: number;
          priority?: "高" | "中" | "低";
          isRecurring?: boolean;
        }>;
      };

      try {
        parsed = JSON.parse(jsonText);
      } catch {
        // JSON 解析失败时仍尝试规则兜底：若用户明显说了「时间+要完成的事」，补一条任务，避免回复「已记到日程」却未写入
        const fallback = fallbackTaskFromText(text, todayISO);
        if (fallback) {
          parsed = {
            reply: rawContent?.trim().slice(0, 500) || "收到，已帮你记到日程里了。",
            tasks: [
              {
                title: fallback.title,
                projectName: "",
                startDate: fallback.startDate,
                startTime: "",
                endTime: "",
                durationDays: 1,
                priority: "中",
                isRecurring: false,
              },
            ],
          };
        } else {
          await sseEvent(writer, encoder, "reply", {
            text: rawContent || "我没有完全听懂，你能再说一次吗？",
            tasks: [],
            ...(skillsUsedInTurn.length > 0 && { communitySkills: skillsUsedInTurn }),
          });
          return;
        }
      }

      let parsedTasks = parsed.tasks ?? [];
      const reply = parsed.reply || "";

      // 当用户明显说了「时间+要完成的事」但 LLM 未输出任务时，用规则补任务，确保「已记到日程」时真的写入
      if (parsedTasks.length === 0) {
        const multi = fallbackMultipleTasksFromText(text, todayISO);
        if (multi?.length) {
          parsedTasks = multi.map(({ title, startDate }) => ({
            title,
            projectName: "",
            startDate,
            startTime: "",
            endTime: "",
            durationDays: 1,
            priority: "中",
            isRecurring: false,
          }));
        } else {
          const fallback = fallbackTaskFromText(text, todayISO);
          if (fallback) {
            parsedTasks = [
              {
                title: fallback.title,
                projectName: "",
                startDate: fallback.startDate,
                startTime: "",
                endTime: "",
                durationDays: 1,
                priority: "中",
                isRecurring: false,
              },
            ];
          }
        }
      }

      // 网页搜索意图：接入 web_search 技能，结果追加到回复（需配置 SERPER_API_KEY 或 BRAVE_API_KEY）
      let searchBlock = "";
      if (hasSearchIntent(text)) {
        await sseEvent(writer, encoder, "thought", {
          step: "search",
          message: "正在联网搜索…",
        });
        try {
          const query = extractSearchQuery(text);
          const searchResult = await runSkill<
            { query: string; num?: number },
            { results: { title: string; url: string; snippet: string }[]; error?: string }
          >("web_search", { query, num: 5 });
          if (searchResult.results?.length > 0) {
            searchBlock =
              "\n\n【网页搜索】\n" +
              searchResult.results
                .map(
                  (r, i) =>
                    `${i + 1}. ${r.title}\n   ${r.url}\n   ${(r.snippet || "").slice(0, 120)}${(r.snippet?.length ?? 0) > 120 ? "…" : ""}`,
                )
                .join("\n\n");
          } else if (searchResult.error) {
            searchBlock = "\n\n【网页搜索】暂时无法联网搜索（未配置 SERPER_API_KEY 或 BRAVE_API_KEY）。";
          }
        } catch {
          searchBlock = "\n\n【网页搜索】搜索时出了点问题，请稍后再试。";
        }
      }

      // Deep Link 动作识别
      const actionHint: ActionHint = detectActionHintFromText(text);
      let actionCard: {
        title: string;
        description: string;
        url: string;
        riskLevel: "low" | "medium" | "high";
      } | undefined;

      if (actionHint !== "none") {
        try {
          const deepLink = await runSkill<
            { action: ActionHint; text: string },
            {
              url: string;
              appName: string;
              title: string;
              description: string;
              riskLevel: "low" | "medium" | "high";
            }
          >("deep_link_executor", { action: actionHint, text }, { userId });

          if (deepLink.url) {
            actionCard = {
              title: deepLink.title || `打开 ${deepLink.appName}`,
              description: deepLink.description,
              url: deepLink.url,
              riskLevel: deepLink.riskLevel,
            };
          }
        } catch {
          // Deep Link 技能失败时静默降级
        }
      }

      /* ── Step 2: Action — 冲突检测 ── */
      if (parsedTasks.length > 0) {
        await sseEvent(writer, encoder, "thought", {
          step: "conflict",
          message: `识别到 ${parsedTasks.length} 个任务，正在检查日程冲突…`,
        });

        const results: Array<{
          task: (typeof parsedTasks)[0];
          conflict?: {
            hasConflict: boolean;
            suggestions: Array<{
              taskId: string;
              taskName: string;
              action: string;
              proposedStart?: string;
              proposedEnd?: string;
              reason: string;
            }>;
            summary: string;
          };
        }> = [];

        for (const t of parsedTasks) {
          const tempTask: Task = {
            id: `temp-${Date.now()}-${Math.random()}`,
            name: t.title,
            projectId: "",
            startDate: t.startDate || todayISO,
            startTime: t.startTime || undefined,
            endTime: t.endTime || undefined,
            duration: t.durationDays && t.durationDays > 0 ? t.durationDays : 1,
            dependencies: [],
            status: "To Do",
            priority: t.priority ?? "中",
            isRecurring: t.isRecurring ?? false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          const conflictResult = detectConflicts(tempTask, tasks);

          if (conflictResult.hasConflict) {
            const conflictAdvice = generateConflictAdvice(conflictResult);
            results.push({
              task: t,
              conflict: {
                hasConflict: true,
                suggestions: conflictResult.suggestions.map((s) => ({
                  taskId: s.taskId === tempTask.id ? NEW_TASK_ID : s.taskId,
                  taskName: s.taskName,
                  action: s.action,
                  proposedStart: s.proposedStart?.toISOString(),
                  proposedEnd: s.proposedEnd?.toISOString(),
                  reason: s.reason,
                })),
                summary: conflictAdvice,
              },
            });
          } else {
            results.push({ task: t });
          }
        }

        await sseEvent(writer, encoder, "thought", {
          step: "done",
          message: "分析完成，这是我的建议。",
        });

        // PMF 埋点：Agent 成功返回带冲突消解/AI 建议的日程
        const hasConflict = results.some((r) => r.conflict?.hasConflict);
        await logEvent(userId, "agent_chat_schedule_suggested", {
          has_conflict: hasConflict,
          task_count: results.length,
        });
        if (userId && hasConflict) {
          const summary = results
            .filter((r) => r.conflict?.summary)
            .map((r) => r.conflict!.summary)
            .join("\n");
          if (summary) saveArtifact(userId, "conflict_advice", summary).catch(() => {});
        }

        // PRD 第十一章：已安装的社区技能在本轮执行，结果追加到回复；网页搜索结果一并追加
        let replyText = reply + searchBlock;
        if (toRunSkill) {
          try {
            const exec = await runCommunitySkill(toRunSkill.slug, text);
            if (exec.content) {
              replyText += "\n\n【技能「" + toRunSkill.displayName + "」】\n" + exec.content;
            }
          } catch {
            // 技能执行失败不阻塞主回复
          }
        }
        // 主对话内直接使用 MCP：配好 MCP_SERVER_URL 或安装过 MCP 后，自动按意图调用并追加结果
        try {
          const mcpBlock = await runMcpRoundForMainChat(text, userId);
          if (mcpBlock) {
            await sseEvent(writer, encoder, "thought", { step: "mcp", message: "正在使用 MCP 工具…" });
            replyText += mcpBlock;
          }
        } catch {
          // MCP 失败不阻塞主回复
        }
        await sseEvent(writer, encoder, "reply", {
          text: replyText,
          tasks: results,
          actionCard,
          ...(skillsUsedInTurn.length > 0 && { communitySkills: skillsUsedInTurn }),
          ...(suggestInstall && { suggestInstall }),
        });
      } else {
        let replyText = (reply || rawContent || "收到～有什么需要安排的随时告诉我。") + searchBlock;
        if (toRunSkill) {
          try {
            const exec = await runCommunitySkill(toRunSkill.slug, text);
            if (exec.content) {
              replyText += "\n\n【技能「" + toRunSkill.displayName + "」】\n" + exec.content;
            }
          } catch {
            // 技能执行失败不阻塞主回复
          }
        }
        try {
          const mcpBlock = await runMcpRoundForMainChat(text, userId);
          if (mcpBlock) {
            await sseEvent(writer, encoder, "thought", { step: "mcp", message: "正在使用 MCP 工具…" });
            replyText += mcpBlock;
          }
        } catch {
          // MCP 失败不阻塞主回复
        }
        await sseEvent(writer, encoder, "reply", {
          text: replyText,
          actionCard,
          tasks: [],
          ...(skillsUsedInTurn.length > 0 && { communitySkills: skillsUsedInTurn }),
          ...(suggestInstall && { suggestInstall }),
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "小熊猫遇到了一点问题";
      await sseEvent(writer, encoder, "error", { message: msg });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function generateConflictAdvice(result: ConflictResult): string {
  const summary = formatConflictsForUser(result);
  if (!summary) return "";
  return `嘿，\n${summary}`;
}

function extractJson(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("```")) {
    const lines = trimmed.split("\n");
    lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim().startsWith("```")) {
      lines.pop();
    }
    return lines.join("\n").trim();
  }
  return trimmed;
}

/**
 * 主对话内直接使用 MCP：若配置了 MCP 且用户输入匹配到工具，执行一轮并返回要追加的文案
 */
async function runMcpRoundForMainChat(
  text: string,
  userId: string | null,
): Promise<string> {
  const configList = await getMcpConfigList(userId);
  if (configList.length === 0) return "";

  const mergedTools: { name: string; description?: string; inputSchema?: Record<string, unknown> }[] = [];
  const callMap: Record<string, { url: string; headers?: Record<string, string>; originalName: string }> = {};

  for (const config of configList) {
    try {
      const { tools } = await mcpListTools(config.url, config.headers);
      for (const t of tools) {
        const prefixedName = `${config.slug}_${t.name}`;
        mergedTools.push({
          name: prefixedName,
          description: t.description ? `[${config.name}] ${t.description}` : `[${config.name}]`,
          inputSchema: t.inputSchema,
        });
        callMap[prefixedName] = { url: config.url, headers: config.headers, originalName: t.name };
      }
    } catch {
      // 单台失败不影响其他
    }
  }

  const selected = selectMcpToolsForIntent(text, mergedTools, { maxTools: 3 });
  if (selected.length === 0) return "";

  const toolDefs: ToolDefinition[] = selected.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description ?? "",
      parameters: (t.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
    },
  }));

  const result = await getUnifiedCompletionWithTools(
    [
      { role: "system", content: "根据用户输入，若需要可调用工具完成任务；无须调用则简短回复。" },
      { role: "user", content: text },
    ],
    toolDefs,
    { temperature: 0.3, maxTokens: 1024 },
  );
  if (!result.toolCalls?.length) return "";

  const parts: string[] = [];
  for (const tc of result.toolCalls) {
    const lookup = callMap[tc.name];
    if (!lookup) continue;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.arguments || "{}") as Record<string, unknown>;
    } catch {
      // ignore
    }
    const callResult = await mcpCallTool(lookup.url, lookup.originalName, args, lookup.headers);
    const textContent = callResult.content?.map((c) => c.text).filter(Boolean).join("\n") ?? "";
    if (textContent) parts.push(textContent);
  }
  if (parts.length === 0) return "";
  return "\n\n【MCP】\n" + parts.join("\n\n");
}
