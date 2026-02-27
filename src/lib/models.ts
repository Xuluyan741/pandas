/**
 * 统一导出当前项目中使用的主模型配置
 * Phase 1–3 阶段采用单一主模型 DeepSeek，以降低复杂度
 */

export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
export const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";

