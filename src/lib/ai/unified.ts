/**
 * 统一对话补全入口（nanobot 风格多模型 + 单 key 兜底）
 * - 仅配置 DeepSeek 时：直连 DeepSeek，与现有行为一致
 * - 配置多 Provider 时：走意图路由 + 主/备模型降级
 */
import { DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL } from "@/lib/models";
import { isProviderAvailable } from "./providers";
import { modelRouter } from "./router";
import type { CompletionRequest, ToolDefinition, ToolCallItem } from "./types";

export interface UnifiedCompletionOptions {
  temperature?: number;
  maxTokens?: number;
}

/** 补全返回（含可选成本与模型，供配额/路由日志使用） */
export interface UnifiedCompletionResult {
  content: string;
  costUSD?: number;
  model?: string;
}

/** 带工具调用的补全返回（含本轮 model 触发的 tool_calls） */
export interface UnifiedCompletionWithToolsResult extends UnifiedCompletionResult {
  toolCalls?: ToolCallItem[];
}

/**
 * 单次补全：自动选择 DeepSeek 直连或多模型路由
 * 仅配置 DEEPSEEK_API_KEY 时始终直连 DeepSeek（只对话只需这一个 key）
 * @param messages 对话消息（含 system/user）
 * @returns 模型返回的 content 及可选 costUSD、model
 */
export async function getUnifiedCompletion(
  messages: CompletionRequest["messages"],
  options?: UnifiedCompletionOptions,
): Promise<UnifiedCompletionResult> {
  if (!DEEPSEEK_API_KEY?.trim()) {
    throw new Error("至少需配置 DEEPSEEK_API_KEY");
  }

  const hasOthers =
    isProviderAvailable("anthropic") ||
    isProviderAvailable("openai") ||
    isProviderAvailable("google");

  if (!hasOthers) {
    return callDeepSeekDirect(messages, options);
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userInput = lastUser?.content ?? "";
  const result = await modelRouter.routeAndCall(userInput, messages, {
    temperature: options?.temperature,
  });
  return {
    content: result.content,
    costUSD: result.costUSD,
    model: result.model,
  };
}

/** 仅用 DeepSeek 直连（与现有 parse-tasks / agent/chat 行为一致） */
async function callDeepSeekDirect(
  messages: CompletionRequest["messages"],
  options?: UnifiedCompletionOptions,
): Promise<UnifiedCompletionResult> {
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 4096,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DeepSeek ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  let costUSD: number | undefined;
  if (data.usage?.total_tokens) {
    const inT = data.usage.prompt_tokens ?? 0;
    const outT = data.usage.completion_tokens ?? 0;
    costUSD = (inT / 1e6) * 0.14 + (outT / 1e6) * 0.28;
  }
  return { content, costUSD, model: DEEPSEEK_MODEL };
}

/**
 * 带工具列表的补全（按意图挂载 MCP 时使用）
 * 仅实现 DeepSeek 直连；若未配置 DeepSeek 或 tools 为空则退化为普通补全
 * @returns 若模型返回 tool_calls，由调用方执行后可将结果作为 tool 消息再请求一轮
 */
export async function getUnifiedCompletionWithTools(
  messages: CompletionRequest["messages"],
  tools: ToolDefinition[],
  options?: UnifiedCompletionOptions,
): Promise<UnifiedCompletionWithToolsResult> {
  if (!DEEPSEEK_API_KEY?.trim()) {
    throw new Error("至少需配置 DEEPSEEK_API_KEY");
  }
  if (!tools.length) {
    const result = await getUnifiedCompletion(messages, options);
    return { ...result, toolCalls: [] };
  }

  const serializedMessages = messages.map((m) => {
    const base = { role: m.role, content: m.content ?? "" };
    if (m.role === "assistant" && "tool_calls" in m && m.tool_calls?.length) {
      return {
        ...base,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    if (m.role === "tool" && "tool_call_id" in m) {
      return { role: "tool" as const, content: m.content, tool_call_id: m.tool_call_id };
    }
    return base;
  });

  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: serializedMessages,
      tools,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 4096,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DeepSeek ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices?: {
      message?: {
        content?: string;
        tool_calls?: Array<{
          id: string;
          type: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const msg = data.choices?.[0]?.message;
  const content = msg?.content ?? "";
  const rawCalls = msg?.tool_calls ?? [];
  const toolCalls: ToolCallItem[] = rawCalls
    .filter((c) => c.function?.name)
    .map((c) => ({
      id: c.id,
      name: c.function!.name!,
      arguments: c.function!.arguments ?? "{}",
    }));

  let costUSD: number | undefined;
  if (data.usage?.total_tokens) {
    const inT = data.usage.prompt_tokens ?? 0;
    const outT = data.usage.completion_tokens ?? 0;
    costUSD = (inT / 1e6) * 0.14 + (outT / 1e6) * 0.28;
  }

  return { content, costUSD, model: DEEPSEEK_MODEL, toolCalls };
}
