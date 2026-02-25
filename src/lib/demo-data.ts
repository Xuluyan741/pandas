/**
 * 演示数据：未登录时自动填充，让用户预览完整 UI
 */
import type { Project, Task } from "@/types";

const d = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

export const DEMO_PROJECTS: Project[] = [
  { id: "dp1", name: "AI 创业项目", group: "创业", createdAt: d(-10), updatedAt: d(-1) },
  { id: "dp2", name: "副业 SaaS", group: "创业", createdAt: d(-8), updatedAt: d(-2) },
  { id: "dp3", name: "大厂工作", group: "工作", createdAt: d(-7), updatedAt: d(0) },
  { id: "dp4", name: "日常生活", group: "生活", createdAt: d(-5), updatedAt: d(0) },
];

export const DEMO_TASKS: Task[] = [
  {
    id: "dt1", projectId: "dp1", name: "完成 MVP 原型",
    startDate: d(-5), duration: 7, dependencies: [], status: "Doing", priority: "高", progress: 60,
    createdAt: d(-5), updatedAt: d(-1),
  },
  {
    id: "dt2", projectId: "dp1", name: "撰写商业计划书",
    startDate: d(0), duration: 3, dependencies: ["dt1"], status: "To Do", priority: "高", progress: 0,
    createdAt: d(-5), updatedAt: d(-1),
  },
  {
    id: "dt3", projectId: "dp2", name: "用户调研访谈",
    startDate: d(-3), duration: 4, dependencies: [], status: "Doing", priority: "中", progress: 40,
    createdAt: d(-8), updatedAt: d(-1),
  },
  {
    id: "dt4", projectId: "dp3", name: "更新简历",
    startDate: d(-2), duration: 2, dependencies: [], status: "Done", priority: "高", progress: 100,
    createdAt: d(-7), updatedAt: d(0),
  },
  {
    id: "dt5", projectId: "dp3", name: "每日投递 10 家",
    startDate: d(0), duration: 14, dependencies: [], status: "Doing", priority: "高", isRecurring: true, progress: 30,
    createdAt: d(-5), updatedAt: d(0),
  },
  {
    id: "dt6", projectId: "dp3", name: "准备面试题库",
    startDate: d(-6), duration: 2, dependencies: [], status: "Done", priority: "中", progress: 100,
    createdAt: d(-7), updatedAt: d(-4),
  },
  {
    id: "dt7", projectId: "dp4", name: "交房租",
    startDate: d(-1), duration: 1, dependencies: [], status: "To Do", priority: "高", progress: 0,
    createdAt: d(-5), updatedAt: d(-1),
  },
  {
    id: "dt8", projectId: "dp4", name: "预约体检",
    startDate: d(1), duration: 1, dependencies: [], status: "To Do", priority: "低", progress: 0,
    createdAt: d(-3), updatedAt: d(-3),
  },
];
