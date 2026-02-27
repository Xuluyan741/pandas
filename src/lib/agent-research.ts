/**
 * 长期目标资料搜寻（PRD Phase 6.2）
 * - 先调用 Search API（Serper）获取真实搜索结果
 * - 再用 LLM 对搜索结果做摘要与筛选，输出统一结构
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

const SERPER_API_KEY = process.env.SERPER_API_KEY;
const SERPER_BASE_URL =
  process.env.SERPER_BASE_URL ?? "https://google.serper.dev/search";

interface SerperOrganicItem {
  title?: string;
  link?: string;
  snippet?: string;
}

interface SerperSearchResponse {
  organic?: SerperOrganicItem[];
}

/** 调用 Serper Search API，返回原始搜索结果（不做 LLM 处理） */
async function searchWithSerper(
  query: string,
  category: LongTermGoalCategory,
): Promise<ResearchResource[]> {
  if (!SERPER_API_KEY) return [];

  const payload = {
    q: query,
    num: 8,
  };

  const res = await fetch(SERPER_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": SERPER_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) return [];

  const data = (await res.json()) as SerperSearchResponse;
  const organic = data.organic ?? [];

  const baseType: ResearchResource["type"] =
    category === "fitness"
      ? "article"
      : category === "exam"
        ? "article"
        : category === "project"
          ? "article"
          : category === "travel"
            ? "article"
            : "article";

  return organic
    .filter((item) => Boolean(item.title) && Boolean(item.link))
    .slice(0, 8)
    .map((item) => ({
      title: item.title ?? "未命名资源",
      url: item.link ?? "",
      summary: item.snippet ?? "",
      type: baseType,
    }));
}

/**
 * 调用 LLM 对 Search API 结果做摘要和筛选
 * 输入：若干条候选 ResearchResource
 * 输出：3~5 条高质量资源
 */
async function summarizeSearchResults(
  input: ResearchInput,
  candidates: ResearchResource[],
): Promise<ResearchResult> {
  if (!DEEPSEEK_API_KEY || candidates.length === 0) {
    return { resources: candidates.slice(0, 5) };
  }

  const systemPrompt = [
    "你是一个资料搜寻助手。根据用户的长期目标，从搜索结果中筛选 3~5 条最相关、最权威的资源。",
    "不要编造新的 URL，只能在给定的 searchResults 里面选，或者对其摘要重写。",
    "输出 JSON：{ \"resources\": [{ \"title\", \"url\", \"summary\", \"type\" }] }，不要有多余文字。",
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
    "searchResults（来自 Search API，JSON 数组）：",
    JSON.stringify(candidates, null, 2),
    "",
    "请在这些搜索结果中选出 3~5 条最合适的资源，可以对 title 和 summary 做适度重写，但不要修改 url。",
    "字段要求：",
    "1. title：一句话标题，简洁明了；",
    "2. url：保持与搜索结果中的链接一致；",
    "3. summary：一两句话说明资源内容与适用场景；",
    '4. type：article / video / course / tool（根据资源类型判断）。',
    input.category === "fitness"
      ? "注意：健康/减肥类资源需在 summary 中适当标注「仅供参考，请咨询专业人士」。"
      : "",
  ].join("\n");

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
      max_tokens: 800,
      stream: false,
    }),
  });

  if (!res.ok) {
    return { resources: candidates.slice(0, 5) };
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) return { resources: candidates.slice(0, 5) };

  let jsonText = content;
  if (jsonText.startsWith("```")) {
    const lines = jsonText.split("\n");
    lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim().startsWith("```")) {
      lines.pop();
    }
    jsonText = lines.join("\n").trim();
  }

  try {
    const parsed = JSON.parse(jsonText) as { resources?: ResearchResource[] };
    if (!parsed.resources || parsed.resources.length === 0) {
      return { resources: candidates.slice(0, 5) };
    }
    return { resources: parsed.resources };
  } catch {
    return { resources: candidates.slice(0, 5) };
  }
}

/**
 * 公开入口：长期目标资料搜寻
 * 1. 优先调用 Serper Search API 拿真实结果
 * 2. 再用 DeepSeek 做摘要和筛选
 * 3. 若任何环节失败，则回退到简单的搜索链接
 */
export async function researchForGoal(input: ResearchInput): Promise<ResearchResult> {
  try {
    const candidates = await searchWithSerper(input.goal, input.category).catch(
      () => [],
    );
    if (candidates.length === 0) {
      return fallbackResearch(input);
    }
    return await summarizeSearchResults(input, candidates);
  } catch {
    return fallbackResearch(input);
  }
}

/** 回退实现：至少给出一个搜索引擎链接，满足「标注来源 URL」要求 */
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

