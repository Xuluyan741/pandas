/**
 * 多级模型路由系统的类型定义
 */

/** 任务意图分类 */
export type IntentCategory =
  | "TRIVIAL"      // 闲聊、简单确认、问候
  | "EXTRACTION"   // 提取时间/日程/结构化信息
  | "REASONING"    // 复杂冲突计算、长期规划、备考方案
  | "ACTION"       // API 调用、网页搜索、代码执行
  | "VOICE_STREAM" // 语音流式反馈（实时对话）

/**
 * 动作提示（用于 Deep Link 执行器等能力）
 * - ride_hailing：打车 / 出行
 * - food_delivery：订餐 / 外卖
 * - train_ticket：火车票 / 高铁
 * - meeting：线上会议创建 / 加入
 * - shopping：电商购物搜索
 * - none：不需要执行动作
 */
export type ActionHint =
  | "ride_hailing"
  | "food_delivery"
  | "train_ticket"
  | "meeting"
  | "shopping"
  | "none";

/** 模型提供商 */
export type ModelProvider = "anthropic" | "openai" | "google" | "deepseek";

/**
 * 模型配置：描述一个可用模型及其成本
 * 价格字段单位为 USD / 1M tokens，便于未来随行情更新
 */
export interface ModelConfig {
  id: string;
  provider: ModelProvider;
  displayName: string;
  inputPricePer1M: number;
  outputPricePer1M: number;
  /** 最大输出 token 限制（路由时用于 TRIVIAL 场景截断） */
  maxOutputTokens?: number;
  /** 是否支持 extended thinking / reasoning */
  supportsThinking?: boolean;
}

/** 路由决策结果 */
export interface RouteDecision {
  intent: IntentCategory;
  /** 被选中的主模型 */
  model: ModelConfig;
  /** 降级备选模型 */
  fallback: ModelConfig;
  /** 路由推理说明（用于 debug / 测试页展示） */
  reason: string;
  /** 预估 prompt+completion tokens */
  estimatedTokens: { input: number; output: number };
  /** 预估成本 USD */
  estimatedCostUSD: number;
  /** 强制的 maxTokens（TRIVIAL 场景截断） */
  maxTokens?: number;
}

/** 模型统一调用参数 */
export interface CompletionRequest {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

/** 模型统一调用返回 */
export interface CompletionResponse {
  content: string;
  model: string;
  provider: ModelProvider;
  usage: { inputTokens: number; outputTokens: number };
  costUSD: number;
  latencyMs: number;
}
