"use client";

import { useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, endOfWeek, getDay } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import "react-big-calendar/lib/css/react-big-calendar.css";
import type { Task, Project } from "@/types";

const locales = {
  "zh-CN": zhCN,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }), // 周一作为第一天
  getDay,
  locales,
});

interface CalendarViewProps {
  tasks: Task[];
  projects: Project[];
}

const MONTH_LABELS = [
  "一月",
  "二月",
  "三月",
  "四月",
  "五月",
  "六月",
  "七月",
  "八月",
  "九月",
  "十月",
  "十一月",
  "十二月",
];

export function CalendarView({ tasks, projects }: CalendarViewProps) {
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const [view, setView] = useState<"month" | "week" | "day" | "agenda" | "year">("week");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    tasks.forEach((t) => {
      const d = new Date(t.startDate);
      const y = d.getFullYear();
      if (Number.isFinite(y)) years.add(y);
    });
    if (years.size === 0) {
      const y = new Date().getFullYear();
      return [y - 1, y, y + 1];
    }
    return Array.from(years).sort((a, b) => a - b);
  }, [tasks]);

  const events = useMemo(() => {
    return tasks.map((task) => {
      const project = projectMap.get(task.projectId);
      const isDone = task.status === "Done";

      // 解析日期和时间
      const start = new Date(task.startDate);
      const end = new Date(task.startDate);

      if (task.startTime) {
        const [hours, minutes] = task.startTime.split(":").map(Number);
        start.setHours(hours, minutes, 0, 0);
      }

      if (task.endTime) {
        const [hours, minutes] = task.endTime.split(":").map(Number);
        end.setHours(hours, minutes, 0, 0);
      } else {
        // 如果没有指定具体结束时间，且不是全天任务，默认加1小时
        if (task.startTime) {
          end.setHours(start.getHours() + 1, start.getMinutes(), 0, 0);
        } else {
          // 全天任务，持续天数
          end.setDate(end.getDate() + (task.duration || 1));
        }
      }

      return {
        id: task.id,
        title: task.name,
        start,
        end,
        allDay: !task.startTime && !task.endTime,
        resource: {
          task,
          project,
          isDone,
        },
      };
    });
  }, [tasks, projectMap]);

  const eventPropGetter = (event: {
    resource: { task: Task; project?: Project; isDone: boolean };
  }) => {
    const { task, project, isDone } = event.resource;
    let backgroundColor = "#FF8C00"; // 默认活力橙

    if (isDone) {
      backgroundColor = "#9CA3AF"; // 完成状态变灰
    } else if (project) {
      if (project.group === "创业") backgroundColor = "#FFD700"; // 明黄
      if (project.group === "工作") backgroundColor = "#CC704B"; // 肉桂橘
      if (project.group === "生活") backgroundColor = "#8B40B7"; // 荧光紫
    }

    if (task.priority === "高" && !isDone) {
      backgroundColor = "#EF4444"; // 高优先级标红
    }

    return {
      style: {
        backgroundColor,
        borderRadius: "4px",
        opacity: isDone ? 0.6 : 1,
        color: ["#FFD700"].includes(backgroundColor) ? "#171717" : "#FFFFFF",
        border: "none",
        fontSize: "0.75rem",
        fontWeight: "500",
      },
    };
  };

  const headerLabel = useMemo(() => {
    if (view === "year") {
      return format(currentDate, "yyyy 年", { locale: zhCN });
    }
    if (view === "month") {
      return format(currentDate, "MMMM yyyy", { locale: zhCN });
    }
    if (view === "day") {
      return format(currentDate, "PPP", { locale: zhCN });
    }
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    return `${format(start, "MMMM dd", { locale: zhCN })} – ${format(end, "MMMM dd", {
      locale: zhCN,
    })}`;
  }, [currentDate, view]);

  const handleNavigate = (action: "TODAY" | "PREV" | "NEXT") => {
    if (action === "TODAY") {
      setCurrentDate(new Date());
      return;
    }
    const factor = action === "NEXT" ? 1 : -1;
    const base = new Date(currentDate);
    if (view === "month") {
      base.setMonth(base.getMonth() + factor);
    } else if (view === "day") {
      base.setDate(base.getDate() + factor);
    } else {
      base.setDate(base.getDate() + factor * 7);
    }
    setCurrentDate(base);
  };

  return (
    <div className="h-[500px] w-full rounded-xl bg-white p-2 dark:bg-neutral-900">
      <style dangerouslySetInnerHTML={{ __html: `
        .rbc-calendar { font-family: inherit; font-size: 12px; }
        .rbc-toolbar button { border-radius: 6px; padding: 4px 10px; font-size: 12px; }
        .rbc-toolbar button.rbc-active { background-color: #f3f4f6; box-shadow: none; color: #111827; }
        .dark .rbc-toolbar button { color: #d1d5db; border-color: #374151; }
        .dark .rbc-toolbar button.rbc-active { background-color: #374151; color: #fff; }
        .dark .rbc-toolbar button:hover { background-color: #374151; }
        .rbc-event { padding: 2px 4px; }
        .rbc-today { background-color: #fef3c7; }
        .dark .rbc-today { background-color: rgba(251, 191, 36, 0.1); }
        .dark .rbc-month-view, .dark .rbc-time-view, .dark .rbc-header, .dark .rbc-day-bg, .dark .rbc-month-row, .dark .rbc-time-header-content { border-color: #374151; }
        .dark .rbc-off-range-bg { background-color: #1f2937; }
        .dark .rbc-timeslot-group { border-color: #374151; }
        .dark .rbc-time-content { border-color: #374151; }
        .dark .rbc-time-slot { border-color: #374151; }
      `}} />
      <div className="mb-2 flex items-center justify-between px-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => handleNavigate("TODAY")}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            今天
          </button>
          <button
            type="button"
            onClick={() => handleNavigate("PREV")}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            上一页
          </button>
          <button
            type="button"
            onClick={() => handleNavigate("NEXT")}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            下一页
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
          <select
            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            value={currentDate.getFullYear()}
            onChange={(e) => {
              const year = Number(e.target.value);
              if (!Number.isFinite(year)) return;
              const next = new Date(currentDate);
              next.setFullYear(year);
              setCurrentDate(next);
            }}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y} 年
              </option>
            ))}
          </select>
          {view !== "year" && (
            <select
              className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
              value={currentDate.getMonth()}
              onChange={(e) => {
                const month = Number(e.target.value);
                if (!Number.isFinite(month)) return;
                const next = new Date(currentDate);
                next.setMonth(month, 1);
                setCurrentDate(next);
                if (view === "year") setView("month");
              }}
            >
              {MONTH_LABELS.map((label, idx) => (
                <option key={label} value={idx}>
                  {label}
                </option>
              ))}
            </select>
          )}
          <span className="hidden text-[11px] font-medium text-neutral-400 sm:inline">
            {headerLabel}
          </span>
        </div>
        <div className="flex gap-1">
          {[
            { id: "month" as const, label: "月" },
            { id: "week" as const, label: "周" },
            { id: "day" as const, label: "日" },
            { id: "agenda" as const, label: "日程" },
            { id: "year" as const, label: "年" },
          ].map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              className={`rounded-md border px-2 py-1 text-xs ${
                view === v.id
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                  : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      {view === "year" ? (
        <div className="grid h-[440px] grid-cols-3 gap-4 overflow-y-auto px-2 pb-2 pt-1 text-xs">
          {Array.from({ length: 12 }).map((_, idx) => {
            const monthStart = new Date(currentDate.getFullYear(), idx, 1);
            const label = format(monthStart, "MMM", { locale: zhCN });
            const monthTasks = tasks.filter((t) => {
              const d = new Date(t.startDate);
              return (
                d.getFullYear() === currentDate.getFullYear() &&
                d.getMonth() === idx
              );
            });
            const notDone = monthTasks.filter((t) => t.status !== "Done").length;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setCurrentDate(monthStart);
                  setView("month");
                }}
                className="flex flex-col rounded-lg border border-neutral-200 bg-white p-2 text-left hover:border-orange-300 hover:bg-orange-50/50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-orange-700 dark:hover:bg-orange-900/20"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-200">
                    {label}
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    {monthTasks.length} 任务
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-orange-400 transition-all"
                    style={{
                      width:
                        monthTasks.length === 0
                          ? "0%"
                          : `${((monthTasks.length - notDone) / monthTasks.length) * 100}%`,
                    }}
                  />
                </div>
                {notDone > 0 && (
                  <div className="mt-1 text-[10px] text-orange-500">
                    进行中 {notDone} 个
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: "100%" }}
          views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
          view={
            view === "month"
              ? Views.MONTH
              : view === "day"
                ? Views.DAY
                : view === "agenda"
                  ? Views.AGENDA
                  : Views.WEEK
          }
          date={currentDate}
          onView={(v) => {
            if (v === Views.MONTH) setView("month");
            else if (v === Views.DAY) setView("day");
            else if (v === Views.AGENDA) setView("agenda");
            else setView("week");
          }}
          onNavigate={(date) => setCurrentDate(date)}
          toolbar={false}
          eventPropGetter={eventPropGetter}
          messages={{
            today: "今天",
            previous: "上一页",
            next: "下一页",
            month: "月",
            week: "周",
            day: "日",
            agenda: "日程",
            date: "日期",
            time: "时间",
            event: "事件",
            noEventsInRange: "这段时间没有日程安排",
            showMore: (total) => `+${total} 更多`,
          }}
          tooltipAccessor={(event) =>
            `${event.title}${
              event.resource.project ? ` (${event.resource.project.name})` : ""
            }`
          }
        />
      )}
    </div>
  );
}
