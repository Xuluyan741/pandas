/**
 * Agent 自主推送决策引擎（PRD Phase 6 扩展）
 * 推送类型：日程提醒、情绪关怀、成就鼓励、主动协助、长期目标监督
 */
import type { Task, LongTermGoal } from "@/types";
import { isOverdue, isDueToday } from "./progress";

export type PushType = "reminder" | "emotional" | "achievement" | "proactive" | "goal_supervision";

export interface PushDecision {
  shouldPush: boolean;
  type: PushType;
  title: string;
  body: string;
  priority: number;
}

function getTimePeriod(hour: number): string {
  if (hour < 6) return "深夜";
  if (hour < 9) return "早上";
  if (hour < 12) return "上午";
  if (hour < 14) return "中午";
  if (hour < 18) return "下午";
  if (hour < 22) return "晚上";
  return "深夜";
}

/** 计算长期目标剩余天数 */
function daysRemaining(deadline: string): number {
  const today = new Date();
  const deadlineDate = new Date(deadline);
  const diff = deadlineDate.getTime() - today.getTime();
  return Math.ceil(diff / 86400000);
}

/** 计算长期目标下子任务的完成率 */
function goalCompletionRate(goalId: string, tasks: Task[]): { total: number; done: number; rate: number } {
  const goalTasks = tasks.filter((t) => t.parentGoalId === goalId);
  const total = goalTasks.length;
  const done = goalTasks.filter((t) => t.status === "Done").length;
  return { total, done, rate: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/**
 * 生成推送决策列表（包含长期目标监督）
 */
export function generatePushDecisions(
  tasks: Task[],
  now: Date = new Date(),
  goals: LongTermGoal[] = [],
): PushDecision[] {
  const decisions: PushDecision[] = [];
  const hour = now.getHours();
  const period = getTimePeriod(hour);
  const notDone = tasks.filter((t) => t.status !== "Done");

  /* ── 1. 逾期任务提醒 ── */
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

  /* ── 3. 长期目标每日监督推送 ── */
  const activeGoals = goals.filter((g) => g.status === "active");
  for (const goal of activeGoals) {
    const remaining = daysRemaining(goal.deadline);
    const { total, done, rate } = goalCompletionRate(goal.id, tasks);

    if (total === 0) continue;

    const todayGoalTasks = tasks.filter(
      (t) => t.parentGoalId === goal.id &&
             t.status !== "Done" &&
             t.startDate === now.toISOString().slice(0, 10),
    );

    if (todayGoalTasks.length > 0) {
      const taskNames = todayGoalTasks.map((t) => `「${t.name}」`).join("、");
      const resourceLinks = todayGoalTasks
        .filter((t) => t.resourceUrl)
        .map((t) => t.resourceUrl!);

      let body = `今天的「${goal.title}」任务：${taskNames}。`;

      if (resourceLinks.length > 0) {
        body += `\n📎 参考资料：${resourceLinks[0]}`;
      }

      // 灵魂伴侣式语气
      if (rate >= 70) {
        body += `\n你太棒了！已经完成了 ${rate}%，剩余 ${remaining} 天，胜利在望！`;
      } else if (rate >= 40) {
        body += `\n已完成 ${done}/${total}（${rate}%），还有 ${remaining} 天，节奏不错，继续保持。`;
      } else {
        body += `\n已完成 ${done}/${total}（${rate}%），还有 ${remaining} 天。不着急，一步一步来，我陪着你。`;
      }

      decisions.push({
        shouldPush: true,
        type: "goal_supervision",
        title: `📌 ${goal.title} · 今日任务`,
        body,
        priority: 2,
      });
    } else if (remaining <= 7 && remaining > 0 && rate < 80) {
      decisions.push({
        shouldPush: true,
        type: "goal_supervision",
        title: `⏰ ${goal.title} · 还有 ${remaining} 天`,
        body: `距离「${goal.title}」只剩 ${remaining} 天了，当前完成 ${rate}%。今天要不要抽点时间推进一下？我可以帮你看看接下来优先做什么。`,
        priority: 2,
      });
    }
  }

  /* ── 4. 高优先级待办提醒 ── */
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

  /* ── 5. 连续忙碌 → 情绪关怀 ── */
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

  /* ── 6. 成就鼓励 ── */
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

  /* ── 7. 深夜还在工作 → 关怀 ── */
  if ((hour >= 23 || hour < 5) && doingCount > 0) {
    decisions.push({
      shouldPush: true,
      type: "emotional",
      title: "夜深了",
      body: "这么晚还在忙，辛苦了。剩下的明天再说？早点休息才是最重要的投资。",
      priority: 2,
    });
  }

  /* ── 8. 无任务 → 轻推 ── */
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
 * 选择当前最应该发送的推送
 */
export function pickTopPush(
  tasks: Task[],
  now: Date = new Date(),
  goals: LongTermGoal[] = [],
): PushDecision | null {
  const decisions = generatePushDecisions(tasks, now, goals);
  return decisions.length > 0 ? decisions[0] : null;
}
