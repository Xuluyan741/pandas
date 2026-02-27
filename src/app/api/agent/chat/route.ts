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
import { canConsume, recordUsage } from "@/lib/quota";
import { DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL } from "@/lib/models";

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
      const session = await getServerSession(authOptions);
      const userId = session?.user?.id ?? "guest";

      const quota = await canConsume(userId, "agent_chat");
      if (!quota.allowed) {
        await sseEvent(writer, encoder, "reply", {
          text: "小熊猫今天的精力已经用完啦。如果你希望我继续帮你排忧解难，可以稍后再试，或者升级为会员以获得更多次数。",
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
        await sseEvent(writer, encoder, "reply", {
          text: rawContent || "我没有完全听懂，你能再说一次吗？",
          tasks: [],
        });
        return;
      }

      const parsedTasks = parsed.tasks ?? [];
      const reply = parsed.reply || "";

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

        await sseEvent(writer, encoder, "reply", {
          text: reply,
          tasks: results,
          actionCard,
        });
      } else {
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
