"use client";

/**
 * 长期目标管理面板（PRD Phase 6.5）
 * 展示活跃的长期目标列表，含进度条、剩余天数、资料链接、暂停/调整/结束按钮
 */
import { useStore } from "@/store/useStore";
import type { Task, LongTermGoal } from "@/types";
import { Pause, Play, CheckCircle, Trash2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

/** 计算剩余天数 */
function daysRemaining(deadline: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadlineDate = new Date(deadline);
  const diff = deadlineDate.getTime() - today.getTime();
  return Math.ceil(diff / 86400000);
}

/** 计算目标下子任务完成率 */
function completionRate(goalId: string, tasks: Task[]): { total: number; done: number; rate: number } {
  const goalTasks = tasks.filter((t) => t.parentGoalId === goalId);
  const total = goalTasks.length;
  const done = goalTasks.filter((t) => t.status === "Done").length;
  return { total, done, rate: total === 0 ? 0 : Math.round((done / total) * 100) };
}

const categoryLabel: Record<string, string> = {
  travel: "旅行",
  exam: "考试",
  fitness: "健身",
  project: "项目",
  custom: "自定义",
};

export function GoalManager() {
  const goals = useStore((s) => s.goals);
  const tasks = useStore((s) => s.tasks);
  const updateGoal = useStore((s) => s.updateGoal);
  const removeGoal = useStore((s) => s.removeGoal);

  if (goals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-400 dark:border-neutral-700">
        暂无长期目标。在对话中说出你的目标（如「帮我规划五一去韩国旅游」），小熊猫会帮你制定计划。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
        长期目标管家
      </h3>
      {goals.map((goal) => (
        <GoalCard
          key={goal.id}
          goal={goal}
          tasks={tasks}
          onPause={() => updateGoal(goal.id, { status: "paused" })}
          onResume={() => updateGoal(goal.id, { status: "active" })}
          onComplete={() => updateGoal(goal.id, { status: "completed" })}
          onRemove={() => removeGoal(goal.id)}
        />
      ))}
    </div>
  );
}

function GoalCard({
  goal,
  tasks,
  onPause,
  onResume,
  onComplete,
  onRemove,
}: {
  goal: LongTermGoal;
  tasks: Task[];
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
  onRemove: () => void;
}) {
  const remaining = daysRemaining(goal.deadline);
  const { total, done, rate } = completionRate(goal.id, tasks);
  const goalTasks = tasks.filter((t) => t.parentGoalId === goal.id);
  const isActive = goal.status === "active";

  return (
    <div
      className={cn(
        "rounded-xl border p-3 text-xs",
        goal.status === "completed"
          ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20"
          : goal.status === "paused"
            ? "border-yellow-200 bg-yellow-50/30 dark:border-yellow-800 dark:bg-yellow-950/20"
            : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800/50",
      )}
    >
      {/* 头部 */}
      <div className="mb-2 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-800 dark:text-neutral-200">
              {goal.title}
            </span>
            <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
              {categoryLabel[goal.category] ?? goal.category}
            </span>
            {goal.status === "paused" && (
              <span className="rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400">
                已暂停
              </span>
            )}
            {goal.status === "completed" && (
              <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-600 dark:bg-green-900/50 dark:text-green-400">
                已完成
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">
            截止 {goal.deadline}
            {remaining > 0 ? ` · 剩余 ${remaining} 天` : remaining === 0 ? " · 今天截止" : ` · 已过期 ${Math.abs(remaining)} 天`}
          </div>
        </div>
      </div>

      {/* 进度条 */}
      {total > 0 && (
        <div className="mb-2">
          <div className="mb-1 flex items-center justify-between text-[10px] text-neutral-500 dark:text-neutral-400">
            <span>完成 {done}/{total}</span>
            <span>{rate}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                rate >= 80 ? "bg-green-500" : rate >= 40 ? "bg-orange-400" : "bg-neutral-400",
              )}
              style={{ width: `${rate}%` }}
            />
          </div>
        </div>
      )}

      {/* 今日子任务（含资料链接） */}
      {isActive && (() => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const todayGoalTasks = goalTasks.filter(
          (t) => t.startDate === todayStr && t.status !== "Done",
        );
        if (todayGoalTasks.length === 0) return null;
        return (
          <div className="mb-2 rounded-lg bg-orange-50/50 p-2 dark:bg-orange-950/10">
            <div className="mb-1 text-[10px] font-medium text-orange-600 dark:text-orange-400">
              今日任务
            </div>
            {todayGoalTasks.map((t) => (
              <div key={t.id} className="flex items-start gap-1 text-[11px] leading-snug text-neutral-600 dark:text-neutral-300">
                <span>· {t.name}</span>
                {t.resourceUrl && (
                  <a
                    href={t.resourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 inline-flex shrink-0 items-center text-blue-500 hover:text-blue-600"
                    title="打开参考资料"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      {/* 健康/减肥类免责声明 */}
      {goal.category === "fitness" && isActive && (
        <div className="mb-2 rounded-lg bg-yellow-50/50 px-2 py-1 text-[10px] text-yellow-600 dark:bg-yellow-900/10 dark:text-yellow-400">
          *以上健身/减肥建议仅供参考，具体方案请咨询专业人士。
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-1.5 pt-1">
        {isActive && (
          <button
            type="button"
            onClick={onPause}
            className="flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-1 text-[10px] text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-600"
            title="暂停计划"
          >
            <Pause className="h-2.5 w-2.5" /> 暂停
          </button>
        )}
        {goal.status === "paused" && (
          <button
            type="button"
            onClick={onResume}
            className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[10px] text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
            title="恢复计划"
          >
            <Play className="h-2.5 w-2.5" /> 恢复
          </button>
        )}
        {goal.status !== "completed" && (
          <button
            type="button"
            onClick={onComplete}
            className="flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-[10px] text-green-600 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
            title="结束目标"
          >
            <CheckCircle className="h-2.5 w-2.5" /> 完成
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-[10px] text-red-500 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
          title="移除目标及关联任务"
        >
          <Trash2 className="h-2.5 w-2.5" /> 移除
        </button>
      </div>
    </div>
  );
}
