/**
 * 可用模型注册表 — 集中管理所有模型配置
 * 未来新增/替换模型只需在此文件修改，路由逻辑无需改动
 */
import type { ModelConfig, IntentCategory } from "./types";

/* ── 模型定义 ── */

export const MODELS = {
  /** 超轻量预判 + 语音流式 */
  geminiFlash: {
    id: "gemini-2.0-flash",
    provider: "google",
    displayName: "Gemini 2.0 Flash",
    inputPricePer1M: 0.10,
    outputPricePer1M: 0.40,
    maxOutputTokens: 8192,
  },

  /** 高性价比通用 */
  claudeSonnet: {
    id: "claude-sonnet-4-20250514",
    provider: "anthropic",
    displayName: "Claude Sonnet 4",
    inputPricePer1M: 3.0,
    outputPricePer1M: 15.0,
    maxOutputTokens: 8192,
  },

  /** 深度推理 */
  claudeOpus: {
    id: "claude-opus-4-20250514",
    provider: "anthropic",
    displayName: "Claude Opus 4",
    inputPricePer1M: 15.0,
    outputPricePer1M: 75.0,
    maxOutputTokens: 16384,
    supportsThinking: true,
  },

  /** Agentic Workflow / 代码执行 */
  gptCodex: {
    id: "o3-mini",
    provider: "openai",
    displayName: "GPT o3-mini",
    inputPricePer1M: 1.10,
    outputPricePer1M: 4.40,
    maxOutputTokens: 16384,
  },

  /** 低成本文本解析（现有） */
  deepseekChat: {
    id: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
    provider: "deepseek",
    displayName: "DeepSeek Chat",
    inputPricePer1M: 0.14,
    outputPricePer1M: 0.28,
    maxOutputTokens: 4096,
  },
} satisfies Record<string, ModelConfig>;

/* ── 意图 → 模型映射表（可热更新） ── */

export type ModelMapping = {
  primary: ModelConfig;
  fallback: ModelConfig;
  reason: string;
  /** 强制最大输出 token（用于节省成本） */
  maxTokens?: number;
};

/**
 * 默认意图路由映射
 * 未来各任务有更便宜/更合适的模型时，只需修改此表
 */
export const DEFAULT_ROUTE_MAP: Record<IntentCategory, ModelMapping> = {
  TRIVIAL: {
    primary: MODELS.geminiFlash,
    fallback: MODELS.deepseekChat,
    reason: "闲聊/简单确认：用最轻量模型，限制输出长度以节省 token",
    maxTokens: 256,
  },

  EXTRACTION: {
    primary: MODELS.claudeSonnet,
    fallback: MODELS.deepseekChat,
    reason: "时间/日程提取：理解力强、结构化输出稳定、性价比最优",
  },

  REASONING: {
    primary: MODELS.claudeOpus,
    fallback: MODELS.claudeSonnet,
    reason: "复杂冲突/长期规划：需要深度逻辑推演，确保计划科学",
  },

  ACTION: {
    primary: MODELS.gptCodex,
    fallback: MODELS.claudeSonnet,
    reason: "API 调用/搜索执行：专为 Agentic Workflow 优化，调用精准度最高",
  },

  VOICE_STREAM: {
    primary: MODELS.geminiFlash,
    fallback: MODELS.deepseekChat,
    reason: "语音流式：零延迟感，适合实时对话反馈",
  },
};
