/**
 * 进度与日期计算：总进度、今日到期、逾期判断
 */
import type { Task, Project } from "@/types";

const TODAY = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();

/** 解析 YYYY-MM-DD 为 Date（按本地午夜） */
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** 任务结束日期（开始 + 工期 - 1 天） */
export function getTaskEndDate(task: Task): string {
  const start = parseDate(task.startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + task.duration - 1);
  const y = end.getFullYear();
  const m = String(end.getMonth() + 1).padStart(2, "0");
  const d = String(end.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 是否今日到期（结束日期 = 今天） */
export function isDueToday(task: Task): boolean {
  return getTaskEndDate(task) === TODAY;
}

/** 是否已逾期（结束日期 < 今天且未完成） */
export function isOverdue(task: Task): boolean {
  if (task.status === "Done") return false;
  return getTaskEndDate(task) < TODAY;
}

/** 单任务进度 0–100（Done 视为 100） */
export function getTaskProgress(task: Task): number {
  if (task.status === "Done") return 100;
  const p = task.progress;
  if (p == null || p === undefined) return 0;
  return Math.min(100, Math.max(0, Number(p)));
}

/** 项目下所有任务的加权进度（按工期加权平均） */
export function getProjectProgress(projectId: string, tasks: Task[]): number {
  const projectTasks = tasks.filter((t) => t.projectId === projectId);
  if (projectTasks.length === 0) return 0;
  let totalWeight = 0;
  let weightedSum = 0;
  for (const t of projectTasks) {
    const w = t.duration;
    totalWeight += w;
    weightedSum += getTaskProgress(t) * w;
  }
  return totalWeight === 0 ? 0 : Math.round(weightedSum / totalWeight);
}

/** 项目组下所有项目的平均进度 */
export function getGroupProgress(group: string, projects: Project[], tasks: Task[]): number {
  const groupProjects = projects.filter((p) => p.group === group);
  if (groupProjects.length === 0) return 0;
  const sum = groupProjects.reduce((acc, p) => acc + getProjectProgress(p.id, tasks), 0);
  return Math.round(sum / groupProjects.length);
}

/** 全局总进度：所有任务按工期加权的完成百分比 */
export function getOverallProgress(tasks: Task[]): number {
  if (tasks.length === 0) return 0;
  let totalWeight = 0;
  let weightedSum = 0;
  for (const t of tasks) {
    const w = t.duration;
    totalWeight += w;
    weightedSum += getTaskProgress(t) * w;
  }
  return totalWeight === 0 ? 0 : Math.round(weightedSum / totalWeight);
}
