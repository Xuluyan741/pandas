/**
 * AI 模块统一导出
 */
export { ModelRouter, modelRouter } from "./router";
export { callModel, callWithFallback, isProviderAvailable } from "./providers";
export { MODELS, DEFAULT_ROUTE_MAP } from "./models";
export { getUnifiedCompletionWithTools } from "./unified";
export type { UnifiedCompletionWithToolsResult } from "./unified";
export type {
  IntentCategory,
  ModelProvider,
  ModelConfig,
  RouteDecision,
  CompletionRequest,
  CompletionResponse,
  CompletionMessage,
  ToolDefinition,
  ToolCallItem,
} from "./types";
