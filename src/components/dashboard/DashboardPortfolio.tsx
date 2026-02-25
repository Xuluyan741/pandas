"use client";

/**
 * 项目集大盘：创业/工作/生活 分类展示
 * 色卡：橙黄系与紫色背景和谐
 *   今日到期=活力橙 逾期=肉桂橘 创业组=明黄 工作组=肉桂橘 生活组=荧光紫(保留)
 */
import type { Project, Task } from "@/types";
import {
  getGroupProgress,
  getOverallProgress,
  getProjectProgress,
  isDueToday,
  isOverdue,
} from "@/lib/progress";

// 色卡：橙黄系 + 紫色系（整体和谐）
const TODAY_DUE_COLOR = "#FF8C00";   // 活力橙 - 今日到期
const OVERDUE_COLOR = "#CC704B";     // 肉桂橘 - 逾期
const STARTUP_COLOR = "#FFD700";     // 明黄 - 创业组
const WORK_COLOR = "#CC704B";        // 肉桂橘 - 工作组
const APRICOT_LIGHT = "#FFDAA8";     // 杏色 - 浅色过渡/边框
// 紫色系：总进度 + 生活组
const DEEP_PURPLE = "#3A0251";       // 深紫色 - 总进度条、深色块
const LAVENDER = "#E6E6FA";          // 薰衣草紫 - 总进度/生活组卡片底
const BRIGHT_MAGENTA = "#8B40B7";    // 明亮紫 - 生活组圆点/边框/进度条

const GROUPS = ["创业", "工作", "生活"] as const;

const GROUP_STYLE: Record<string, { color: string; bgColor: string }> = {
  创业: { color: STARTUP_COLOR, bgColor: "#FFFDE7" },
  工作: { color: WORK_COLOR, bgColor: "#FAF0EB" },
  生活: { color: BRIGHT_MAGENTA, bgColor: LAVENDER },
};

interface DashboardPortfolioProps {
  projects: Project[];
  tasks: Task[];
  onRemoveProject?: (id: string) => void;
}

export function DashboardPortfolio({ projects, tasks, onRemoveProject }: DashboardPortfolioProps) {
  const overall = getOverallProgress(tasks);
  const todayDue = tasks.filter((t) => t.status !== "Done" && isDueToday(t));
  const overdue = tasks.filter((t) => isOverdue(t));

  return (
    <div className="space-y-6">
      {/* 统计卡片行 - 大框包裹（白底、灰边、阴影） */}
      <div
        className="rounded-2xl p-4"
        style={{
          backgroundColor: "#ffffff",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {/* 总进度 - 薰衣草紫底 + 深紫色进度条 */}
          <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: LAVENDER }}>
            <div className="mb-2 text-xs text-gray-400">总进度</div>
            <div
              className="mb-4 text-3xl"
              style={{ fontWeight: 700, color: DEEP_PURPLE }}
            >
              {overall}%
            </div>
            <div className="w-full rounded-full bg-gray-100" style={{ height: 4 }}>
              <div
                className="rounded-full transition-all duration-300"
                style={{
                  width: `${Math.max(0, Math.min(100, overall))}%`,
                  minWidth: overall > 0 ? 4 : 0,
                  height: 4,
                  backgroundColor: DEEP_PURPLE,
                }}
              />
            </div>
          </div>

          {/* 今日到期 - 活力橙 */}
          <div
            className="rounded-xl p-5 shadow-sm"
            style={{ backgroundColor: "#FFF8ED" }}
          >
            <div className="mb-2 text-xs" style={{ color: TODAY_DUE_COLOR, fontWeight: 600 }}>
              今日到期
            </div>
            <div
              className="mb-3 text-3xl"
              style={{ fontWeight: 700, color: TODAY_DUE_COLOR }}
            >
              {todayDue.length}
            </div>
            {todayDue.length > 0 && (
              <div className="space-y-1">
                {todayDue.slice(0, 3).map((t) => (
                  <div key={t.id} className="text-sm truncate" style={{ color: TODAY_DUE_COLOR }}>
                    · {t.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 逾期 - 肉桂橘 */}
          <div
            className="rounded-xl p-5 shadow-sm"
            style={{ backgroundColor: "#FAEDE8" }}
          >
            <div className="text-xs mb-2" style={{ color: OVERDUE_COLOR, fontWeight: 600 }}>
              逾期
            </div>
            <div className="text-3xl" style={{ fontWeight: 700, color: OVERDUE_COLOR }}>
              {overdue.length}
            </div>
            {overdue.length > 0 && (
              <div className="mt-2 space-y-1">
                {overdue.slice(0, 3).map((t) => (
                  <div key={t.id} className="text-sm truncate" style={{ color: OVERDUE_COLOR }}>
                    · {t.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 三个任务组 */}
      <div className="grid gap-4 sm:grid-cols-3">
        {GROUPS.map((group) => {
          const { color, bgColor } = GROUP_STYLE[group];
          const groupProjects = projects.filter((p) => p.group === group);
          const groupProgress = getGroupProgress(group, projects, tasks);
          const groupOverdue = tasks
            .filter((t) => groupProjects.some((p) => p.id === t.projectId))
            .filter((t) => isOverdue(t));

          return (
            <div
              key={group}
              className="rounded-xl shadow-sm overflow-hidden"
              style={{ borderLeft: `4px solid ${color}`, backgroundColor: bgColor }}
            >
              <div className="p-4">
                {/* 标题行 */}
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-sm" style={{ fontWeight: 600 }}>
                    {group}组
                  </span>
                  <span className="ml-auto text-xs text-gray-400">
                    {groupProjects.length} 个项目
                  </span>
                </div>

                {/* 组进度 */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">组进度</span>
                  <span className="text-xs text-gray-500">{groupProgress}%</span>
                </div>
                <div className="w-full rounded-full mb-4 bg-gray-100" style={{ height: 4 }}>
                  <div
                    className="rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.max(0, Math.min(100, groupProgress))}%`,
                      minWidth: groupProgress > 0 ? 4 : 0,
                      height: 4,
                      backgroundColor: color,
                    }}
                  />
                </div>

                {/* 任务列表 */}
                {groupProjects.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">暂无项目，请在下方添加</p>
                ) : (
                  <div className="space-y-2">
                    {groupProjects.map((proj) => {
                      const pProgress = getProjectProgress(proj.id, tasks);
                      const pTasks = tasks.filter((t) => t.projectId === proj.id);
                      const pDone = pTasks.filter((t) => t.status === "Done").length;
                      return (
                        <div key={proj.id}>
                          <div className="flex items-center justify-between py-1.5">
                            <span className="text-sm text-gray-700 truncate">{proj.name}</span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-xs text-gray-400">
                                {pDone}/{pTasks.length}
                              </span>
                              {onRemoveProject ? (
                                <button
                                  type="button"
                                  title="删除项目"
                                  className="text-gray-300 hover:text-red-500 text-xs"
                                  onClick={() => onRemoveProject(proj.id)}
                                >
                                  ×
                                </button>
                              ) : (
                                <span className="text-gray-300 text-xs">×</span>
                              )}
                            </div>
                          </div>
                          <div className="w-full rounded-full bg-gray-100" style={{ height: 3 }}>
                            <div
                              className="rounded-full transition-all duration-300"
                              style={{
                                width: `${Math.max(0, Math.min(100, pProgress))}%`,
                                minWidth: pProgress > 0 ? 3 : 0,
                                height: 3,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {groupOverdue.length > 0 && (
                  <p className="mt-2 text-xs font-medium" style={{ color: OVERDUE_COLOR }}>
                    ⚠ 逾期 {groupOverdue.length} 项
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
