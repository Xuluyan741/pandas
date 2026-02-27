/**
 * AI 模块统一导出
 */
export { ModelRouter, modelRouter } from "./router";
export { callModel, callWithFallback, isProviderAvailable } from "./providers";
export { MODELS, DEFAULT_ROUTE_MAP } from "./models";
export type {
  IntentCategory,
  ModelProvider,
  ModelConfig,
  RouteDecision,
  CompletionRequest,
  CompletionResponse,
} from "./types";
