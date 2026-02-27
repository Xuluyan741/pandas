/**
 * Agent 自主推送决策引擎
 * 根据用户任务状态、时间窗口、完成记录，智能决定是否推送以及推送内容
 * 推送类型：日程提醒、情绪关怀、成就鼓励、主动协助
 */
import type { Task } from "@/types";
import { isOverdue, isDueToday } from "./progress";

export type PushType = "reminder" | "emotional" | "achievement" | "proactive";

export interface PushDecision {
  shouldPush: boolean;
  type: PushType;
  title: string;
  body: string;
  /** 优先级：1(最高) - 5(最低)，用于排序和限流 */
  priority: number;
}

/** 获取当前时段的问候关键词 */
function getTimePeriod(hour: number): string {
  if (hour < 6) return "深夜";
  if (hour < 9) return "早上";
  if (hour < 12) return "上午";
  if (hour < 14) return "中午";
  if (hour < 18) return "下午";
  if (hour < 22) return "晚上";
  return "深夜";
}

/**
 * 生成推送决策列表
 * 从多个维度分析后返回排序后的推送建议，由调用方决定发送哪几条
 */
export function generatePushDecisions(
  tasks: Task[],
  now: Date = new Date(),
): PushDecision[] {
  const decisions: PushDecision[] = [];
  const hour = now.getHours();
  const period = getTimePeriod(hour);
  const notDone = tasks.filter((t) => t.status !== "Done");

  /* ── 1. 逾期任务提醒（最高优先级） ── */
  const overdueTasks = notDone.filter((t) => isOverdue(t));
  if (overdueTasks.length > 0) {
    const names = overdueTasks
      .slice(0, 3)
      .map((t) => `「${t.name}」`)
      .join("、");
    decisions.push({
      shouldPush: true,
      type: "reminder",
      title: "有任务需要你关注",
      body:
        overdueTasks.length === 1
          ? `${names}已经逾期了，要不要我帮你重新安排一下？`
          : `${names}等 ${overdueTasks.length} 个任务已逾期，我来帮你理理？`,
      priority: 1,
    });
  }

  /* ── 2. 今日到期提醒 ── */
  const todayTasks = notDone.filter(
    (t) => isDueToday(t) && !isOverdue(t),
  );
  if (todayTasks.length > 0) {
    const taskName = todayTasks[0].name;
    const isMonoFocus = todayTasks.length === 1;

    decisions.push({
      shouldPush: true,
      type: "reminder",
      title: isMonoFocus ? "今天的破局点" : `今天有 ${todayTasks.length} 件事`,
      body: isMonoFocus
        ? `${period}好！今天最重要的一件事：「${taskName}」，开始吗？`
        : `${period}好！今天有 ${todayTasks.length} 件事，最重要的是「${taskName}」。一件一件来，不急。`,
      priority: 2,
    });
  }

  /* ── 3. 高优先级待办提醒 ── */
  const highPriority = notDone.filter(
    (t) =>
      t.priority === "高" &&
      t.status === "To Do" &&
      !isDueToday(t) &&
      !isOverdue(t),
  );
  if (highPriority.length > 0 && hour >= 8 && hour <= 10) {
    decisions.push({
      shouldPush: true,
      type: "proactive",
      title: "有件重要的事想提醒你",
      body: `「${highPriority[0].name}」优先级很高但还没开始，今天要不要腾出时间推进一下？`,
      priority: 3,
    });
  }

  /* ── 4. 连续忙碌 → 情绪关怀 ── */
  const doingCount = notDone.filter((t) => t.status === "Doing").length;
  if (doingCount >= 3 && hour >= 14) {
    decisions.push({
      shouldPush: true,
      type: "emotional",
      title: "别忘了休息",
      body: `你同时在推进 ${doingCount} 件事，已经很努力了。要不喝杯水、站起来活动一下？`,
      priority: 4,
    });
  }

  /* ── 5. 成就鼓励 ── */
  const doneToday = tasks.filter((t) => {
    if (t.status !== "Done") return false;
    const updated = new Date(t.updatedAt);
    return (
      updated.getFullYear() === now.getFullYear() &&
      updated.getMonth() === now.getMonth() &&
      updated.getDate() === now.getDate()
    );
  });

  if (doneToday.length >= 3 && hour >= 17) {
    decisions.push({
      shouldPush: true,
      type: "achievement",
      title: "今天效率不错！",
      body: `今天已经完成了 ${doneToday.length} 件事，给自己点个赞吧！`,
      priority: 5,
    });
  }

  /* ── 6. 深夜还在工作 → 关怀 ── */
  if ((hour >= 23 || hour < 5) && doingCount > 0) {
    decisions.push({
      shouldPush: true,
      type: "emotional",
      title: "夜深了",
      body: "这么晚还在忙，辛苦了。剩下的明天再说？早点休息才是最重要的投资。",
      priority: 2,
    });
  }

  /* ── 7. 无任务 → 轻推 ── */
  if (notDone.length === 0 && tasks.length > 0 && hour >= 9 && hour <= 18) {
    decisions.push({
      shouldPush: true,
      type: "achievement",
      title: "清爽！",
      body: "所有任务都完成了！享受这份轻松，或者告诉我接下来想做什么？",
      priority: 5,
    });
  }

  decisions.sort((a, b) => a.priority - b.priority);
  return decisions;
}

/**
 * 选择当前最应该发送的推送（限制每日最多 3 条）
 * 返回 null 表示此刻不应推送
 */
export function pickTopPush(
  tasks: Task[],
  now: Date = new Date(),
): PushDecision | null {
  const decisions = generatePushDecisions(tasks, now);
  return decisions.length > 0 ? decisions[0] : null;
}
