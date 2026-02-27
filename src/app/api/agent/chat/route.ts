/**
 * /api/agent/chat — 小熊猫流式对话 API（SSE）
 * 支持 Thought → Action → Observation 拟人化交互
 * POST { text: string, tasks: Task[], projects: string[] }
 */
import { NextRequest } from "next/server";
import {
  detectConflicts,
  formatConflictsForUser,
  type ConflictResult,
} from "@/lib/scheduler";
import type { Task } from "@/types";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { ActionHint } from "@/lib/ai/types";
import { runSkill } from "@/lib/skills/registry";
import { canConsume, recordUsage } from "@/lib/quota";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";

interface ChatRequest {
  text: string;
  tasks: Task[];
  projects: string[];
}

// 用于在建议列表中标记「针对新任务本身」的调整
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

/** 纯规则动作识别：避免额外 LLM 调用，作为 Deep Link 的触发信号 */
function detectActionHintFromText(text: string): ActionHint {
  const t = text.toLowerCase();

  // 打车/出行相关
  if (
    /打车|滴滴|高德打车|叫车|回家/.test(text) ||
    /\b(didi|gaode)\b/.test(t)
  ) {
    return "ride_hailing";
  }

  // 订餐/外卖
  if (
    /外卖|点餐|订餐|美团|饿了么/.test(text) ||
    /\b(meituan|ele)\b/.test(t)
  ) {
    return "food_delivery";
  }

  // 火车票/高铁
  if (
    /火车票|高铁|动车|12306/.test(text) ||
    /\b(train|ticket)\b/.test(t)
  ) {
    return "train_ticket";
  }

  // 线上会议
  if (
    /开会|线上会议|视频会议|腾讯会议|飞书会议|zoom/.test(text) ||
    /\bmeeting\b/.test(t)
  ) {
    return "meeting";
  }

  // 购物
  if (
    /买.*东西|买衣服|购物|淘宝|京东|拼多多/.test(text) ||
    /\b(taobao|jd|pdd)\b/.test(t)
  ) {
    return "shopping";
  }

  return "none";
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

  /* 在后台执行 Agent 流程 */
  (async () => {
    try {
      const { todayISO, weekday, hour } = getDateContext();
      const session = await getServerSession(authOptions);
      const userId = session?.user?.id ?? "guest";

      // ── 配额检查：超出后友好提示 ──
      const quota = await canConsume(userId, "agent_chat");
      if (!quota.allowed) {
        await sseEvent(writer, encoder, "reply", {
          text:
            "小熊猫今天的精力已经用完啦。如果你希望我继续帮你排忧解难，可以稍后再试，或者升级为会员以获得更多次数。",
          tasks: [],
        });
        await writer.close();
        return;
      }
      const timeOfDay =
        hour < 6 ? "深夜" : hour < 12 ? "上午" : hour < 18 ? "下午" : "晚上";

      /* ── Step 1: Thought — 小熊猫开始思考 ── */
      await sseEvent(writer, encoder, "thought", {
        step: "parse",
        message: "正在理解你的意思…",
      });

      /* ── 调用 AI 解析任务 ── */
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
        "1. 时间推算基于今天日期；'明天'=今天+1天；'下周一'=最近的下个周一。",
        "2. reply 要简短温暖，像好朋友说话，融入当前时间段的关心。",
        '3. 若用户输入不包含具体任务，reply 正常回复，tasks 为空数组。',
        "4. 不要输出 markdown 格式。",
      ].join("\n");

      const userPrompt = [
        projects.length > 0
          ? `用户已有项目：${projects.map((n) => `"${n}"`).join("、")}。尽量匹配已有项目。`
          : "用户目前没有已有项目。",
        "",
        `用户说：${text}`,
      ].join("\n");

      // 通过配额检查后再实际扣减
      await recordUsage(userId, "agent_chat");

      const aiRes = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 800,
          stream: false,
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text().catch(() => "");
        throw new Error(`AI 调用失败：${aiRes.status} ${errText}`);
      }

      const aiData = (await aiRes.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const rawContent = aiData.choices?.[0]?.message?.content ?? "";
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
        /* AI 没返回结构化 JSON，当成纯聊天回复 */
        await sseEvent(writer, encoder, "reply", {
          text: rawContent || "我没有完全听懂，你能再说一次吗？",
          tasks: [],
        });
        return;
      }

      const parsedTasks = parsed.tasks ?? [];
      const reply = parsed.reply || "";

      // 规则层动作识别（用于 Deep Link 技能）
      const actionHint: ActionHint = detectActionHintFromText(text);
      let actionCard: { title: string; description: string; url: string; riskLevel: "low" | "medium" | "high" } | undefined;

      if (actionHint !== "none") {
        try {
          const deepLink = await runSkill<{
            action: ActionHint;
            text: string;
          }, {
            url: string;
            appName: string;
            title: string;
            description: string;
            riskLevel: "low" | "medium" | "high";
          }>("deep_link_executor", { action: actionHint, text }, { userId });

          if (deepLink.url) {
            actionCard = {
              title: deepLink.title || `打开 ${deepLink.appName}`,
              description: deepLink.description,
              url: deepLink.url,
              riskLevel: deepLink.riskLevel,
            };
          }
        } catch {
          // Deep Link 技能失败时静默降级，不影响主流程
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

        /* ── Step 3: Observation — 返回结果 ── */
        await sseEvent(writer, encoder, "thought", {
          step: "done",
          message: "分析完成，这是我的建议。",
        });

        await sseEvent(writer, encoder, "reply", {
          text: reply,
          tasks: results,
          actionCard,
        });
      } else {
        /* 纯对话，无任务 */
        await sseEvent(writer, encoder, "reply", {
          text: reply || rawContent || "收到～有什么需要安排的随时告诉我。",
          actionCard,
          tasks: [],
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

/**
 * 为冲突生成用户可读建议——使用纯算法输出，避免额外 LLM 调用
 * 原 LLM 文案约需 5~20 秒，算法输出瞬时完成，显著降低体感延迟
 */
function generateConflictAdvice(result: ConflictResult): string {
  const summary = formatConflictsForUser(result);
  if (!summary) return "";
  return `嘿，\n${summary}`;
}

/** 从可能带有 ```json 包裹的内容中提取纯 JSON */
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
