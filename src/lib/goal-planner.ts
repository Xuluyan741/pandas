/**
 * 长期目标计划生成（PRD Phase 6.3）
 * 所有类别（考试、健身、项目、旅行、自定义）均调用 LLM 做语义级规划
 * LLM 输出分周/分日计划，每个子任务带资料链接，与冲突消解联动
 */
import type { Task, GoalCategory } from "@/types";
import { DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL } from "./models";
import { detectConflicts } from "./scheduler";

export interface GoalPlanInput {
  goalId: string;
  title: string;
  deadline: string; // YYYY-MM-DD
  category: GoalCategory;
  existingTasks: Task[];
}

export interface GoalSubTask {
  name: string;
  startDate: string;
  duration: number;
  priority: "高" | "中" | "低";
  /** 推荐资料链接（LLM 可能返回，可为空） */
  resourceUrl?: string;
}

export interface GoalPlanResult {
  tasks: GoalSubTask[];
}

/** 将现有任务压缩成「忙碌日」简要信息，传给 LLM 参考 */
function summarizeBusyDays(existingTasks: Task[]): string {
  const map = new Map<string, number>();
  existingTasks.forEach((t) => {
    if (t.status === "Done") return;
    const count = map.get(t.startDate) ?? 0;
    map.set(t.startDate, count + 1);
  });
  const entries = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "近期暂无已排定的任务。";
  const lines = entries.map(
    ([date, count]) => `${date}：已有 ${count} 个任务`,
  );
  return `用户已有任务分布：\n${lines.join("\n")}`;
}

/** 按类别生成 LLM system prompt */
function buildSystemPrompt(category: GoalCategory): string {
  const base = "你是「小熊猫智能管家」的计划生成模块。";

  const categoryPrompts: Record<GoalCategory, string> = {
    travel: [
      base,
      "你精通签证、机票预订、酒店选择、行程规划和旅行保险。",
      "你需要为用户生成一份从现在到出发前的「完整准备清单」，覆盖：",
      "1. 证件与签证（护照有效期检查、签证申请、照片准备等）",
      "2. 机票与住宿预订（查价、比价、下单，分多步骤）",
      "3. 行程规划（按天或按阶段的粗粒度规划）",
      "4. 资金与通信准备（换汇、当地交通卡、电话卡/WiFi、旅行保险）",
      "5. 行李与出发前准备（打包清单、值机等）",
      "每个任务尽量附带一个真实可访问的参考链接（搜索引擎链接亦可）。",
    ].join("\n"),
    exam: [
      base,
      "你擅长帮助学生和考生制定备考计划。",
      "你需要为用户生成一份从现在到考试前的「分阶段备考计划」，覆盖：",
      "1. 准备期（搜集资料、了解考试大纲、制定学习计划）",
      "2. 学习期（按知识模块分配每日/每周学习任务）",
      "3. 巩固期（做题、错题回顾、薄弱环节强化）",
      "4. 冲刺期（模拟考试、查漏补缺、心态调整）",
      "每个任务尽量附带一个推荐资料链接。",
    ].join("\n"),
    fitness: [
      base,
      "你擅长健身和体重管理计划制定。",
      "你需要为用户生成一份分周训练+饮食计划，覆盖：",
      "1. 评估期（当前体重/体脂记录、目标设定）",
      "2. 训练计划（每周训练日程，循序渐进）",
      "3. 饮食管理（基本饮食原则和热量参考）",
      "4. 复盘周期（每周/每两周检查进展、调整计划）",
      "注意：健康/减肥/健身类内容请在每条任务名称后标注「仅供参考，请咨询专业人士」。",
      "每个任务尽量附带一个参考资料链接。",
    ].join("\n"),
    project: [
      base,
      "你擅长项目管理和 WBS 拆解。",
      "你需要为用户将长期项目目标拆解为若干里程碑和子任务，覆盖：",
      "1. 项目启动（需求分析、资源确认）",
      "2. 分阶段执行（核心交付物拆解为可执行的周任务）",
      "3. 检查点（阶段性复盘和风险评估）",
      "4. 交付与收尾（最终交付、文档归档）",
      "每个任务尽量附带一个参考资料链接。",
    ].join("\n"),
    custom: [
      base,
      "你需要根据用户的长期目标，生成合理的分阶段计划。",
      "从现在到截止日期，将目标拆分为 5~15 个可执行的子任务，每个任务有明确的日期和优先级。",
      "每个任务尽量附带一个参考资料链接。",
    ].join("\n"),
  };

  return categoryPrompts[category] + "\n\n只输出 JSON，不要任何解释文字。";
}

/** 调用 LLM 生成计划 */
async function planGoalWithLLM(input: GoalPlanInput): Promise<GoalPlanResult | null> {
  if (!DEEPSEEK_API_KEY) return null;

  const busySummary = summarizeBusyDays(input.existingTasks);
  const todayISO = new Date().toISOString().slice(0, 10);

  const userPrompt = [
    `目标：${input.title}`,
    `截止/出发日期：${input.deadline}`,
    `今天日期：${todayISO}`,
    "",
    busySummary,
    "",
    "请生成 5~15 个子任务，尽量均匀分布在从今天到截止日之间。",
    "在安排日期时避开用户已有任务密集的日期。",
    "",
    "输出 JSON 格式（严格遵守，不要多余文字）：",
    "{",
    '  "tasks": [',
    "    {",
    '      "name": "子任务名称（具体、可执行）",',
    '      "startDate": "YYYY-MM-DD",',
    '      "duration": 1,',
    '      "priority": "高" | "中" | "低",',
    '      "resourceUrl": "推荐资料链接（真实 URL，不确定时用 Google 搜索链接）"',
    "    }",
    "  ]",
    "}",
  ].join("\n");

  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: buildSystemPrompt(input.category) },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 1200,
      stream: false,
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) return null;

  let jsonText = content;
  if (jsonText.startsWith("```")) {
    const lines = jsonText.split("\n");
    lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim().startsWith("```")) {
      lines.pop();
    }
    jsonText = lines.join("\n").trim();
  }

  try {
    const parsed = JSON.parse(jsonText) as {
      tasks?: {
        name: string;
        startDate: string;
        duration?: number;
        priority?: "高" | "中" | "低";
        resourceUrl?: string;
      }[];
    };
    const rawTasks = parsed.tasks ?? [];
    if (rawTasks.length === 0) return null;

    const tasks: GoalSubTask[] = rawTasks.map((t) => ({
      name: t.name,
      startDate: t.startDate,
      duration: t.duration && t.duration > 0 ? t.duration : 1,
      priority: t.priority ?? "中",
      resourceUrl: t.resourceUrl || undefined,
    }));
    return { tasks };
  } catch {
    return null;
  }
}

/** 与冲突消解联动：检查生成的子任务是否与现有任务冲突，若冲突则微调日期 */
function resolveConflicts(
  subTasks: GoalSubTask[],
  existingTasks: Task[],
  goalId: string,
): GoalSubTask[] {
  return subTasks.map((st) => {
    const tempTask: Task = {
      id: `temp-${goalId}-${Math.random()}`,
      name: st.name,
      projectId: "",
      startDate: st.startDate,
      duration: st.duration,
      dependencies: [],
      status: "To Do",
      priority: st.priority,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = detectConflicts(tempTask, existingTasks);
    if (!result.hasConflict) return st;

    // 有冲突时尝试用建议中的新时间
    const moveSuggestion = result.suggestions.find(
      (s) => s.taskId === tempTask.id && s.proposedStart,
    );
    if (moveSuggestion?.proposedStart) {
      const d = moveSuggestion.proposedStart;
      const newDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return { ...st, startDate: newDate };
    }

    return st;
  });
}

/** 纯算法兜底（LLM 不可用时） */
function planGoalFallback(input: GoalPlanInput): GoalPlanResult {
  const today = new Date();
  const deadline = new Date(input.deadline);
  const totalDays = Math.max(14, Math.ceil((deadline.getTime() - today.getTime()) / 86400000) + 1);
  const totalTasks = Math.min(15, Math.max(5, Math.ceil(totalDays / 4)));

  const tasks: GoalSubTask[] = [];
  for (let i = 0; i < totalTasks; i++) {
    const offsetDays = Math.floor((i * totalDays) / totalTasks);
    const d = new Date(today);
    d.setDate(d.getDate() + offsetDays);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const phaseRatio = i / totalTasks;
    let phaseName: string;
    if (phaseRatio < 0.3) phaseName = "准备";
    else if (phaseRatio < 0.7) phaseName = "执行";
    else phaseName = "冲刺";

    tasks.push({
      name: `${input.title} · ${phaseName}阶段 · 步骤${i + 1}`,
      startDate: dateStr,
      duration: 1,
      priority: phaseRatio >= 0.7 ? "高" : phaseRatio >= 0.3 ? "中" : "低",
    });
  }

  return { tasks };
}

/**
 * 计划生成主入口
 * 所有类别优先走 LLM，失败则退回算法兜底
 * 生成后与冲突消解联动，自动微调冲突日期
 */
export async function planGoal(input: GoalPlanInput): Promise<GoalPlanResult> {
  let result: GoalPlanResult;

  const llmPlan = await planGoalWithLLM(input).catch(() => null);
  if (llmPlan && llmPlan.tasks.length > 0) {
    result = llmPlan;
  } else {
    result = planGoalFallback(input);
  }

  // 与冲突消解联动
  result.tasks = resolveConflicts(result.tasks, input.existingTasks, input.goalId);

  return result;
}
