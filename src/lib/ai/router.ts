/**
 * 多级模型路由器 (Multi-Tier Model Router)
 * 用 Gemini Flash 做超轻量意图预判，将任务分发到最合适的模型
 */
import type { IntentCategory, RouteDecision, CompletionRequest, CompletionResponse } from "./types";
import { DEFAULT_ROUTE_MAP, MODELS } from "./models";
import { callModel, callWithFallback, isProviderAvailable } from "./providers";

/* ── 意图预判 ── */

/** 预判 prompt：让最轻量的模型做分类 */
const CLASSIFY_SYSTEM = `你是一个任务意图分类器。根据用户输入，判断其属于以下五类之一，只输出分类标签（英文大写），不输出任何解释。

分类标签：
- TRIVIAL: 闲聊、问候、简单确认（如"谢谢"、"好的"、"你好"）
- EXTRACTION: 从自然语言中提取时间、日程、任务信息（如"明天下午三点开会"）
- REASONING: 需要复杂逻辑推理（如日程冲突计算、备考计划、减肥方案、长期规划）
- ACTION: 需要调用外部工具或搜索（如"帮我搜一下考研资料"、"查一下高铁票"）
- VOICE_STREAM: 语音实时对话场景（由调用方标记，此处不会出现）

只输出一个标签，如：EXTRACTION`;

const VALID_INTENTS = new Set<IntentCategory>([
  "TRIVIAL", "EXTRACTION", "REASONING", "ACTION", "VOICE_STREAM",
]);

/**
 * 用最轻量模型做意图分类
 * 若 Gemini Flash 不可用，基于关键词做本地分类（零成本兜底）
 */
async function classifyIntent(userInput: string): Promise<IntentCategory> {
  if (isProviderAvailable("google")) {
    try {
      const res = await callModel(MODELS.geminiFlash, {
        messages: [
          { role: "system", content: CLASSIFY_SYSTEM },
          { role: "user", content: userInput },
        ],
        temperature: 0,
        maxTokens: 16,
      });
      const label = res.content.trim().toUpperCase() as IntentCategory;
      if (VALID_INTENTS.has(label)) return label;
    } catch (err) {
      console.warn("[router] Gemini classify failed, using local fallback:", (err as Error).message);
    }
  }

  return classifyLocal(userInput);
}

/** 基于关键词的本地分类兜底（零 API 成本） */
function classifyLocal(input: string): IntentCategory {
  const t = input.toLowerCase();

  const actionWords = ["搜索", "搜一下", "查一下", "帮我找", "查票", "订票", "打开", "下载"];
  if (actionWords.some((w) => t.includes(w))) return "ACTION";

  const reasonWords = [
    "计划", "规划", "备考", "减肥", "冲突", "安排", "怎么分配",
    "优先级", "方案", "建议", "策略", "步骤", "长期",
  ];
  if (reasonWords.some((w) => t.includes(w))) return "REASONING";

  const extractWords = [
    "点", "号", "月", "日", "周", "明天", "后天", "下周", "上午", "下午",
    "晚上", "会议", "开会", "提醒", "截止", "deadline",
  ];
  if (extractWords.some((w) => t.includes(w))) return "EXTRACTION";

  if (t.length < 10) return "TRIVIAL";

  return "EXTRACTION";
}

/* ── 成本预估 ── */

/** 粗估 token 数：中文约 2 tokens/字，英文约 1.3 tokens/word */
function estimateInputTokens(messages: CompletionRequest["messages"]): number {
  let chars = 0;
  for (const m of messages) chars += m.content.length;
  return Math.ceil(chars * 1.5);
}

function estimateCost(
  model: { inputPricePer1M: number; outputPricePer1M: number },
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens / 1_000_000) * model.inputPricePer1M +
    (outputTokens / 1_000_000) * model.outputPricePer1M
  );
}

/* ── ModelRouter 主类 ── */

export class ModelRouter {
  private routeMap = { ...DEFAULT_ROUTE_MAP };

  /**
   * 路由决策：分析用户输入 → 返回应该使用的模型及预估成本
   * @param userInput 用户原始输入
   * @param forceIntent 强制指定意图（如语音场景固定为 VOICE_STREAM）
   */
  async route(
    userInput: string,
    messages: CompletionRequest["messages"],
    forceIntent?: IntentCategory,
  ): Promise<RouteDecision> {
    const intent = forceIntent ?? await classifyIntent(userInput);
    const mapping = this.routeMap[intent];

    const inputTokens = estimateInputTokens(messages);
    const outputTokens = mapping.maxTokens ?? 1024;

    return {
      intent,
      model: mapping.primary,
      fallback: mapping.fallback,
      reason: mapping.reason,
      estimatedTokens: { input: inputTokens, output: outputTokens },
      estimatedCostUSD: estimateCost(mapping.primary, inputTokens, outputTokens),
      maxTokens: mapping.maxTokens,
    };
  }

  /**
   * 一站式：路由 + 调用 + 降级
   * 返回完整的响应与路由决策信息
   */
  async routeAndCall(
    userInput: string,
    messages: CompletionRequest["messages"],
    options?: { forceIntent?: IntentCategory; temperature?: number; timeoutMs?: number },
  ): Promise<CompletionResponse & { decision: RouteDecision; usedFallback: boolean }> {
    const decision = await this.route(userInput, messages, options?.forceIntent);

    const req: CompletionRequest = {
      messages,
      temperature: options?.temperature,
      maxTokens: decision.maxTokens,
    };

    const result = await callWithFallback(
      decision.model,
      decision.fallback,
      req,
      options?.timeoutMs,
    );

    return { ...result, decision };
  }

  /** 动态更新路由映射（热配置） */
  updateRoute(intent: IntentCategory, mapping: (typeof DEFAULT_ROUTE_MAP)[IntentCategory]) {
    this.routeMap[intent] = mapping;
  }
}

/** 全局单例 */
export const modelRouter = new ModelRouter();
