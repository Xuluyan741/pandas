/**
 * 长期目标资料搜寻（占位实现）
 * 当前版本不调用外部 Search API，仅根据目标类别返回模板化的推荐资源结构，
 * 主要用于打通整体流程与类型定义，后续可替换为真实搜索实现。
 */

export type LongTermGoalCategory = "exam" | "fitness" | "project" | "custom";

export interface ResearchResource {
  title: string;
  url: string;
  summary: string;
  type: "article" | "video" | "course" | "tool";
}

export interface ResearchResult {
  resources: ResearchResource[];
}

export interface ResearchInput {
  goal: string;
  category: LongTermGoalCategory;
}

/** 依据类别返回一组模板化「推荐资料」 */
export async function researchForGoal(input: ResearchInput): Promise<ResearchResult> {
  const baseGoal = input.goal.trim() || "长期目标";

  if (input.category === "exam") {
    return {
      resources: [
        {
          title: `${baseGoal} · 备考大纲参考`,
          url: "https://example.com/exam-outline",
          summary: "示例：官方考试大纲与知识点分布，后续可替换为真实链接。",
          type: "article",
        },
        {
          title: `${baseGoal} · 高频真题讲解`,
          url: "https://example.com/exam-video",
          summary: "示例：考试真题视频讲解合集。",
          type: "video",
        },
      ],
    };
  }

  if (input.category === "fitness") {
    return {
      resources: [
        {
          title: `${baseGoal} · 基础训练计划示例`,
          url: "https://example.com/fitness-plan",
          summary: "示例：每周 3–4 次训练的入门体脂管理方案。",
          type: "article",
        },
        {
          title: `${baseGoal} · 饮食记录工具`,
          url: "https://example.com/fitness-tool",
          summary: "示例：用于记录每日饮食与卡路里的工具。",
          type: "tool",
        },
      ],
    };
  }

  if (input.category === "project") {
    return {
      resources: [
        {
          title: `${baseGoal} · 项目拆解示例`,
          url: "https://example.com/project-wbs",
          summary: "示例：如何将交付目标拆解为若干里程碑和子任务。",
          type: "article",
        },
        {
          title: `${baseGoal} · 同类项目最佳实践`,
          url: "https://example.com/project-best-practices",
          summary: "示例：类似项目的经验总结与复盘。",
          type: "article",
        },
      ],
    };
  }

  // custom：给出通用提示
  return {
    resources: [
      {
        title: `${baseGoal} · 目标拆解与规划示例`,
        url: "https://example.com/goal-planning",
        summary: "示例：如何将长期目标拆解为可执行的周计划与日任务。",
        type: "article",
      },
    ],
  };
}

