"use client";

/**
 * 甘特图视图：按项目组着色（创业=黄，工作=橙，生活=紫），支持依赖连线
 */
import { useEffect, useRef, useMemo, useState } from "react";
import type { Task, Project } from "@/types";
import { getTaskEndDate } from "@/lib/progress";
// @ts-ignore - frappe-gantt has no type declarations
import Gantt from "frappe-gantt";

interface GanttViewProps {
  tasks: Task[];
  projects: Project[];
}

interface GanttTaskRow {
  id: string;
  name: string;
  start: string;
  end: string;
  progress: number;
  dependencies?: string;
  custom_class?: string;
}

const GROUP_CLASS: Record<string, string> = {
  创业: "gantt-bar-venture",
  工作: "gantt-bar-job",
  生活: "gantt-bar-life",
};

function toGanttTasks(tasks: Task[], projectMap: Map<string, Project>): GanttTaskRow[] {
  return tasks.map((t) => {
    const project = projectMap.get(t.projectId);
    const custom_class = project ? (GROUP_CLASS[project.group] ?? "") : "";
    return {
      id: t.id,
      name: t.name,
      start: t.startDate,
      end: getTaskEndDate(t),
      progress: t.status === "Done" ? 100 : (t.progress ?? 0),
      dependencies: t.dependencies.length > 0 ? t.dependencies.join(", ") : undefined,
      custom_class,
    };
  });
}

export function GanttView({ tasks, projects }: GanttViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const ganttTasks = useMemo(() => toGanttTasks(tasks, projectMap), [tasks, projectMap]);

  useEffect(() => {
    if (!containerRef.current || ganttTasks.length === 0) return;

    try {
      containerRef.current.innerHTML = "";
      ganttRef.current = new Gantt(containerRef.current, ganttTasks, {
        view_mode: "Week",
        bar_height: 28,
        bar_corner_radius: 4,
        date_format: "YYYY-MM-DD",
        popup_trigger: "click",
        readonly: true,
      });
      setError(null);
    } catch (err) {
      console.error("Failed to initialize Gantt:", err);
      setError("甘特图渲染失败，请刷新重试");
    }
  }, [ganttTasks]);

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-900">
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/frappe-gantt.css" />
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-neutral-600 dark:text-neutral-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded" style={{ background: "#FFD700" }} />
          创业
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded" style={{ background: "#CC704B" }} />
          工作
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded" style={{ background: "#8B40B7" }} />
          生活
        </span>
      </div>

      {error ? (
        <div className="flex min-h-[160px] items-center justify-center text-red-500">
          {error}
        </div>
      ) : ganttTasks.length === 0 ? (
        <div className="flex min-h-[160px] items-center justify-center text-neutral-500">
          暂无任务，请先添加任务以显示甘特图
        </div>
      ) : (
        <div ref={containerRef} className="gantt-container" />
      )}

      <style>{`
        .gantt .bar-wrapper.gantt-bar-venture .bar { fill: #FFD700 !important; }
        .gantt .bar-wrapper.gantt-bar-job     .bar { fill: #CC704B !important; }
        .gantt .bar-wrapper.gantt-bar-life    .bar { fill: #8B40B7 !important; }
        .gantt .bar-label { fill: #fff !important; font-size: 12px; }
        .gantt-container .grid-header { fill: #888; }
        .gantt-container .grid-row { fill: transparent; }
        .dark .gantt-container .grid-row { stroke: #333; }
        .dark .gantt-container .grid-header { fill: #aaa; }
      `}</style>
    </div>
  );
}
