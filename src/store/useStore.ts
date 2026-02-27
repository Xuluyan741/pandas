/**
 * 全局 Zustand Store — 服务器优先模式
 * - 乐观更新：本地状态立即更新，后台异步写入数据库 API
 * - loadFromServer：登录后从 /api/projects + /api/tasks 加载用户数据
 * - 移除了 localStorage persist（数据持久化改由服务器 SQLite 负责）
 * - goals: 长期目标管理（PRD Phase 6）
 */
import { create } from "zustand";
import type { Project, Task, LongTermGoal } from "@/types";

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
const now = () => new Date().toISOString();

/** 静默调用 API（乐观更新，失败仅打印不回滚；演示模式下直接跳过） */
async function apiCall(url: string, options: RequestInit) {
  if (useStore.getState().demoMode) return;
  try {
    const res = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    if (!res.ok) console.error(`[api] ${options.method} ${url}`, await res.text());
  } catch (err) {
    console.error(`[api] ${options.method} ${url}`, err);
  }
}

interface ProjectTaskStore {
  projects: Project[];
  tasks: Task[];
  goals: LongTermGoal[];
  isLoading: boolean;
  demoMode: boolean;

  loadFromServer: () => Promise<void>;

  addProject:    (project: Omit<Project, "id" | "createdAt" | "updatedAt">) => void;
  updateProject: (id: string, patch: Partial<Project>) => void;
  removeProject: (id: string) => void;

  addTask:    (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  removeTask: (id: string) => void;

  /** 添加长期目标 */
  addGoal: (goal: Omit<LongTermGoal, "id" | "createdAt">) => void;
  /** 更新长期目标（暂停、恢复、完成） */
  updateGoal: (id: string, patch: Partial<LongTermGoal>) => void;
  /** 移除长期目标（同时移除关联子任务） */
  removeGoal: (id: string) => void;

  setProjects: (projects: Project[]) => void;
  setTasks:    (tasks: Task[]) => void;
}

export const useStore = create<ProjectTaskStore>()((set, get) => ({
  projects: [],
  tasks:    [],
  goals:    [],
  isLoading: false,
  demoMode: false,

  loadFromServer: async () => {
    set({ isLoading: true });
    try {
      const [pRes, tRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/tasks"),
      ]);
      if (pRes.ok && tRes.ok) {
        const [projects, tasksRaw] = await Promise.all([pRes.json(), tRes.json()]);
        const tasks = (tasksRaw as Task[]).map((t) => {
          const p = t.status === "Done" ? 100 : (Number(t.progress) ?? 0);
          return { ...t, progress: Math.min(100, Math.max(0, p)) };
        });
        set({ projects, tasks });
      }
    } catch (err) {
      console.error("[store] loadFromServer failed", err);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── 项目 ──────────────────────────────────────────
  addProject: (project) => {
    const p: Project = { ...project, id: genId(), createdAt: now(), updatedAt: now() };
    set((s) => ({ projects: [...s.projects, p] }));
    apiCall("/api/projects", { method: "POST", body: JSON.stringify(p) });
  },

  updateProject: (id, patch) => {
    const updated = get().projects.map((p) =>
      p.id === id ? { ...p, ...patch, updatedAt: now() } : p
    );
    set({ projects: updated });
    const p = updated.find((x) => x.id === id);
    if (p) apiCall("/api/projects", { method: "POST", body: JSON.stringify(p) });
  },

  removeProject: (id) => {
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      tasks:    s.tasks.filter((t) => t.projectId !== id),
    }));
    apiCall(`/api/projects/${id}`, { method: "DELETE" });
  },

  // ── 任务 ──────────────────────────────────────────
  addTask: (task) => {
    const rawProgress = task.progress ?? (task.status === "Done" ? 100 : 0);
    const t: Task = {
      ...task,
      id: genId(),
      createdAt: now(),
      updatedAt: now(),
      progress: Math.min(100, Math.max(0, Number(rawProgress))),
    };
    set((s) => ({ tasks: [...s.tasks, t] }));
    apiCall("/api/tasks", { method: "POST", body: JSON.stringify(t) });
  },

  updateTask: (id, patch) => {
    const updated = get().tasks.map((t) => {
      if (t.id !== id) return t;
      const merged = { ...t, ...patch, updatedAt: now() };
      if (patch.progress !== undefined) {
        merged.progress = Math.min(100, Math.max(0, Number(patch.progress)));
      }
      return merged;
    });
    set({ tasks: updated });
    const t = updated.find((x) => x.id === id);
    if (t) apiCall("/api/tasks", { method: "POST", body: JSON.stringify(t) });
  },

  removeTask: (id) => {
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
    apiCall(`/api/tasks/${id}`, { method: "DELETE" });
  },

  // ── 长期目标 ──────────────────────────────────────
  addGoal: (goal) => {
    const g: LongTermGoal = { ...goal, id: genId(), createdAt: now() };
    set((s) => ({ goals: [...s.goals, g] }));
  },

  updateGoal: (id, patch) => {
    set((s) => ({
      goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));
  },

  removeGoal: (id) => {
    set((s) => ({
      goals: s.goals.filter((g) => g.id !== id),
      tasks: s.tasks.filter((t) => t.parentGoalId !== id),
    }));
  },

  setProjects: (projects) => set({ projects }),
  setTasks:    (tasks)    => set({ tasks }),
}));
