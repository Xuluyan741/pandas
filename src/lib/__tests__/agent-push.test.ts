/**
 * Agent 自主推送决策引擎单元测试
 * 覆盖：各推送场景触发条件、优先级排序、边界条件
 */
import { describe, it, expect } from "vitest";
import { generatePushDecisions, pickTopPush } from "../agent-push";
import type { Task } from "@/types";

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
    createdAt: overrides.createdAt || "2026-01-01T00:00:00Z",
    updatedAt: overrides.updatedAt || "2026-01-01T00:00:00Z",
  };
}

/** 创建指定日期的 Date（方便控制测试时间） */
function at(dateStr: string, hour: number): Date {
  const d = new Date(dateStr);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** 生成今天的 YYYY-MM-DD 字符串（与 progress.ts 保持一致） */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("generatePushDecisions", () => {
  it("有逾期任务时生成 reminder 推送", () => {
    const tasks = [
      makeTask({ name: "过期报告", startDate: "2026-02-20", duration: 1, status: "To Do" }),
    ];
    const now = at("2026-03-01", 9);
    const decisions = generatePushDecisions(tasks, now);
    const reminder = decisions.find((d) => d.type === "reminder" && d.priority === 1);
    expect(reminder).toBeDefined();
    expect(reminder!.body).toContain("过期报告");
  });

  it("今日到期任务生成单线程聚焦推送", () => {
    const today = todayStr();
    const tasks = [
      makeTask({ name: "写周报", startDate: today, duration: 1, status: "Doing" }),
    ];
    const now = at(today, 9);
    const decisions = generatePushDecisions(tasks, now);
    const todayReminder = decisions.find(
      (d) => d.type === "reminder" && d.body.includes("写周报"),
    );
    expect(todayReminder).toBeDefined();
    expect(todayReminder!.title).toContain("破局点");
  });

  it("多个今日到期任务时提示数量", () => {
    const today = todayStr();
    const tasks = [
      makeTask({ name: "任务A", startDate: today, duration: 1 }),
      makeTask({ name: "任务B", startDate: today, duration: 1 }),
    ];
    const now = at(today, 10);
    const decisions = generatePushDecisions(tasks, now);
    const todayReminder = decisions.find((d) => d.title.includes("2 件事"));
    expect(todayReminder).toBeDefined();
  });

  it("高优先级待办在早晨推送提醒", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const futureStr = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
    const tasks = [
      makeTask({ name: "重要方案", startDate: futureStr, priority: "高", status: "To Do" }),
    ];
    const today = todayStr();
    const now = at(today, 9);
    const decisions = generatePushDecisions(tasks, now);
    const proactive = decisions.find((d) => d.type === "proactive");
    expect(proactive).toBeDefined();
    expect(proactive!.body).toContain("重要方案");
  });

  it("高优先级待办在下午不推送", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const futureStr = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
    const tasks = [
      makeTask({ name: "重要方案", startDate: futureStr, priority: "高", status: "To Do" }),
    ];
    const today = todayStr();
    const now = at(today, 15);
    const decisions = generatePushDecisions(tasks, now);
    const proactive = decisions.find((d) => d.type === "proactive");
    expect(proactive).toBeUndefined();
  });

  it("同时处理多个任务时推送情绪关怀", () => {
    const tasks = [
      makeTask({ name: "任务1", status: "Doing" }),
      makeTask({ name: "任务2", status: "Doing" }),
      makeTask({ name: "任务3", status: "Doing" }),
    ];
    const now = at("2026-03-01", 15);
    const decisions = generatePushDecisions(tasks, now);
    const emotional = decisions.find((d) => d.type === "emotional");
    expect(emotional).toBeDefined();
    expect(emotional!.body).toContain("3 件事");
  });

  it("今天完成多个任务时推送成就鼓励", () => {
    const today = todayStr();
    const todayISO = `${today}T10:00:00Z`;
    const tasks = [
      makeTask({ name: "完成1", status: "Done", updatedAt: todayISO }),
      makeTask({ name: "完成2", status: "Done", updatedAt: todayISO }),
      makeTask({ name: "完成3", status: "Done", updatedAt: todayISO }),
    ];
    const now = at(today, 18);
    const decisions = generatePushDecisions(tasks, now);
    const achievement = decisions.find((d) => d.type === "achievement");
    expect(achievement).toBeDefined();
    expect(achievement!.body).toContain("3 件事");
  });

  it("深夜工作推送关怀", () => {
    const tasks = [
      makeTask({ name: "加班任务", status: "Doing" }),
    ];
    const today = todayStr();
    const now = at(today, 23);
    const decisions = generatePushDecisions(tasks, now);
    const lateNight = decisions.find(
      (d) => d.type === "emotional" && d.title === "夜深了",
    );
    expect(lateNight).toBeDefined();
  });

  it("所有任务完成后推送清爽提示", () => {
    const tasks = [
      makeTask({ name: "已完成", status: "Done", updatedAt: "2026-02-28T10:00:00Z" }),
    ];
    const today = todayStr();
    const now = at(today, 10);
    const decisions = generatePushDecisions(tasks, now);
    const clear = decisions.find((d) => d.title === "清爽！");
    expect(clear).toBeDefined();
  });

  it("无任务时不生成推送", () => {
    const decisions = generatePushDecisions([], at(todayStr(), 10));
    expect(decisions).toHaveLength(0);
  });

  it("决策按优先级排序", () => {
    const today = todayStr();
    const past = new Date();
    past.setDate(past.getDate() - 5);
    const overdueDate = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, "0")}-${String(past.getDate()).padStart(2, "0")}`;
    const tasks = [
      makeTask({ name: "逾期任务", startDate: overdueDate, duration: 1, status: "To Do" }),
      makeTask({ name: "今日到期", startDate: today, duration: 1, status: "Doing" }),
    ];
    const now = at(today, 9);
    const decisions = generatePushDecisions(tasks, now);
    expect(decisions.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < decisions.length; i++) {
      expect(decisions[i].priority).toBeGreaterThanOrEqual(decisions[i - 1].priority);
    }
  });
});

describe("pickTopPush", () => {
  it("返回最高优先级的推送", () => {
    const tasks = [
      makeTask({ name: "逾期报告", startDate: "2026-02-20", duration: 1, status: "To Do" }),
    ];
    const result = pickTopPush(tasks, at("2026-03-01", 9));
    expect(result).not.toBeNull();
    expect(result!.priority).toBe(1);
  });

  it("无推送需求时返回 null", () => {
    const result = pickTopPush([], at("2026-03-01", 10));
    expect(result).toBeNull();
  });
});
