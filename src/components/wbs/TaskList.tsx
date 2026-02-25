"use client";

/**
 * 任务列表展示：Evervault 卡片网格，支持状态筛选、逾期/今日到期高亮、快速改状态
 */
import type { Task, Project, TaskStatus } from "@/types";
import { isOverdue, isDueToday } from "@/lib/progress";
import { cn } from "@/lib/utils";
import { EvervaultCard } from "@/components/ui/evervault-card";
import { Pencil, RefreshCw, Clock, Calendar } from "lucide-react";

interface TaskListProps {
  tasks: Task[];
  projects: Project[];
  onEdit?: (task: Task) => void;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  statusFilter?: TaskStatus | "all";
}

/** 状态徽章样式映射 */
const STATUS_STYLES: Record<TaskStatus, string> = {
  "To Do": "bg-violet-500/20 text-violet-300 border border-violet-500/30",
  "Doing": "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30",
  "Done": "bg-green-500/20 text-green-300 border border-green-500/30",
};

/** 优先级样式映射 */
const PRIORITY_STYLES: Record<string, string> = {
  "高": "text-red-400 bg-red-500/10 border border-red-500/20",
  "中": "text-amber-400 bg-amber-500/10 border border-amber-500/20",
  "低": "text-neutral-400 bg-neutral-500/10 border border-neutral-500/20",
};

/** 项目组颜色映射 */
const GROUP_STYLES: Record<string, string> = {
  "创业": "text-cyan-400",
  "工作": "text-red-400",
  "生活": "text-green-400",
};

export function TaskList({
  tasks,
  projects,
  onEdit,
  onStatusChange,
  statusFilter = "all",
}: TaskListProps) {
  const filtered =
    statusFilter === "all"
      ? tasks
      : tasks.filter((t) => t.status === statusFilter);
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  if (filtered.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-2xl bg-[rgb(15,5,40)]">
        <p className="text-sm text-violet-300/50">暂无任务</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {filtered.map((task) => {
        const project = projectMap.get(task.projectId);
        const overdue = isOverdue(task);
        const dueToday = isDueToday(task);
        const endDate = getEndDate(task.startDate, task.duration);

        return (
          <EvervaultCard key={task.id}>
            <div className="flex flex-col gap-3 p-4">
              {/* 顶部：任务名 + 循环标签 */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-white leading-tight">
                    {task.name}
                  </span>
                  {task.isRecurring && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-300 border border-violet-500/30">
                      <RefreshCw className="h-2.5 w-2.5" />
                      循环
                    </span>
                  )}
                </div>
                {/* 优先级徽章 */}
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    PRIORITY_STYLES[task.priority]
                  )}
                >
                  {task.priority}
                </span>
              </div>

              {/* 项目归属 */}
              {project && (
                <p className="text-xs text-violet-300/60">
                  {project.name}{" "}
                  <span className={cn("font-medium", GROUP_STYLES[project.group])}>
                    [{project.group}]
                  </span>
                </p>
              )}

              {/* 日期与工期 */}
              <div className="flex items-center gap-3 text-xs text-violet-300/50">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {task.startDate}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {task.duration} 天 → {endDate}
                </span>
              </div>

              {/* 底部：状态选择 + 操作 */}
              <div className="flex items-center justify-between pt-1">
                <select
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium outline-none cursor-pointer transition-all",
                    "bg-transparent border-0 appearance-none",
                    STATUS_STYLES[task.status]
                  )}
                  value={task.status}
                  onChange={(e) =>
                    onStatusChange?.(task.id, e.target.value as TaskStatus)
                  }
                >
                  <option value="To Do" className="bg-neutral-900 text-white">To Do</option>
                  <option value="Doing" className="bg-neutral-900 text-white">Doing</option>
                  <option value="Done" className="bg-neutral-900 text-white">Done</option>
                </select>

                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(task)}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-violet-400 hover:text-violet-200 hover:bg-violet-500/20 transition-all"
                  >
                    <Pencil className="h-3 w-3" />
                    编辑
                  </button>
                )}
              </div>

              {/* 逾期 / 今日到期提示条 */}
              {(overdue || dueToday) && (
                <div
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs font-medium text-center",
                    overdue
                      ? "bg-red-500/20 text-red-300 border border-red-500/30"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  )}
                >
                  {overdue ? "⚠ 已逾期" : "⏰ 今日到期"}
                </div>
              )}
            </div>
          </EvervaultCard>
        );
      })}
    </div>
  );
}

/** 根据开始日期和工期计算结束日期 */
function getEndDate(startDate: string, duration: number): string {
  const d = new Date(startDate);
  d.setDate(d.getDate() + duration - 1);
  return d.toISOString().slice(0, 10);
}
