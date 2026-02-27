/**
 * Skill 能力类型定义
 * 用于抽象小熊猫可插拔能力（冲突消解、Deep Link 执行器、文案草稿等）
 */
export type SkillRiskLevel = "low" | "medium" | "high";

export interface SkillRunContext {
  /** 当前用户 ID（未登录时可为 'guest'） */
  userId?: string;
}

export interface Skill<I = unknown, O = unknown> {
  /** 唯一 ID，例如 schedule_conflict / deep_link_executor */
  id: string;
  /** 展示名称 */
  name: string;
  /** 简要描述，便于在调试/可视化时展示 */
  description: string;
  /** 运行前必须提供的字段列表（由具体 Skill 自行约定语义） */
  requiredInputs: string[];
  /** 风险等级：决定是否需要显式确认 */
  riskLevel: SkillRiskLevel;
  /**
   * 核心执行函数
   * - I 为输入参数类型
   * - O 为输出结果类型
   */
  run: (input: I, context?: SkillRunContext) => Promise<O> | O;
}

export type AnySkill = Skill<unknown, unknown>;

