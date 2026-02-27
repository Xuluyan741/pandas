"use client";

/**
 * 工作台悬浮球 + 侧滑面板
 * 收纳所有管理功能：大盘、项目表单、WBS 录入、任务列表、甘特图
 * 平时只显示一个小悬浮球，点击后从右侧滑出完整面板
 */
import { useState } from "react";
import { X, LayoutGrid, Plus, ListTodo, BarChart3, FolderPlus, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardPortfolio, AIBreakthrough } from "@/components/dashboard";
import { GoalManager } from "@/components/dashboard/GoalManager";
import { ProjectForm, WBSInput, TaskForm, TaskList } from "@/components/wbs";
import { GanttView } from "@/components/gantt";
import { CalendarView } from "@/components/calendar";
import { GradientButton } from "@/components/ui/gradient-button";
import type { Project, Task } from "@/types";

type TabId = "dashboard" | "tasks" | "calendar" | "gantt" | "add";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "大盘", icon: <LayoutGrid className="h-4 w-4" /> },
  { id: "tasks", label: "任务", icon: <ListTodo className="h-4 w-4" /> },
  { id: "calendar", label: "日历", icon: <BarChart3 className="h-4 w-4" /> },
  { id: "gantt", label: "甘特图", icon: <BarChart3 className="h-4 w-4" /> },
  { id: "add", label: "添加", icon: <FolderPlus className="h-4 w-4" /> },
];

interface WorkspacePanelProps {
  projects: Project[];
  tasks: Task[];
  onRemoveProject: (id: string) => void;
  onAddProject: (p: { name: string; group: "创业" | "工作" | "生活" }) => void;
  onAddTask: (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onRemoveTask: (id: string) => void;
  onWBSImport: (
    items: { projectId: string; taskName: string; duration: number; priority: "高" | "中" | "低"; isRecurring?: boolean }[]
  ) => void;
}

export function WorkspacePanel({
  projects,
  tasks,
  onRemoveProject,
  onAddProject,
  onAddTask,
  onUpdateTask,
  onRemoveTask,
  onWBSImport,
}: WorkspacePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<"all" | "To Do" | "Doing" | "Done">("all");

  const activeTasks = tasks.filter((t) => t.status !== "Done").length;
  const overdueTasks = tasks.filter((t) => {
    if (t.status === "Done") return false;
    const end = new Date(t.startDate);
    end.setDate(end.getDate() + (t.duration || 1));
    return end < new Date(new Date().toISOString().slice(0, 10));
  }).length;

  return (
    <>
      {/* 悬浮球 */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 active:scale-95",
          "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900",
          isOpen && "pointer-events-none opacity-0",
        )}
        title="打开工作台"
      >
        <LayoutGrid className="h-5 w-5" />
        {(activeTasks > 0 || overdueTasks > 0) && (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold",
              overdueTasks > 0
                ? "bg-red-500 text-white"
                : "bg-orange-400 text-white",
            )}
          >
            {overdueTasks > 0 ? overdueTasks : activeTasks}
          </span>
        )}
      </button>

      {/* 遮罩 */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* 侧滑面板 */}
      <div
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl transition-transform duration-300 ease-out dark:bg-neutral-900",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* 面板头部 */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">工作台</h2>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-neutral-100 px-2 dark:border-neutral-800">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors",
                activeTab === tab.id
                  ? "border-b-2 border-neutral-900 text-neutral-900 dark:border-white dark:text-white"
                  : "text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300",
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 内容 */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              <DashboardPortfolio projects={projects} tasks={tasks} onRemoveProject={onRemoveProject} />
              <GoalManager />
              <AIBreakthrough tasks={tasks} projects={projects} />
            </div>
          )}

          {activeTab === "tasks" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  任务列表
                </span>
                <select
                  className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                >
                  <option value="all">全部</option>
                  <option value="To Do">To Do</option>
                  <option value="Doing">Doing</option>
                  <option value="Done">Done</option>
                </select>
              </div>
              <TaskList
                tasks={tasks}
                projects={projects}
                onEdit={(t) => {
                  setEditingTask(t);
                  setShowTaskForm(true);
                  setActiveTab("add");
                }}
                onStatusChange={(id, s) => onUpdateTask(id, { status: s })}
                onDelete={(id) => onRemoveTask(id)}
                statusFilter={statusFilter}
              />
            </div>
          )}

          {activeTab === "calendar" && (
            <CalendarView tasks={tasks} projects={projects} />
          )}

          {activeTab === "gantt" && (
            <GanttView tasks={tasks} projects={projects} />
          )}

          {activeTab === "add" && (
            <div className="space-y-4">
              <ProjectForm onSubmit={({ name, group }) => onAddProject({ name, group })} />
              <WBSInput projects={projects} onImport={onWBSImport} />

              {showTaskForm ? (
                <TaskForm
                  projects={projects}
                  initial={editingTask}
                  onSubmit={(task) => {
                    if (editingTask) {
                      onUpdateTask(editingTask.id, task);
                      setEditingTask(undefined);
                    } else {
                      onAddTask(task);
                    }
                    setShowTaskForm(false);
                  }}
                  onCancel={() => {
                    setShowTaskForm(false);
                    setEditingTask(undefined);
                  }}
                />
              ) : (
                <GradientButton
                  variant="variant"
                  onClick={() => setShowTaskForm(true)}
                  disabled={projects.length === 0}
                  className="flex w-full items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  添加单条任务
                </GradientButton>
              )}
              {projects.length === 0 && (
                <p className="text-center text-xs text-neutral-400">请先在上方添加一个项目</p>
              )}
            </div>
          )}
        </div>

        {/* 快捷操作栏 */}
        <div className="border-t border-neutral-100 px-4 py-3 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => {
              setActiveTab("add");
              setShowTaskForm(true);
            }}
            disabled={projects.length === 0}
            className="flex w-full items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-40 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
          >
            <span className="flex items-center gap-2">
              <Plus className="h-3.5 w-3.5" />
              快速添加任务
            </span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}
