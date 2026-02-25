"use client";

/**
 * AI 破局建议：带渐变背景动效的「今日破局点」卡片
 * 使用 BackgroundGradientAnimation + GradientButton 双重视觉强化
 */
import { useState } from "react";
import type { Task, Project } from "@/types";
import { isOverdue, isDueToday } from "@/lib/progress";
import { BackgroundGradientAnimation } from "@/components/ui/background-gradient-animation";
import { GradientButton } from "@/components/ui/gradient-button";
import { Sparkles, Lightbulb } from "lucide-react";

interface AIBreakthroughProps {
  tasks: Task[];
  projects: Project[];
}

function generateBreakthrough(tasks: Task[], projects: Project[]): string {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const incomplete = tasks.filter((t) => t.status !== "Done");
  const overdue = incomplete.filter((t) => isOverdue(t));
  const dueToday = incomplete.filter((t) => isDueToday(t));
  const highPriority = incomplete.filter((t) => t.priority === "高");

  const parts: string[] = [];
  if (overdue.length > 0) {
    const names = overdue.slice(0, 2).map((t) => t.name);
    const proj = overdue[0] && projectMap.get(overdue[0].projectId)?.group;
    parts.push(`🚨 你有 ${overdue.length} 项任务已逾期（${names.join("、")}${proj ? `，来自${proj}组` : ""}），建议立即处理。`);
  }
  if (dueToday.length > 0 && overdue.length === 0) {
    const names = dueToday.slice(0, 2).map((t) => t.name);
    parts.push(`⏰ 今日到期：${names.join("、")}${dueToday.length > 2 ? " 等" : ""}，请优先完成。`);
  }
  if (highPriority.length > 0 && parts.length === 0) {
    const t = highPriority[0];
    const proj = projectMap.get(t.projectId);
    parts.push(`🎯 建议今天聚焦高优先级任务「${t.name}」${proj ? `（${proj.name}）` : ""}，推进整体进度。`);
  }
  if (incomplete.length > 0 && parts.length === 0) {
    parts.push(`📋 当前还有 ${incomplete.length} 项未完成任务，建议按优先级逐项推进，保持节奏。`);
  }
  if (parts.length === 0) {
    return "✅ 当前没有未完成任务，状态良好，继续保持节奏。";
  }
  return parts.join(" ");
}

export function AIBreakthrough({ tasks, projects }: AIBreakthroughProps) {
  const [tip, setTip] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    setLoading(true);
    setTimeout(() => {
      setTip(generateBreakthrough(tasks, projects));
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
        <p className="text-sm leading-relaxed text-white/90 max-w-2xl">
          {tip}
        </p>
      )}
      {!tip && (
        <p className="text-sm text-white/50">点击「生成建议」，AI 将基于你的任务状态给出今日行动建议。</p>
      )}
    </BackgroundGradientAnimation>
  );
}
