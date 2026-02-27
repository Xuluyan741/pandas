"use client";

/**
 * 单条任务新增/编辑表单：名称、项目、开始日期、工期、依赖、状态、优先级、是否循环
 */
import { useState } from "react";
import type { Task, TaskStatus, TaskPriority, Project } from "@/types";
import { cn } from "@/lib/utils";

interface TaskFormProps {
  projects: Project[];
  /** 编辑时传入，新增时不传 */
  initial?: Task;
  onSubmit: (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => void;
  onCancel?: () => void;
}

const STATUS_OPTIONS: TaskStatus[] = ["To Do", "Doing", "Done"];
const PRIORITY_OPTIONS: TaskPriority[] = ["高", "中", "低"];

function toDateInputValue(isoOrYYYYMMDD: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrYYYYMMDD)) return isoOrYYYYMMDD;
  const d = new Date(isoOrYYYYMMDD);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function TaskForm({ projects, initial, onSubmit, onCancel }: TaskFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [projectId, setProjectId] = useState(initial?.projectId ?? projects[0]?.id ?? "");
  const [startDate, setStartDate] = useState(
    initial ? toDateInputValue(initial.startDate) : new Date().toISOString().slice(0, 10)
  );
  const [startTime, setStartTime] = useState(initial?.startTime ?? "");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "");
  const [duration, setDuration] = useState(initial?.duration ?? 1);
  const [dependencies, setDependencies] = useState(initial?.dependencies?.join(", ") ?? "");
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? "To Do");
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? "中");
  const [isRecurring, setIsRecurring] = useState(initial?.isRecurring ?? false);
  const [progress, setProgress] = useState(initial?.progress ?? 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const depIds = dependencies
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    onSubmit({
      name,
      projectId,
      startDate,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      duration: Math.max(1, duration),
      dependencies: depIds,
      status,
      priority,
      isRecurring,
      progress: status === "Done" ? 100 : progress,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          任务名称
          <input
            className={cn(
              "rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
            )}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="例如：优化简历"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          所属项目
          <select
            className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.group})
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          开始日期
          <input
            type="date"
            className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          开始时间
          <input
            type="time"
            className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          结束时间（可选）
          <input
            type="time"
            className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          预计工期(天)
          <input
            type="number"
            min={1}
            className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value) || 1)}
          />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          状态
          <select
            className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          依赖任务 ID（多个用逗号分隔）
          <input
            className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
            value={dependencies}
            onChange={(e) => setDependencies(e.target.value)}
            placeholder="task-id-1, task-id-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          优先级
          <select
            className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
          />
          循环任务
        </label>
        {status !== "Done" && (
          <label className="flex items-center gap-2 text-sm">
            进度 %
            <input
              type="number"
              min={0}
              max={100}
              className="w-16 rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800"
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value) || 0)}
            />
          </label>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {initial ? "保存" : "添加任务"}
        </button>
        {onCancel && (
          <button
            type="button"
            className="rounded border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
            onClick={onCancel}
          >
            取消
          </button>
        )}
      </div>
    </form>
  );
}
