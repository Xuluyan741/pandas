"use client";

/**
 * AI 破局建议：带渐变背景动效的「今日破局点」卡片
 * 基于任务与项目全量数据生成多维度文字分析报告
 */
import { useState } from "react";
import type { Task, Project, LongTermGoal } from "@/types";
import {
  isOverdue,
  isDueToday,
  getTaskEndDate,
  getProjectProgress,
  getGroupProgress,
  getOverallProgress,
} from "@/lib/progress";
import { BackgroundGradientAnimation } from "@/components/ui/background-gradient-animation";
import { GradientButton } from "@/components/ui/gradient-button";
import { Sparkles, Lightbulb } from "lucide-react";

const TODAY = new Date().toISOString().slice(0, 10);

interface AIBreakthroughProps {
  tasks: Task[];
  projects: Project[];
  goals?: LongTermGoal[];
}

/** 未来 N 天内结束的未完成任务数（不含今日、不含已逾期） */
function countDueInDays(tasks: Task[], days: number): { count: number; list: Task[] } {
  const list = tasks.filter((t) => {
    if (t.status === "Done") return false;
    const end = getTaskEndDate(t);
    if (end <= TODAY) return false;
    const endDate = new Date(end);
    const limit = new Date(TODAY);
    limit.setDate(limit.getDate() + days);
    return endDate <= limit;
  });
  return { count: list.length, list };
}

/**
 * 基于全量数据生成多维度文字分析报告
 */
function generateBreakthrough(
  tasks: Task[],
  projects: Project[],
  goals: LongTermGoal[] = [],
): string {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const sections: string[] = [];

  // ── 1. 总体概览 ──
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "Done").length;
  const overallProgress = getOverallProgress(tasks);
  sections.push(`【总体概览】共 ${total} 项任务，已完成 ${done} 项，整体进度 ${overallProgress}%。`);

  if (projects.length > 0) {
    const groupNames = ["创业", "工作", "生活"] as const;
    const groupLines = groupNames
      .filter((g) => projects.some((p) => p.group === g))
      .map((g) => {
        const progress = getGroupProgress(g, projects, tasks);
        const count = tasks.filter((t) => {
          const p = projectMap.get(t.projectId);
          return p?.group === g;
        }).length;
        return `${g} ${count} 项、进度 ${progress}%`;
      });
    if (groupLines.length > 0) {
      sections.push(`【按项目组】${groupLines.join("；").trim()}.`);
    }
  }

  // ── 2. 按状态与优先级 ──
  const toDo = tasks.filter((t) => t.status === "To Do");
  const doing = tasks.filter((t) => t.status === "Doing");
  const incomplete = tasks.filter((t) => t.status !== "Done");
  const high = incomplete.filter((t) => t.priority === "高");
  const mid = incomplete.filter((t) => t.priority === "中");
  const low = incomplete.filter((t) => t.priority === "低");
  sections.push(
    `【状态分布】待办 ${toDo.length}、进行中 ${doing.length}、已完成 ${done}。` +
      ` 未完成中：高优 ${high.length}、中 ${mid.length}、低 ${low.length}。`,
  );

  // ── 3. 时间维度：逾期、今日、未来 7 天 ──
  const overdue = incomplete.filter((t) => isOverdue(t));
  const dueToday = incomplete.filter((t) => isDueToday(t));
  const { count: dueIn7, list: dueIn7List } = countDueInDays(tasks, 7);

  if (overdue.length > 0) {
    const names = overdue.map((t) => {
      const p = projectMap.get(t.projectId);
      return `「${t.name}」${p ? `（${p.name}）` : ""}`;
    });
    sections.push(`【逾期】${overdue.length} 项需尽快处理：${names.join("；")}.`);
  }
  if (dueToday.length > 0) {
    const names = dueToday.map((t) => `「${t.name}」`).join("、");
    sections.push(`【今日到期】${names}${dueToday.length > 1 ? " 等" : ""}，建议今日完成。`);
  }
  if (dueIn7 > 0) {
    const names = dueIn7List.slice(0, 3).map((t) => t.name).join("、");
    sections.push(`【未来 7 天】${dueIn7} 项将到期${dueIn7List.length > 0 ? `，含：${names}${dueIn7 > 3 ? " 等" : ""}` : ""}。`);
  }

  // ── 4. 进行中任务与项目进度 ──
  if (doing.length > 0) {
    const byProject = new Map<string, Task[]>();
    doing.forEach((t) => {
      const arr = byProject.get(t.projectId) ?? [];
      arr.push(t);
      byProject.set(t.projectId, arr);
    });
    const doingDesc = Array.from(byProject.entries())
      .map(([pid, list]) => {
        const p = projectMap.get(pid);
        const progress = getProjectProgress(pid, tasks);
        return `${p?.name ?? "未命名"}（${list.length} 项进行中、进度 ${progress}%）`;
      })
      .join("；");
    sections.push(`【进行中】${doingDesc}.`);
  }

  // ── 5. 长期目标与循环任务 ──
  const goalTasks = tasks.filter((t) => t.parentGoalId);
  const recurring = tasks.filter((t) => t.isRecurring && t.status !== "Done");
  if (goals.length > 0 || goalTasks.length > 0) {
    const activeGoals = goals.filter((g) => g.status === "active");
    sections.push(
      `【长期目标】${activeGoals.length} 个活跃目标，${goalTasks.length} 项关联子任务。`,
    );
  }
  if (recurring.length > 0) {
    sections.push(`【循环任务】${recurring.length} 项（如每日/周期习惯），需持续跟进。`);
  }

  // ── 6. 破局建议（综合给出 1～3 条，统一编号） ──
  const tips: string[] = [];
  if (overdue.length > 0) {
    const first = overdue[0];
    const p = projectMap.get(first.projectId);
    tips.push(`优先处理逾期任务「${first.name}」${p ? `（${p.name}）` : ""}，避免积压。`);
  }
  if (dueToday.length > 0) {
    const first = dueToday[0];
    tips.push(`今日到期「${first.name}」请务必完成。`);
  }
  if (high.length > 0 && overdue.length === 0 && dueToday.length === 0) {
    const first = high[0];
    const p = projectMap.get(first.projectId);
    tips.push(`建议聚焦高优任务「${first.name}」${p ? `（${p.name}）` : ""}，推进整体进度。`);
  }
  if (doing.length >= 2 && tips.length < 2) {
    tips.push(`你同时在推进 ${doing.length} 件事，建议选定 1～2 件今日收尾，再开新项。`);
  }
  if (incomplete.length > 0 && tips.length < 2) {
    tips.push(`当前共 ${incomplete.length} 项未完成，按优先级逐项推进、保持节奏即可。`);
  }
  if (incomplete.length === 0) {
    tips.push("当前没有未完成任务，状态良好，可安排休息或规划下一阶段。");
  }
  const numbered = tips.slice(0, 3).map((s, i) => ["①", "②", "③"][i] + " " + s);
  sections.push("【今日破局建议】\n" + numbered.join("\n"));

  return sections.join("\n\n");
}

export function AIBreakthrough({ tasks, projects, goals = [] }: AIBreakthroughProps) {
  const [tip, setTip] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    setLoading(true);
    setTimeout(() => {
      setTip(generateBreakthrough(tasks, projects, goals));
      setLoading(false);
    }, 600);
  };

  return (
    <BackgroundGradientAnimation
      gradientBackgroundStart="rgb(30, 10, 60)"
      gradientBackgroundEnd="rgb(5, 20, 80)"
      firstColor="100, 60, 220"
      secondColor="180, 40, 200"
      thirdColor="30, 100, 255"
      fourthColor="80, 20, 120"
      fifthColor="20, 60, 160"
      pointerColor="150, 80, 255"
      containerClassName="rounded-2xl min-h-[140px]"
      className="flex flex-col items-start justify-center gap-4 px-6 py-8"
      interactive
    >
      <div className="flex w-full items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-yellow-300" />
          <h3 className="text-lg font-bold text-white">今日破局点</h3>
        </div>
        <GradientButton
          onClick={handleClick}
          disabled={loading}
          className="flex items-center gap-2"
        >
          <Sparkles className="h-4 w-4" />
          {loading ? "分析中…" : "生成建议"}
        </GradientButton>
      </div>
      {tip && (
        <div className="text-sm leading-relaxed text-white/90 max-w-2xl whitespace-pre-line">
          {tip}
        </div>
      )}
      {!tip && (
        <p className="text-sm text-white/50">点击「生成建议」，AI 将基于你的任务状态给出今日行动建议。</p>
      )}
    </BackgroundGradientAnimation>
  );
}
