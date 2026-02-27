/**
 * 长期目标资料搜寻（PRD Phase 6.2）
 * 调用 LLM 生成与目标相关的推荐资源列表
 * TODO(Phase6-SearchAPI): 接入 Serper / Bing / Google CSE 做真实搜索后再用 LLM 摘要
 */
import type { GoalCategory } from "@/types";
import { DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL } from "./models";

export type LongTermGoalCategory = GoalCategory;

export interface ResearchResource {
  title: string;
  url: string;
  summary: string;
  type: "article" | "video" | "course" | "tool";
}

export interface ResearchResult {
  resources: ResearchResource[];
}

export interface ResearchInput {
  goal: string;
  category: LongTermGoalCategory;
}

/** 调用 LLM 生成推荐资源（真实 URL 需后续接 Search API 替换） */
export async function researchForGoal(input: ResearchInput): Promise<ResearchResult> {
  if (!DEEPSEEK_API_KEY) {
    return fallbackResearch(input);
  }

  const systemPrompt = [
    "你是一个资料搜寻助手。根据用户的长期目标，推荐 3~5 条最相关的学习/参考资源。",
    "每条资源包含：title（资源标题）、url（真实可访问的网址，不要编造）、summary（一句话摘要）、type（article/video/course/tool）。",
    "如果你不确定真实 URL，就用合理的搜索引擎链接（如 https://www.google.com/search?q=关键词）代替，不要编造不存在的网址。",
    "只输出 JSON，格式：{ \"resources\": [...] }。不要有任何多余文字。",
  ].join("\n");

  const categoryDesc: Record<LongTermGoalCategory, string> = {
    exam: "考试/备考",
    fitness: "健身/减肥",
    project: "项目交付/工作",
    travel: "旅行/出国",
    custom: "通用目标",
  };

  const userPrompt = [
    `目标：${input.goal}`,
    `类别：${categoryDesc[input.category] ?? "通用"}`,
    "",
    "请推荐 3~5 条与此目标最相关的资源（优先推荐权威、实用的内容）。",
    input.category === "fitness"
      ? "注意：健康/减肥类资源需标注「仅供参考，请咨询专业人士」。"
      : "",
  ].join("\n");

  try {
    const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
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
        max_tokens: 600,
        stream: false,
      }),
    });

    if (!res.ok) return fallbackResearch(input);

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) return fallbackResearch(input);

    let jsonText = content;
    if (jsonText.startsWith("```")) {
      const lines = jsonText.split("\n");
      lines.shift();
      while (lines.length > 0 && lines[lines.length - 1].trim().startsWith("```")) {
        lines.pop();
      }
      jsonText = lines.join("\n").trim();
    }

    const parsed = JSON.parse(jsonText) as { resources?: ResearchResource[] };
    if (!parsed.resources || parsed.resources.length === 0) {
      return fallbackResearch(input);
    }
    return { resources: parsed.resources };
  } catch {
    return fallbackResearch(input);
  }
}

/** LLM 失败时的兜底：返回搜索引擎链接 */
function fallbackResearch(input: ResearchInput): ResearchResult {
  const q = encodeURIComponent(input.goal);
  return {
    resources: [
      {
        title: `搜索「${input.goal}」相关资料`,
        url: `https://www.google.com/search?q=${q}`,
        summary: "点击查看 Google 搜索结果。",
        type: "article",
      },
    ],
  };
}
