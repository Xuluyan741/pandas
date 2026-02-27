/**
 * 长期目标计划生成（不依赖 LLM 的轻量实现）
 * 根据 deadline 与类别，将目标拆分为按周/按日的子任务草案。
 */
import type { Task } from "@/types";
import type { LongTermGoalCategory } from "./agent-research";

export interface GoalPlanInput {
  goalId: string;
  title: string;
  deadline: string; // YYYY-MM-DD
  category: LongTermGoalCategory;
  /** 现有任务列表（用于简单避开冲突日期，仅按日期级别粗略避让） */
  existingTasks: Task[];
}

export interface GoalSubTask {
  name: string;
  startDate: string;
  duration: number;
  priority: "高" | "中" | "低";
}

export interface GoalPlanResult {
  tasks: GoalSubTask[];
}

/** 计算两个日期之间的天数差（含首尾） */
function daysBetween(start: Date, end: Date): number {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const diff = e.getTime() - s.getTime();
  return Math.max(1, Math.floor(diff / 86400000) + 1);
}

/** 将 Date 转为 YYYY-MM-DD */
function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 判断某天是否已有大量任务（用于简单避让） */
function isBusyDate(date: string, tasks: Task[]): boolean {
  const sameDay = tasks.filter((t) => t.startDate === date && t.status !== "Done");
  return sameDay.length >= 4;
}

export function planGoal(input: GoalPlanInput): GoalPlanResult {
  const today = new Date();
  const deadline = new Date(input.deadline);
  const totalDays = Math.max(14, daysBetween(today, deadline)); // 至少按两周考虑

  // 依据类别决定每周学习/推进频率
  let sessionsPerWeek = 5;
  if (input.category === "fitness") sessionsPerWeek = 4;
  if (input.category === "project") sessionsPerWeek = 3;

  const totalWeeks = Math.max(2, Math.ceil(totalDays / 7));
  const totalSessions = sessionsPerWeek * totalWeeks;

  const tasks: GoalSubTask[] = [];

  for (let i = 0; i < totalSessions; i++) {
    const base = new Date(today);
    const offsetDays = Math.floor((i * totalDays) / totalSessions);
    base.setDate(base.getDate() + offsetDays);
    let dateStr = formatYMD(base);

    // 简单避开任务过多的日期
    let attempts = 0;
    while (isBusyDate(dateStr, input.existingTasks) && attempts < 3) {
      base.setDate(base.getDate() + 1);
      dateStr = formatYMD(base);
      attempts += 1;
    }

    const phaseIndex = Math.floor((i / totalSessions) * 3);
    let phaseLabel = "准备";
    if (phaseIndex === 1) phaseLabel = "巩固";
    if (phaseIndex >= 2) phaseLabel = "冲刺";

    const name = `${input.title} · 第 ${i + 1} 阶段（${phaseLabel}）`;

    const priority: "高" | "中" | "低" =
      i >= totalSessions * 0.7 ? "高" : i >= totalSessions * 0.3 ? "中" : "低";

    tasks.push({
      name,
      startDate: dateStr,
      duration: 1,
      priority,
    });
  }

  return { tasks };
}

