"use client";

/**
 * 主页面：登录后可见，自动从服务器加载用户数据
 * 布局：用户头部导航 → 英雄渐变 → 大盘 → AI建议 → WBS录入 → 任务列表 → 甘特图
 */
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useStore } from "@/store/useStore";
import { DashboardPortfolio, AIBreakthrough } from "@/components/dashboard";
import { ProjectForm, WBSInput, TaskForm, TaskList } from "@/components/wbs";
import { GanttView } from "@/components/gantt";
import { BackgroundGradientAnimation } from "@/components/ui/background-gradient-animation";
import { GradientButton } from "@/components/ui/gradient-button";
import type { Task } from "@/types";
import { LayoutDashboard, ListTodo, BarChart3, Plus, LogOut, Target, Loader2, FlaskConical } from "lucide-react";
import Image from "next/image";
import { DEMO_PROJECTS, DEMO_TASKS } from "@/lib/demo-data";

const TODAY = new Date().toISOString().slice(0, 10);

export default function Home() {
  const { data: session, status } = useSession();
  const { projects, tasks, isLoading, loadFromServer, addProject, addTask, updateTask, removeProject } =
    useStore();

  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask]   = useState<Task | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<"all" | "To Do" | "Doing" | "Done">("all");

  const isDemo = status === "unauthenticated";

  /** 登录后拉服务器数据；未登录时加载演示数据 */
  useEffect(() => {
    if (status === "authenticated") {
      loadFromServer();
    } else if (status === "unauthenticated") {
      // demoMode = true → 所有 mutation 跳过 API 调用，避免 401 错误
      useStore.setState({ projects: DEMO_PROJECTS, tasks: DEMO_TASKS, demoMode: true });
    }
  }, [status]);

  const handleWBSImport = (
    items: { projectId: string; taskName: string; duration: number; priority: "高" | "中" | "低"; isRecurring?: boolean }[]
  ) => {
    items.forEach((item) =>
      addTask({
        name: item.taskName,
        projectId: item.projectId,
        startDate: TODAY,
        duration: item.duration,
        dependencies: [],
        status: "To Do",
        priority: item.priority,
        isRecurring: item.isRecurring,
      })
    );
  };

  const handleTaskSubmit = (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => {
    if (editingTask) {
      updateTask(editingTask.id, task);
      setEditingTask(undefined);
    } else {
      addTask(task);
    }
    setShowTaskForm(false);
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">

      {/* ── 演示模式横幅 ── */}
      {isDemo && (
        <div className="flex items-center justify-center gap-3 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          <FlaskConical className="h-4 w-4 shrink-0" />
          <span>当前为<strong>演示模式</strong>，数据仅供预览，不会保存。</span>
          <a
            href="/login"
            className="ml-1 rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600"
          >
            注册 / 登录 →
          </a>
        </div>
      )}

      {/* ── 顶部导航：用户信息 + 退出 ── */}
      <nav className="sticky top-0 z-50 border-b border-neutral-200/80 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg app-logo-icon"
              style={{
                background: "linear-gradient(to bottom right, var(--brand-orange), var(--brand-orange-dark))",
              }}
            >
              <Target className="h-4 w-4 text-white" />
            </div>
            <span className="hidden text-sm font-semibold text-neutral-800 dark:text-neutral-200 sm:inline">
              超级项目管理 Agent
            </span>
          </div>
          {isDemo ? (
            <a
              href="/login"
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
            >
              注册 / 登录
            </a>
          ) : session?.user && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {session.user.image ? (
                  <Image
                    src={session.user.image}
                    alt={session.user.name ?? "用户"}
                    width={28}
                    height={28}
                    className="rounded-full"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                    {(session.user.name ?? session.user.email ?? "U")[0].toUpperCase()}
                  </div>
                )}
                <span className="hidden text-sm text-neutral-600 dark:text-neutral-400 sm:inline">
                  {session.user.name ?? session.user.email}
                </span>
              </div>
              <button
                type="button"
                title="退出登录"
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">退出</span>
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* ── 英雄头部 ── */}
      <BackgroundGradientAnimation
        gradientBackgroundStart="rgb(20, 5, 50)"
        gradientBackgroundEnd="rgb(5, 15, 60)"
        firstColor="80, 40, 200"
        secondColor="160, 30, 180"
        thirdColor="20, 80, 220"
        fourthColor="60, 10, 100"
        fifthColor="10, 50, 140"
        pointerColor="120, 60, 240"
        containerClassName="w-full"
        className="flex flex-col items-center justify-center gap-4 px-4 py-12 text-center"
        interactive
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm">
          <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${isDemo ? "bg-amber-400" : "bg-green-400"}`} />
          {isLoading
            ? "数据加载中…"
            : isDemo
            ? "演示模式 · 注册后数据永久保存"
            : `欢迎回来，${session?.user?.name ?? "朋友"}`}
        </div>
        <h1 className="max-w-2xl text-3xl font-bold sm:text-4xl lg:text-5xl">
          <span className="bg-gradient-to-r from-white via-purple-200 to-cyan-200 bg-clip-text text-transparent">
            多线程任务
          </span>
          <br />
          <span className="text-white/90">一站式掌控</span>
        </h1>
        <p className="max-w-md text-sm text-white/60">
          创业 · 工作 · 生活，三组并行，甘特图追踪，AI 智能提示今日破局点。
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          {[
            { label: "个项目", value: projects.length },
            { label: "项进行中", value: tasks.filter((t) => t.status !== "Done").length },
            { label: "项已完成", value: tasks.filter((t) => t.status === "Done").length },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-center backdrop-blur-sm">
              <p className="text-xl font-bold text-white">{isLoading ? "…" : value}</p>
              <p className="text-xs text-white/60">{label}</p>
            </div>
          ))}
        </div>
      </BackgroundGradientAnimation>

      {/* ── 主内容 ── */}
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">

        {isLoading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
          </div>
        ) : (
          <>
            <section id="dashboard">
              <SectionHeader icon={<LayoutDashboard className="h-4 w-4" />} title="项目集大盘" />
              <DashboardPortfolio projects={projects} tasks={tasks} onRemoveProject={removeProject} />
            </section>

            <section>
              <AIBreakthrough tasks={tasks} projects={projects} />
            </section>

            <section className="space-y-4">
              <SectionHeader icon={<ListTodo className="h-4 w-4" />} title="WBS 任务拆解与录入" />
              <ProjectForm onSubmit={({ name, group }) => addProject({ name, group })} />
              <WBSInput projects={projects} onImport={handleWBSImport} />
              {showTaskForm ? (
                <TaskForm
                  projects={projects}
                  initial={editingTask}
                  onSubmit={handleTaskSubmit}
                  onCancel={() => { setShowTaskForm(false); setEditingTask(undefined); }}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <GradientButton
                    variant="variant"
                    onClick={() => setShowTaskForm(true)}
                    disabled={projects.length === 0}
                    className="flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    添加单条任务
                  </GradientButton>
                  {projects.length === 0 && (
                    <span className="text-sm text-neutral-400">请先添加项目</span>
                  )}
                </div>
              )}
            </section>

            <section id="tasks">
              <div className="mb-3 flex items-center justify-between">
                <SectionHeader icon={<ListTodo className="h-4 w-4" />} title="任务列表" />
                <select
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-100 dark:border-neutral-700 dark:bg-neutral-800"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as "all" | "To Do" | "Doing" | "Done")}
                >
                  <option value="all">全部状态</option>
                  <option value="To Do">To Do</option>
                  <option value="Doing">Doing</option>
                  <option value="Done">Done</option>
                </select>
              </div>
              <TaskList
                tasks={tasks}
                projects={projects}
                onEdit={(t) => { setEditingTask(t); setShowTaskForm(true); }}
                onStatusChange={(id, s) => updateTask(id, { status: s })}
                statusFilter={statusFilter}
              />
            </section>

            <section>
              <SectionHeader icon={<BarChart3 className="h-4 w-4" />} title="甘特图视图" />
              <GanttView tasks={tasks} projects={projects} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span
        className="flex h-7 w-7 items-center justify-center rounded-lg app-logo-icon text-white"
        style={{
          background: "linear-gradient(to bottom right, var(--brand-orange), var(--brand-orange-dark))",
        }}
      >
        {icon}
      </span>
      <h2 className="text-base font-semibold text-[#3B3B3B] dark:text-neutral-200">
        {title}
      </h2>
    </div>
  );
}
