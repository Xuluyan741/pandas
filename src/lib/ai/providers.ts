/**
 * 模型提供商统一调用封装
 * 所有 provider 暴露相同接口，路由层无需关心底层差异
 */
import type {
  ModelConfig,
  ModelProvider,
  CompletionRequest,
  CompletionResponse,
} from "./types";

/* ── 环境变量 ── */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com";
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";

/* ── 通用工具 ── */

/** 从可能带 ```json 包裹的返回中提取纯文本 */
function extractContent(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith("```")) return t;
  const lines = t.split("\n");
  lines.shift();
  while (lines.length && lines[lines.length - 1].trim().startsWith("```")) lines.pop();
  return lines.join("\n").trim();
}

/** 计算成本 */
function calcCost(model: ModelConfig, inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * model.inputPricePer1M +
    (outputTokens / 1_000_000) * model.outputPricePer1M
  );
}

/* ── Provider 实现 ── */

/** Anthropic (Claude) — Messages API */
async function callAnthropic(
  model: ModelConfig,
  req: CompletionRequest,
): Promise<CompletionResponse> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY 未配置");

  const systemMsg = req.messages.find((m) => m.role === "system");
  const nonSystem = req.messages.filter((m) => m.role !== "system");

  const t0 = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model.id,
      max_tokens: req.maxTokens ?? model.maxOutputTokens ?? 4096,
      system: systemMsg?.content ?? "",
      messages: nonSystem.map((m) => ({ role: m.role, content: m.content })),
      temperature: req.temperature ?? 0.3,
    }),
  });
  const latencyMs = Date.now() - t0;

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${body}`);
  }

  const data = await res.json();
  const content = extractContent(
    data.content?.map((b: { text?: string }) => b.text ?? "").join("") ?? "",
  );
  const usage = {
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };

  return {
    content,
    model: model.id,
    provider: "anthropic",
    usage,
    costUSD: calcCost(model, usage.inputTokens, usage.outputTokens),
    latencyMs,
  };
}

/** OpenAI 兼容接口（含 gptsapi 等代理） */
async function callOpenAI(
  model: ModelConfig,
  req: CompletionRequest,
): Promise<CompletionResponse> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY 未配置");

  const t0 = Date.now();
  const res = await fetch(`${OPENAI_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: model.id,
      messages: req.messages,
      temperature: req.temperature ?? 0.3,
      max_tokens: req.maxTokens ?? model.maxOutputTokens ?? 4096,
      stream: false,
    }),
  });
  const latencyMs = Date.now() - t0;

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${body}`);
  }

  const data = await res.json();
  const content = extractContent(data.choices?.[0]?.message?.content ?? "");
  const usage = {
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };

  return {
    content,
    model: model.id,
    provider: "openai",
    usage,
    costUSD: calcCost(model, usage.inputTokens, usage.outputTokens),
    latencyMs,
  };
}

/** Google Gemini — v1beta generateContent */
async function callGoogle(
  model: ModelConfig,
  req: CompletionRequest,
): Promise<CompletionResponse> {
  if (!GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY 未配置");

  const systemMsg = req.messages.find((m) => m.role === "system");
  const nonSystem = req.messages.filter((m) => m.role !== "system");
  const contents = nonSystem.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const t0 = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${GOOGLE_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
      generationConfig: {
        temperature: req.temperature ?? 0.3,
        maxOutputTokens: req.maxTokens ?? model.maxOutputTokens ?? 4096,
      },
    }),
  });
  const latencyMs = Date.now() - t0;

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google ${res.status}: ${body}`);
  }

  const data = await res.json();
  const content = extractContent(
    data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "",
  );
  const meta = data.usageMetadata ?? {};
  const usage = {
    inputTokens: meta.promptTokenCount ?? 0,
    outputTokens: meta.candidatesTokenCount ?? 0,
  };

  return {
    content,
    model: model.id,
    provider: "google",
    usage,
    costUSD: calcCost(model, usage.inputTokens, usage.outputTokens),
    latencyMs,
  };
}

/** DeepSeek — OpenAI 兼容 */
async function callDeepSeek(
  model: ModelConfig,
  req: CompletionRequest,
): Promise<CompletionResponse> {
  if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY 未配置");

  const t0 = Date.now();
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: model.id,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? model.maxOutputTokens ?? 4096,
      stream: false,
    }),
  });
  const latencyMs = Date.now() - t0;

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DeepSeek ${res.status}: ${body}`);
  }

  const data = await res.json();
  const content = extractContent(data.choices?.[0]?.message?.content ?? "");
  const usage = {
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };

  return {
    content,
    model: model.id,
    provider: "deepseek",
    usage,
    costUSD: calcCost(model, usage.inputTokens, usage.outputTokens),
    latencyMs,
  };
}

/* ── 统一调度 ── */

const PROVIDER_MAP: Record<ModelProvider, typeof callAnthropic> = {
  anthropic: callAnthropic,
  openai: callOpenAI,
  google: callGoogle,
  deepseek: callDeepSeek,
};

/** 检查某 provider 的 API key 是否已配置 */
export function isProviderAvailable(provider: ModelProvider): boolean {
  switch (provider) {
    case "anthropic": return !!ANTHROPIC_API_KEY;
    case "openai":    return !!OPENAI_API_KEY;
    case "google":    return !!GOOGLE_API_KEY;
    case "deepseek":  return !!DEEPSEEK_API_KEY;
  }
}

/**
 * 统一调用入口：传入模型配置与请求参数，自动路由到对应 provider
 */
export async function callModel(
  model: ModelConfig,
  req: CompletionRequest,
): Promise<CompletionResponse> {
  const caller = PROVIDER_MAP[model.provider];
  if (!caller) throw new Error(`未知 provider: ${model.provider}`);
  return caller(model, req);
}

/**
 * 带降级的调用：primary 失败（超时/报错/未配置）时自动切换 fallback
 */
export async function callWithFallback(
  primary: ModelConfig,
  fallback: ModelConfig,
  req: CompletionRequest,
  timeoutMs = 30_000,
): Promise<CompletionResponse & { usedFallback: boolean }> {
  if (isProviderAvailable(primary.provider)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const result = await callModel(primary, req);
      clearTimeout(timer);
      return { ...result, usedFallback: false };
    } catch (err) {
      console.warn(`[ai] primary ${primary.displayName} failed, falling back:`, (err as Error).message);
    }
  }

  const result = await callModel(fallback, req);
  return { ...result, usedFallback: true };
}
