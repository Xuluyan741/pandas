/**
 * 冲突消解引擎 —— 纯算法核心
 * 职责：时间重叠检测、优先级排序、自动重排建议
 * 设计原则：大炮不打蚊子，LLM 只负责文案，算法负责计算
 */
import type { Task, TaskPriority } from "@/types";

/* ─── 类型定义 ─── */

/** 艾森豪威尔优先级 P0-P3（数字越小越不可移动） */
export type EisenhowerLevel = 0 | 1 | 2 | 3;

/** 一个具体的时间区间（精确到分钟） */
export interface TimeSlot {
  start: Date;
  end: Date;
}

/** 冲突详情 */
export interface Conflict {
  /** 与新任务冲突的已有任务 */
  existingTask: Task;
  /** 重叠的时间区间 */
  overlapSlot: TimeSlot;
  /** 重叠时长（分钟） */
  overlapMinutes: number;
}

/** 引擎生成的单条调整建议 */
export interface ScheduleSuggestion {
  /** 涉及的任务 ID */
  taskId: string;
  taskName: string;
  /** 建议动作 */
  action: "move" | "shorten" | "postpone" | "cancel";
  /** 建议的新时间 */
  proposedStart?: Date;
  proposedEnd?: Date;
  /** 简要理由（给 LLM 做文案扩写用） */
  reason: string;
}

/** 冲突检测完整结果 */
export interface ConflictResult {
  hasConflict: boolean;
  conflicts: Conflict[];
  suggestions: ScheduleSuggestion[];
}

/* ─── 工具函数 ─── */

/** 将 TaskPriority（高/中/低）映射到艾森豪威尔 P0-P3 */
export function toEisenhower(priority: TaskPriority): EisenhowerLevel {
  switch (priority) {
    case "高": return 0;
    case "中": return 1;
    case "低": return 2;
    default:   return 3;
  }
}

/** 从 Task 的日期字段解析出精确时间区间 */
export function getTaskTimeSlot(task: Task): TimeSlot {
  const [y, m, d] = task.startDate.split("-").map(Number);

  let startHour = 9, startMin = 0;
  if (task.startTime) {
    const parts = task.startTime.split(":").map(Number);
    startHour = parts[0] ?? 9;
    startMin = parts[1] ?? 0;
  }

  const start = new Date(y, m - 1, d, startHour, startMin);

  if (task.endTime) {
    const parts = task.endTime.split(":").map(Number);
    const end = new Date(y, m - 1, d, parts[0] ?? 10, parts[1] ?? 0);
    if (end > start) return { start, end };
  }

  // 无明确结束时间：按 duration 天数计算，每天算 8 小时工作时间
  const end = new Date(start);
  if (task.startTime) {
    end.setHours(end.getHours() + Math.max(1, task.duration || 1));
  } else {
    end.setDate(end.getDate() + Math.max(1, task.duration || 1));
  }
  return { start, end };
}

/** 判断两个时间区间是否重叠 */
export function isOverlapping(a: TimeSlot, b: TimeSlot): boolean {
  return a.start < b.end && b.start < a.end;
}

/** 计算两个区间重叠的分钟数 */
export function getOverlapMinutes(a: TimeSlot, b: TimeSlot): number {
  if (!isOverlapping(a, b)) return 0;
  const overlapStart = a.start > b.start ? a.start : b.start;
  const overlapEnd = a.end < b.end ? a.end : b.end;
  return Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 60000);
}

/* ─── 核心检测 ─── */

/**
 * 检测新任务与现有任务列表的时间冲突
 * 纯算法，不调用任何 LLM
 */
export function detectConflicts(
  newTask: Task,
  existingTasks: Task[],
): ConflictResult {
  const newSlot = getTaskTimeSlot(newTask);
  const conflicts: Conflict[] = [];

  // 只检测未完成的任务
  const activeTasks = existingTasks.filter(
    (t) => t.status !== "Done" && t.id !== newTask.id,
  );

  for (const existing of activeTasks) {
    const existingSlot = getTaskTimeSlot(existing);
    const overlapMinutes = getOverlapMinutes(newSlot, existingSlot);

    if (overlapMinutes > 0) {
      const overlapStart = newSlot.start > existingSlot.start ? newSlot.start : existingSlot.start;
      const overlapEnd = newSlot.end < existingSlot.end ? newSlot.end : existingSlot.end;

      conflicts.push({
        existingTask: existing,
        overlapSlot: { start: overlapStart, end: overlapEnd },
        overlapMinutes,
      });
    }
  }

  if (conflicts.length === 0) {
    return { hasConflict: false, conflicts: [], suggestions: [] };
  }

  // 按优先级排序冲突：低优先级的排前面（更容易被移动）
  conflicts.sort(
    (a, b) => toEisenhower(b.existingTask.priority) - toEisenhower(a.existingTask.priority),
  );

  const suggestions = generateSuggestions(newTask, newSlot, conflicts, activeTasks);
  return { hasConflict: true, conflicts, suggestions };
}

/* ─── 建议生成（纯算法） ─── */

/**
 * 根据冲突列表和优先级规则，生成调整建议
 * P0 不可移动，P1 可微调 ±2h，P2 可挪到明天，P3 建议取消/推迟
 */
function generateSuggestions(
  newTask: Task,
  newSlot: TimeSlot,
  conflicts: Conflict[],
  allTasks: Task[],
): ScheduleSuggestion[] {
  const suggestions: ScheduleSuggestion[] = [];
  const newLevel = toEisenhower(newTask.priority);

  for (const conflict of conflicts) {
    const existing = conflict.existingTask;
    const existingLevel = toEisenhower(existing.priority);
    const existingSlot = getTaskTimeSlot(existing);

    // 新任务优先级更低或相同 → 建议移动新任务
    if (newLevel >= existingLevel) {
      const freeSlot = findNextFreeSlot(newSlot, allTasks, newTask.id);
      if (freeSlot) {
        suggestions.push({
          taskId: newTask.id,
          taskName: newTask.name,
          action: "move",
          proposedStart: freeSlot.start,
          proposedEnd: freeSlot.end,
          reason: `「${existing.name}」优先级更高（${existing.priority}），建议将新任务移到空闲时段`,
        });
      }
      continue;
    }

    // 新任务优先级更高 → 按规则处理已有任务
    if (existingLevel === 0) {
      // P0 不可移动，只能建议新任务避开
      const freeSlot = findNextFreeSlot(newSlot, allTasks, newTask.id);
      if (freeSlot) {
        suggestions.push({
          taskId: newTask.id,
          taskName: newTask.name,
          action: "move",
          proposedStart: freeSlot.start,
          proposedEnd: freeSlot.end,
          reason: `「${existing.name}」是不可移动的 P0 任务，建议新任务避开`,
        });
      }
    } else if (existingLevel === 1) {
      // P1 可微调 ±2h
      const shifted = shiftByHours(existingSlot, 2, allTasks, existing.id);
      if (shifted) {
        suggestions.push({
          taskId: existing.id,
          taskName: existing.name,
          action: "move",
          proposedStart: shifted.start,
          proposedEnd: shifted.end,
          reason: `「${existing.name}」可微调时间，建议后移 2 小时避开冲突`,
        });
      }
    } else if (existingLevel === 2) {
      // P2 可挪到明天
      const tomorrow = new Date(existingSlot.start);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(existingSlot.start.getHours(), existingSlot.start.getMinutes(), 0, 0);
      const tomorrowEnd = new Date(tomorrow);
      tomorrowEnd.setTime(tomorrowEnd.getTime() + (existingSlot.end.getTime() - existingSlot.start.getTime()));

      suggestions.push({
        taskId: existing.id,
        taskName: existing.name,
        action: "postpone",
        proposedStart: tomorrow,
        proposedEnd: tomorrowEnd,
        reason: `「${existing.name}」是日常杂事，建议顺延到明天同一时段`,
      });
    } else {
      // P3 建议取消或推迟
      suggestions.push({
        taskId: existing.id,
        taskName: existing.name,
        action: "cancel",
        reason: `「${existing.name}」是灵活任务，建议取消或推迟，优先保障更重要的事项`,
      });
    }
  }

  return deduplicateSuggestions(suggestions);
}

/** 在指定时段附近找到第一个空闲时间段 */
function findNextFreeSlot(
  idealSlot: TimeSlot,
  allTasks: Task[],
  excludeTaskId: string,
): TimeSlot | null {
  const duration = idealSlot.end.getTime() - idealSlot.start.getTime();
  const occupiedSlots = allTasks
    .filter((t) => t.id !== excludeTaskId && t.status !== "Done")
    .map(getTaskTimeSlot)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // 从原时段结束后开始，向后搜索 7 天内的空闲
  let candidate = new Date(idealSlot.end);
  const searchLimit = new Date(idealSlot.start);
  searchLimit.setDate(searchLimit.getDate() + 7);

  while (candidate < searchLimit) {
    // 跳过非工作时间（晚上 22 点到早上 7 点）
    if (candidate.getHours() >= 22) {
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(7, 0, 0, 0);
      continue;
    }
    if (candidate.getHours() < 7) {
      candidate.setHours(7, 0, 0, 0);
      continue;
    }

    const candidateSlot: TimeSlot = {
      start: new Date(candidate),
      end: new Date(candidate.getTime() + duration),
    };

    const hasConflict = occupiedSlots.some((s) => isOverlapping(candidateSlot, s));
    if (!hasConflict) return candidateSlot;

    // 步进 30 分钟
    candidate = new Date(candidate.getTime() + 30 * 60000);
  }

  return null;
}

/** 尝试将任务前移或后移指定小时数来避开冲突 */
function shiftByHours(
  slot: TimeSlot,
  hours: number,
  allTasks: Task[],
  taskId: string,
): TimeSlot | null {
  const duration = slot.end.getTime() - slot.start.getTime();
  const offsets = [hours, -hours, hours + 1, -(hours + 1)];

  const occupiedSlots = allTasks
    .filter((t) => t.id !== taskId && t.status !== "Done")
    .map(getTaskTimeSlot);

  for (const offset of offsets) {
    const newStart = new Date(slot.start.getTime() + offset * 3600000);
    if (newStart.getHours() < 7 || newStart.getHours() >= 22) continue;

    const candidate: TimeSlot = {
      start: newStart,
      end: new Date(newStart.getTime() + duration),
    };

    if (!occupiedSlots.some((s) => isOverlapping(candidate, s))) {
      return candidate;
    }
  }
  return null;
}

/** 去重：同一个任务只保留最优建议 */
function deduplicateSuggestions(suggestions: ScheduleSuggestion[]): ScheduleSuggestion[] {
  const seen = new Map<string, ScheduleSuggestion>();
  for (const s of suggestions) {
    if (!seen.has(s.taskId)) {
      seen.set(s.taskId, s);
    }
  }
  return Array.from(seen.values());
}

/* ─── 格式化工具（供 API / LLM Prompt 使用） ─── */

/** 将冲突结果格式化为给 LLM 的结构化上下文 */
export function formatConflictsForLLM(result: ConflictResult): string {
  if (!result.hasConflict) return "无冲突";

  const lines: string[] = ["检测到以下日程冲突："];
  for (const c of result.conflicts) {
    const start = formatTime(c.overlapSlot.start);
    const end = formatTime(c.overlapSlot.end);
    lines.push(`- 与「${c.existingTask.name}」在 ${start}~${end} 重叠 ${c.overlapMinutes} 分钟（优先级：${c.existingTask.priority}）`);
  }

  if (result.suggestions.length > 0) {
    lines.push("", "算法建议：");
    for (const s of result.suggestions) {
      const timeInfo = s.proposedStart ? `→ ${formatTime(s.proposedStart)}` : "";
      lines.push(`- [${s.action}]「${s.taskName}」${timeInfo} — ${s.reason}`);
    }
  }

  return lines.join("\n");
}

/** 将冲突结果格式化为用户可读的简报 */
export function formatConflictsForUser(result: ConflictResult): string {
  if (!result.hasConflict) return "";

  const lines: string[] = ["⚠️ 检测到日程冲突："];
  for (const c of result.conflicts) {
    const start = formatTime(c.overlapSlot.start);
    const end = formatTime(c.overlapSlot.end);
    lines.push(`  · 与「${c.existingTask.name}」在 ${start}~${end} 重叠 ${c.overlapMinutes} 分钟`);
  }

  if (result.suggestions.length > 0) {
    lines.push("", "💡 建议调整：");
    for (const s of result.suggestions) {
      const actionLabel = { move: "移动", shorten: "缩短", postpone: "顺延", cancel: "取消/推迟" }[s.action];
      const timeInfo = s.proposedStart ? ` → ${formatDate(s.proposedStart)} ${formatTime(s.proposedStart)}` : "";
      lines.push(`  · ${actionLabel}「${s.taskName}」${timeInfo}`);
      lines.push(`    原因：${s.reason}`);
    }
  }

  return lines.join("\n");
}

/** 时间格式化 HH:mm */
function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 日期格式化 MM-DD */
function formatDate(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
