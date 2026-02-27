import type { AnySkill, Skill, SkillRunContext } from "./types";
import type { Task } from "@/types";
import { detectConflicts, formatConflictsForLLM } from "@/lib/scheduler";
import { buildDeepLink } from "@/lib/deep-links";
import type { ActionHint } from "@/lib/ai/types";
import { researchForGoal } from "@/lib/agent-research";
import { planGoal } from "@/lib/goal-planner";
import type { GoalCategory } from "@/types";

/**
 * 全局 Skill 注册表（内存级，适合当前单进程场景）
 */
const registry = new Map<string, AnySkill>();

export function registerSkill<TInput, TOutput>(
  skill: Skill<TInput, TOutput>,
): void {
  registry.set(skill.id, skill as AnySkill);
}

export function listSkills(): AnySkill[] {
  return Array.from(registry.values());
}

export async function runSkill<TInput, TOutput>(
  id: string,
  input: TInput,
  context?: SkillRunContext,
): Promise<TOutput> {
  const skill = registry.get(id);
  if (!skill) {
    throw new Error(`Skill not found: ${id}`);
  }
  // 运行时不做强校验，只由各 Skill 自己解析 input
  const result = await (skill as Skill<TInput, TOutput>).run(input, context);
  return result;
}

/* ─── 内置 Skill 定义 ─── */

/**
 * schedule_conflict：对单个新任务进行冲突检测，并生成结构化说明
 */
interface ScheduleConflictInput {
  /** 待检测的新任务 */
  newTask: Task;
  /** 当前已有任务列表 */
  existingTasks: Task[];
}

interface ScheduleConflictOutput {
  hasConflict: boolean;
  /** 算法原始结果（供前端 / 其他 Skill 复用） */
  raw: ReturnType<typeof detectConflicts>;
  /** 供 LLM 使用的结构化上下文 */
  llmContext: string;
}

registerSkill<ScheduleConflictInput, ScheduleConflictOutput>({
  id: "schedule_conflict",
  name: "冲突消解建议",
  description: "对新任务进行时间冲突检测，并给出算法级重排建议。",
  requiredInputs: ["newTask", "existingTasks"],
  riskLevel: "low",
  run: ({ newTask, existingTasks }: ScheduleConflictInput) => {
    const result = detectConflicts(newTask, existingTasks);
    return {
      hasConflict: result.hasConflict,
      raw: result,
      llmContext: formatConflictsForLLM(result),
    };
  },
});

/**
 * deep_link_executor：根据动作类型与上下文生成 Deep Link
 */
interface DeepLinkExecutorInput {
  action: ActionHint;
  /** 原始自然语言输入，用于提取地点/关键字（当前版本主要用于展示） */
  text: string;
}

interface DeepLinkExecutorOutput {
  url: string;
  appName: string;
  title: string;
  description: string;
  /** 风险等级：前端可据此决定是否需要显式确认 */
  riskLevel: "low" | "medium" | "high";
}

registerSkill<DeepLinkExecutorInput, DeepLinkExecutorOutput>({
  id: "deep_link_executor",
  name: "Deep Link 执行器",
  description:
    "为订餐/打车/买票/会议等场景生成预填参数的 Deep Link，仅做跳转与草稿，不直接下单或支付。",
  requiredInputs: ["action", "text"],
  riskLevel: "medium",
  run: ({ action, text }: DeepLinkExecutorInput) => {
    return buildDeepLink(action, { rawText: text });
  },
});

/**
 * message_draft：根据上下文生成一份待发送的消息草稿
 * 当前实现为轻量占位实现，主要提供统一接口，后续可接入 LLM 润色。
 */
interface MessageDraftInput {
  /** 消息用途，例如 "向同事请求延期" / "向客户确认会议时间" */
  intent: string;
  /** 相关任务或场景的简要描述（可选） */
  context?: string;
}

interface MessageDraftOutput {
  /** 生成的消息草稿（纯文本，由用户确认后再发送） */
  draft: string;
}

registerSkill<MessageDraftInput, MessageDraftOutput>({
  id: "message_draft",
  name: "消息草稿助手",
  description: "根据意图与上下文生成一份短消息草稿，交由用户确认后再发送。",
  requiredInputs: ["intent"],
  riskLevel: "low",
  run: ({ intent, context }: MessageDraftInput) => {
    const prefix = "这是根据你的意图生成的一份草稿：";
    const bodyLines: string[] = [];
    bodyLines.push(`【意图】${intent}`);
    if (context?.trim()) {
      bodyLines.push(`【背景】${context.trim()}`);
    }
    bodyLines.push("【建议措辞】你好，我这边根据当前安排有一些调整建议，想和你简单确认一下。");
    return {
      draft: `${prefix}\n${bodyLines.join("\n")}`,
    };
  },
});

/**
 * long_term_goal_planner：长期目标规划助手（PRD Phase 6）
 * 返回 LLM 生成的子任务列表（含资料链接）和推荐资料
 */
interface LongTermGoalPlannerInput {
  goalId: string;
  title: string;
  deadline: string;
  category: GoalCategory;
  existingTasks: Task[];
}

interface LongTermGoalPlannerOutput {
  plan: Awaited<ReturnType<typeof planGoal>>;
  research: Awaited<ReturnType<typeof researchForGoal>>;
}

registerSkill<LongTermGoalPlannerInput, LongTermGoalPlannerOutput>({
  id: "long_term_goal_planner",
  name: "长期目标管家",
  description: "为考试/减肥/项目/旅行等长期目标生成分阶段计划与推荐资料。",
  requiredInputs: ["goalId", "title", "deadline", "category", "existingTasks"],
  riskLevel: "low",
  run: async ({ goalId, title, deadline, category, existingTasks }: LongTermGoalPlannerInput) => {
    const [plan, research] = await Promise.all([
      planGoal({ goalId, title, deadline, category, existingTasks }),
      researchForGoal({ goal: title, category }),
    ]);
    return { plan, research };
  },
});


