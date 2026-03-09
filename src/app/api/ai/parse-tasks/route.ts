import { NextRequest, NextResponse } from "next/server";
import type { ActionHint } from "@/lib/ai/types";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canConsume, recordUsage, QUOTA_EXHAUSTED_MESSAGE } from "@/lib/quota";
import { logEvent } from "@/lib/analytics";
import { DEEPSEEK_API_KEY } from "@/lib/models";
import { getUnifiedCompletion } from "@/lib/ai/unified";
import { loadMemoryForPrompt } from "@/lib/agent-memory";

import type { GoalCategory } from "@/types";

/** 单条由大模型解析出的任务 */
export type ParsedTask = {
  /** 任务标题，例如"开项目复盘会" */
  title: string;
  /** 所属项目名称，可选；用于匹配现有项目 */
  projectName?: string;
  /** 开始日期 YYYY-MM-DD，由 AI 根据当前日期推算 */
  startDate?: string;
  /** 开始时间 HH:mm */
  startTime?: string;
  /** 结束时间 HH:mm */
  endTime?: string;
  /** 预计持续天数，默认 1 天 */
  durationDays?: number;
  /** 优先级：高 / 中 / 低 */
  priority?: "高" | "中" | "低";
  /** 是否为循环任务 */
  isRecurring?: boolean;
  /** 额外备注信息（不直接入库，仅展示用） */
  note?: string;
  /** 动作提示：用于后续 Deep Link 执行器 */
  actionHint?: ActionHint;
  /** 若为长期目标则填 "long_term_goal"，普通任务不填或为 undefined */
  type?: "long_term_goal";
  /** 长期目标的类别（仅 type=long_term_goal 时有效） */
  goalCategory?: GoalCategory;
};

type ParsedTasksResponse = {
  tasks: ParsedTask[];
};

/**
 * 调用 DeepSeek 将自然语言日程解析为结构化任务列表
 * - 输入：{ text: string, projects?: string[] }
 * - 输出：{ tasks: ParsedTask[] }
 */
/** Phase 7+：从图片中提取日程相关文字（需 OPENAI_API_KEY + 视觉模型） */
async function extractTextFromImage(base64: string, mimeType: string): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com";
  if (!openaiKey) return "";

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL ?? "gpt-4o",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "请从这张图片中识别与日程、任务、会议、待办相关的内容（如时间、地点、事件名），用简短中文列出，不要编造。若无相关内容则回复「无」。",
              },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    return content && content !== "无" ? content : "";
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest) {
  if (!DEEPSEEK_API_KEY) {
    return NextResponse.json(
      { error: "DeepSeek API key 未配置（DEEPSEEK_API_KEY）" },
      { status: 500 },
    );
  }

  let text = "";
  let projectNames: string[] = [];
  /** 来源：语音转写或文本输入，用于 PMF 埋点 */
  let source: "voice" | "text" = "text";
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData().catch(() => null);
    if (!formData) return NextResponse.json({ error: "无法解析表单" }, { status: 400 });
    const textField = formData.get("text");
    text = typeof textField === "string" ? textField.trim() : "";
    const projectsField = formData.get("projects");
    if (typeof projectsField === "string") {
      try {
        const arr = JSON.parse(projectsField) as unknown[];
        projectNames = Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
      } catch {
        projectNames = [];
      }
    }
    const file = formData.get("image") ?? formData.get("file");
    if (file && file instanceof Blob && file.size > 0) {
      const buf = Buffer.from(await file.arrayBuffer());
      const base64 = buf.toString("base64");
      const mime = file.type || "image/jpeg";
      const fromImage = await extractTextFromImage(base64, mime);
      if (fromImage) text = text ? `${text}\n\n（图片内容：${fromImage}）` : fromImage;
    }
    const sourceField = formData.get("source");
    if (sourceField === "voice" || sourceField === "text") source = sourceField;
  } else {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
    }
    const typed = body as { text?: unknown; projects?: unknown; source?: unknown };
    text = typeof typed.text === "string" ? typed.text.trim() : "";
    projectNames = Array.isArray(typed.projects) ? (typed.projects as string[]) : [];
    if (typed.source === "voice" || typed.source === "text") source = typed.source;
  }

  if (!text) {
    return NextResponse.json({ error: "缺少要解析的文本（或图片中未识别到日程内容）" }, { status: 400 });
  }

  // 尽量基于用户身份做配额控制，未登录用户统一视为 guest
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? "guest";
  const quota = await canConsume(userId, "parse_tasks");
  if (!quota.allowed) {
    return NextResponse.json({ error: QUOTA_EXHAUSTED_MESSAGE }, { status: 429 });
  }

  /** 传入已有项目名列表，帮助 AI 做项目匹配（已在上方从 body 或 formData 解析） */

  const todayISO = new Date().toISOString().slice(0, 10);
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][new Date().getDay()];

  const systemPrompt =
    "你是一名智能日程助理「小熊猫」，负责把用户的自然语言描述解析为结构化日程，并给出可选的动作提示（如打车/订餐/买票等）。" +
    "只输出 JSON，不要包含任何多余文字或注释。";

  const userPrompt = [
    `当前时间信息：今天是 ${todayISO}（星期${weekday}）。`,
    "",
    projectNames.length > 0
      ? `用户已有的项目列表：${projectNames.map((n) => `"${n}"`).join("、")}。请尽量将任务匹配到已有项目（模糊匹配即可，如"复盘会"可匹配包含"工作"的项目）。如果确实无法匹配任何已有项目，projectName 填空字符串。`
      : "用户目前没有已有项目，projectName 填空字符串即可。",
    "",
    "请从下面的描述中提取 1~10 条日程/任务，输出严格的 JSON：",
    "",
    text,
    "",
    "JSON 结构必须是：",
    "{",
    '  "tasks": [',
    "    {",
    '      "title": "任务标题，简短动词开头，例如：开项目复盘会",',
    '      "projectName": "匹配到的已有项目名称（完全使用已有列表中的名称），无法匹配则填空字符串",',
    '      "startDate": "YYYY-MM-DD 格式的日期，根据今天推算（如\'明天\'就是今天+1天，\'下周一\'就是最近的下个周一）",',
    '      "startTime": "HH:mm 格式的开始时间（如\'下午三点\'→\'15:00\'），未提及则留空字符串",',
    '      "endTime": "HH:mm 格式的结束时间，未提及则根据常识推断（如会议默认1小时），或留空字符串",',
    '      "durationDays": 预计持续天数（数字，至少 1，会议类默认 1）,',
    '      "priority": "高" | "中" | "低",',
    '      "isRecurring": 是否为循环任务（true/false）,',
    '      "note": "可选备注",',
    '      "actionHint": "ride_hailing | food_delivery | train_ticket | meeting | shopping | none",',
    '      "type": "long_term_goal（仅长期目标时填写，普通任务不填此字段）",',
    '      "goalCategory": "exam | fitness | project | travel | custom（仅 type=long_term_goal 时填写）"',
    "    }",
    "  ]",
    "}",
    "",
    "要求：",
    "1. 严格输出 JSON，不要有任何解释性文字。",
    "2. 时间推算必须基于今天的日期，不要用模糊表述。",
    '3. 若无法识别任务，返回 {"tasks":[]}。',
    "4. 当用户明显提到打车/订餐/买票/线上会议/购物等场景时，请合理设置 actionHint；无法判断时使用 none。",
    '5. 当识别到含明确 deadline 的长期目标时（关键词：考试、备考、减肥、健身、上线、交付、比赛、答辩、旅游、旅行、出国等），设置 "type": "long_term_goal"，并设置 "goalCategory" 为以下之一：',
    '   - exam（考试/备考/答辩）',
    '   - fitness（减肥/运动/健身）',
    '   - project（工作/项目/上线/交付）',
    '   - travel（旅游/旅行/出国/假期）',
    '   - custom（其他长期目标）',
  ].join("\n");

  try {
    const memoryStr = await loadMemoryForPrompt(userId);
    const systemPromptWithMemory =
      systemPrompt + (memoryStr ? "\n\n用户相关记忆：\n" + memoryStr : "");

    const result = await getUnifiedCompletion(
      [
        { role: "system", content: systemPromptWithMemory },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.2, maxTokens: 2048 },
    );
    await recordUsage(userId, "parse_tasks", new Date(), result.costUSD);
    if (userId && result.model && (result.costUSD ?? 0) > 0) {
      const { logRouterCall } = await import("@/lib/router-log");
      logRouterCall(userId, "parse_tasks", result.model, result.costUSD ?? 0);
    }
    const content = result.content;
    if (!content) {
      return NextResponse.json({ error: "AI 返回内容为空" }, { status: 502 });
    }

    const jsonText = extractJson(content);
    let parsed: ParsedTasksResponse;
    try {
      parsed = JSON.parse(jsonText) as ParsedTasksResponse;
    } catch (err) {
      // 日志脱敏：不记录任务/语音原文
      console.error("[ai/parse-tasks] JSON 解析失败，长度:", content?.length ?? 0, err);
      return NextResponse.json(
        { error: "AI 返回格式异常，请稍后重试。" },
        { status: 502 },
      );
    }

    if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
      return NextResponse.json({ error: "AI 返回中缺少 tasks 字段" }, { status: 502 });
    }

    // PMF 埋点：成功创建带 AI 解析的日程建议（含来源：语音/文本）
    await logEvent(userId, "parse_tasks_success", {
      source,
      task_count: parsed.tasks.length,
    });

    return NextResponse.json(parsed satisfies ParsedTasksResponse);
  } catch (err) {
    console.error("[ai/parse-tasks] 调用 DeepSeek 出错", err);
    return NextResponse.json({ error: "调用 DeepSeek 时发生异常，请稍后再试。" }, { status: 500 });
  }
}

/** 从可能带有 ```json 包裹的内容中提取纯 JSON 文本 */
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
