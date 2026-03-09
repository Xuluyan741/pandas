"use client";

/**
 * 主页面：以 AI 对话为核心，极简无干扰
 * 品牌：小熊猫（Red Panda）
 */
import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useStore } from "@/store/useStore";
import { PandaChat, WorkspacePanel } from "@/components/chat";
import { Loader2, FlaskConical } from "lucide-react";
import { DEMO_PROJECTS, DEMO_TASKS } from "@/lib/demo-data";

const TODAY = new Date().toISOString().slice(0, 10);

export default function Home() {
  const { status } = useSession();
  const {
    projects,
    tasks,
    goals,
    isLoading,
    loadFromServer,
    addProject,
    addTask,
    updateTask,
    removeProject,
    removeTask,
  } = useStore();

  const isDemo = status === "unauthenticated";

  useEffect(() => {
    if (status === "authenticated") {
      loadFromServer();
    } else if (status === "unauthenticated") {
      useStore.setState({ projects: DEMO_PROJECTS, tasks: DEMO_TASKS, demoMode: true });
    }
  }, [status, loadFromServer]);

  /** 主页右上角「刷新」图标触发重新拉取数据 */
  useEffect(() => {
    const refresh = () => {
      if (status === "authenticated") loadFromServer();
    };
    window.addEventListener("refresh-data", refresh);
    return () => window.removeEventListener("refresh-data", refresh);
  }, [status, loadFromServer]);

  /** WBS 批量导入处理 */
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

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-neutral-950">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <>
      <div className="flex h-screen flex-col bg-white dark:bg-neutral-950">

        {/* ── 演示模式横幅 ── */}
        {isDemo && (
          <div className="flex items-center justify-center gap-3 bg-orange-50 px-4 py-2 text-xs text-orange-600 dark:bg-orange-950/30 dark:text-orange-400">
            <FlaskConical className="h-3.5 w-3.5 shrink-0" />
            <span>演示模式 · 数据仅供预览</span>
            <a
              href="/login"
              className="ml-1 rounded-md bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              登录
            </a>
          </div>
        )}

        {/* ── 主内容：AI 对话区（占满剩余空间） ── */}
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-300" />
          </div>
        ) : (
          <main className="flex flex-1 min-h-0">
            <PandaChat
              variant="loaderFirst"
              projects={projects}
              tasks={tasks}
              addTask={(task) => addTask(task)}
              addProject={(p) => addProject(p)}
              updateTask={updateTask}
            />
          </main>
        )}
      </div>

      {/* ── 悬浮球工作台（独立于 flex 容器，确保 fixed 定位不被裁切） ── */}
      <WorkspacePanel
        projects={projects}
        tasks={tasks}
        goals={goals}
        hideFloatingButton={true}
        onRemoveProject={removeProject}
        onAddProject={addProject}
        onAddTask={(task) => addTask(task as Parameters<typeof addTask>[0])}
        onUpdateTask={updateTask}
        onRemoveTask={removeTask}
        onWBSImport={handleWBSImport}
      />
    </>
  );
}
