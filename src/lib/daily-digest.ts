/**
 * 今日最重要事项：用于每日推送/通知
 * 优先级：逾期 > 今日到期 > 高优先级进行中/待办
 */
import type { Task } from "@/types";
import { isOverdue, isDueToday } from "./progress";

const MAX_ITEMS = 5;

export function getTodayPriorities(tasks: Task[]): { title: string; body: string; taskNames: string[] } {
  const notDone = tasks.filter((t) => t.status !== "Done");
  const overdue = notDone.filter((t) => isOverdue(t));
  const dueToday = notDone.filter((t) => isDueToday(t) && !isOverdue(t));
  const highPriority = notDone.filter(
    (t) => t.priority === "高" && !isDueToday(t) && !isOverdue(t)
  );

  const names: string[] = [];
  const add = (list: Task[], prefix: string) => {
    for (const t of list) {
      if (names.length >= MAX_ITEMS) break;
      names.push(`${prefix}${t.name}`);
    }
  };
  add(overdue, "⚠️ ");
  add(dueToday, "⏰ ");
  add(highPriority, "");

  const title = "今日最重要事项";
  const body =
    names.length > 0
      ? names.join("\n")
      : "暂无待办，保持节奏～";

  return { title, body, taskNames: names };
}
