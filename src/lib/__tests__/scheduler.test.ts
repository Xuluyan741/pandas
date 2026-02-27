/**
 * 冲突消解引擎单元测试
 * 覆盖：时间重叠检测、优先级排序、建议生成、边界条件
 */
import { describe, it, expect } from "vitest";
import {
  isOverlapping,
  getOverlapMinutes,
  getTaskTimeSlot,
  toEisenhower,
  detectConflicts,
  formatConflictsForUser,
  formatConflictsForLLM,
  type TimeSlot,
} from "../scheduler";
import type { Task } from "@/types";

/* ─── 辅助：快速构造 Task ─── */
function makeTask(overrides: Partial<Task> & { name: string }): Task {
  return {
    id: overrides.id || `task-${Math.random().toString(36).slice(2)}`,
    name: overrides.name,
    projectId: overrides.projectId || "proj-1",
    startDate: overrides.startDate || "2026-03-01",
    startTime: overrides.startTime,
    endTime: overrides.endTime,
    duration: overrides.duration ?? 1,
    dependencies: overrides.dependencies || [],
    status: overrides.status || "To Do",
    priority: overrides.priority || "中",
    isRecurring: overrides.isRecurring,
    progress: overrides.progress,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

/* ─── isOverlapping ─── */
describe("isOverlapping", () => {
  it("完全重叠返回 true", () => {
    const a: TimeSlot = { start: new Date("2026-03-01T09:00"), end: new Date("2026-03-01T11:00") };
    const b: TimeSlot = { start: new Date("2026-03-01T09:00"), end: new Date("2026-03-01T11:00") };
    expect(isOverlapping(a, b)).toBe(true);
  });

  it("部分重叠返回 true", () => {
    const a: TimeSlot = { start: new Date("2026-03-01T09:00"), end: new Date("2026-03-01T11:00") };
    const b: TimeSlot = { start: new Date("2026-03-01T10:00"), end: new Date("2026-03-01T12:00") };
    expect(isOverlapping(a, b)).toBe(true);
  });

  it("刚好首尾相接不算重叠", () => {
    const a: TimeSlot = { start: new Date("2026-03-01T09:00"), end: new Date("2026-03-01T10:00") };
    const b: TimeSlot = { start: new Date("2026-03-01T10:00"), end: new Date("2026-03-01T11:00") };
    expect(isOverlapping(a, b)).toBe(false);
  });

  it("完全不重叠返回 false", () => {
    const a: TimeSlot = { start: new Date("2026-03-01T09:00"), end: new Date("2026-03-01T10:00") };
    const b: TimeSlot = { start: new Date("2026-03-01T14:00"), end: new Date("2026-03-01T15:00") };
    expect(isOverlapping(a, b)).toBe(false);
  });

  it("包含关系返回 true", () => {
    const a: TimeSlot = { start: new Date("2026-03-01T08:00"), end: new Date("2026-03-01T18:00") };
    const b: TimeSlot = { start: new Date("2026-03-01T10:00"), end: new Date("2026-03-01T12:00") };
    expect(isOverlapping(a, b)).toBe(true);
  });
});

/* ─── getOverlapMinutes ─── */
describe("getOverlapMinutes", () => {
  it("部分重叠计算正确", () => {
    const a: TimeSlot = { start: new Date("2026-03-01T09:00"), end: new Date("2026-03-01T11:00") };
    const b: TimeSlot = { start: new Date("2026-03-01T10:00"), end: new Date("2026-03-01T12:00") };
    expect(getOverlapMinutes(a, b)).toBe(60);
  });

  it("不重叠返回 0", () => {
    const a: TimeSlot = { start: new Date("2026-03-01T09:00"), end: new Date("2026-03-01T10:00") };
    const b: TimeSlot = { start: new Date("2026-03-01T11:00"), end: new Date("2026-03-01T12:00") };
    expect(getOverlapMinutes(a, b)).toBe(0);
  });

  it("完全重叠返回完整时长", () => {
    const a: TimeSlot = { start: new Date("2026-03-01T14:00"), end: new Date("2026-03-01T16:00") };
    expect(getOverlapMinutes(a, a)).toBe(120);
  });
});

/* ─── toEisenhower ─── */
describe("toEisenhower", () => {
  it("高 → P0", () => expect(toEisenhower("高")).toBe(0));
  it("中 → P1", () => expect(toEisenhower("中")).toBe(1));
  it("低 → P2", () => expect(toEisenhower("低")).toBe(2));
});

/* ─── getTaskTimeSlot ─── */
describe("getTaskTimeSlot", () => {
  it("有 startTime 和 endTime 时精确解析", () => {
    const task = makeTask({ name: "开会", startDate: "2026-03-01", startTime: "14:00", endTime: "16:00" });
    const slot = getTaskTimeSlot(task);
    expect(slot.start.getHours()).toBe(14);
    expect(slot.start.getMinutes()).toBe(0);
    expect(slot.end.getHours()).toBe(16);
    expect(slot.end.getMinutes()).toBe(0);
  });

  it("只有 startTime 无 endTime 时按 duration 小时计算", () => {
    const task = makeTask({ name: "写代码", startDate: "2026-03-01", startTime: "09:00", duration: 3 });
    const slot = getTaskTimeSlot(task);
    expect(slot.start.getHours()).toBe(9);
    expect(slot.end.getHours()).toBe(12);
  });

  it("无任何时间时默认从 9:00 开始，按 duration 天数计算", () => {
    const task = makeTask({ name: "调研", startDate: "2026-03-01", duration: 2 });
    const slot = getTaskTimeSlot(task);
    expect(slot.start.getHours()).toBe(9);
    expect(slot.end.getDate() - slot.start.getDate()).toBe(2);
  });
});

/* ─── detectConflicts ─── */
describe("detectConflicts", () => {
  it("无冲突时返回 hasConflict=false", () => {
    const existing = makeTask({ name: "上午写代码", startDate: "2026-03-01", startTime: "09:00", endTime: "11:00" });
    const newTask = makeTask({ name: "下午开会", startDate: "2026-03-01", startTime: "14:00", endTime: "15:00" });
    const result = detectConflicts(newTask, [existing]);
    expect(result.hasConflict).toBe(false);
    expect(result.conflicts).toHaveLength(0);
  });

  it("时间重叠时检测到冲突", () => {
    const existing = makeTask({ name: "深度工作", startDate: "2026-03-01", startTime: "09:00", endTime: "12:00" });
    const newTask = makeTask({ name: "客户会议", startDate: "2026-03-01", startTime: "11:00", endTime: "13:00" });
    const result = detectConflicts(newTask, [existing]);
    expect(result.hasConflict).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].overlapMinutes).toBe(60);
  });

  it("已完成任务不参与冲突检测", () => {
    const existing = makeTask({ name: "已完成", startDate: "2026-03-01", startTime: "09:00", endTime: "12:00", status: "Done" });
    const newTask = makeTask({ name: "新任务", startDate: "2026-03-01", startTime: "10:00", endTime: "11:00" });
    const result = detectConflicts(newTask, [existing]);
    expect(result.hasConflict).toBe(false);
  });

  it("高优先级新任务冲突低优先级已有任务时，建议推迟已有任务", () => {
    const existing = makeTask({
      name: "取快递",
      startDate: "2026-03-01",
      startTime: "14:00",
      endTime: "15:00",
      priority: "低",
    });
    const newTask = makeTask({
      name: "紧急客户会议",
      startDate: "2026-03-01",
      startTime: "14:00",
      endTime: "16:00",
      priority: "高",
    });
    const result = detectConflicts(newTask, [existing]);
    expect(result.hasConflict).toBe(true);
    expect(result.suggestions.length).toBeGreaterThan(0);
    const suggestion = result.suggestions.find((s) => s.taskId === existing.id);
    expect(suggestion).toBeDefined();
    expect(["postpone", "cancel"]).toContain(suggestion!.action);
  });

  it("低优先级新任务冲突高优先级已有任务时，建议移动新任务", () => {
    const existing = makeTask({
      name: "重要会议",
      startDate: "2026-03-01",
      startTime: "14:00",
      endTime: "16:00",
      priority: "高",
    });
    const newTask = makeTask({
      name: "看电影",
      startDate: "2026-03-01",
      startTime: "15:00",
      endTime: "17:00",
      priority: "低",
    });
    const result = detectConflicts(newTask, [existing]);
    expect(result.hasConflict).toBe(true);
    const suggestion = result.suggestions.find((s) => s.taskId === newTask.id);
    expect(suggestion).toBeDefined();
    expect(suggestion!.action).toBe("move");
  });

  it("多个冲突全部检测到", () => {
    const tasks = [
      makeTask({ id: "t1", name: "任务A", startDate: "2026-03-01", startTime: "09:00", endTime: "11:00" }),
      makeTask({ id: "t2", name: "任务B", startDate: "2026-03-01", startTime: "10:00", endTime: "12:00" }),
    ];
    const newTask = makeTask({ name: "全天任务", startDate: "2026-03-01", startTime: "08:00", endTime: "13:00" });
    const result = detectConflicts(newTask, tasks);
    expect(result.hasConflict).toBe(true);
    expect(result.conflicts).toHaveLength(2);
  });
});

/* ─── 格式化函数 ─── */
describe("formatConflictsForUser", () => {
  it("无冲突时返回空字符串", () => {
    expect(formatConflictsForUser({ hasConflict: false, conflicts: [], suggestions: [] })).toBe("");
  });

  it("有冲突时包含警告标记和建议", () => {
    const existing = makeTask({ name: "写代码", startDate: "2026-03-01", startTime: "09:00", endTime: "12:00" });
    const newTask = makeTask({ name: "开会", startDate: "2026-03-01", startTime: "11:00", endTime: "13:00" });
    const result = detectConflicts(newTask, [existing]);
    const text = formatConflictsForUser(result);
    expect(text).toContain("⚠️");
    expect(text).toContain("写代码");
  });
});

describe("formatConflictsForLLM", () => {
  it("无冲突时返回无冲突", () => {
    expect(formatConflictsForLLM({ hasConflict: false, conflicts: [], suggestions: [] })).toBe("无冲突");
  });

  it("有冲突时包含结构化描述", () => {
    const existing = makeTask({ name: "健身", startDate: "2026-03-01", startTime: "18:00", endTime: "19:00", priority: "低" });
    const newTask = makeTask({ name: "加班", startDate: "2026-03-01", startTime: "18:00", endTime: "20:00", priority: "高" });
    const result = detectConflicts(newTask, [existing]);
    const text = formatConflictsForLLM(result);
    expect(text).toContain("健身");
    expect(text).toContain("60 分钟");
    expect(text).toContain("算法建议");
  });
});
