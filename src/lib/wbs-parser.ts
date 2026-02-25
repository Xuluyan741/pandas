/**
 * 简单 WBS 解析：从 Markdown/层级列表文本生成任务列表（需关联已有项目）
 * 示例：
 *   工作项目
 *     - 优化简历 (预计2天, 高优先级)
 *     - 每日投递 (循环任务)
 */
import type { TaskPriority } from "@/types";

export interface ParsedWBSItem {
  /** 项目名称（用于匹配 Project.name） */
  projectName: string;
  taskName: string;
  duration: number;
  priority: TaskPriority;
  isRecurring?: boolean;
}

/** 解析一行任务：如 "优化简历 (预计2天, 高优先级)" 或 "每日投递 (循环)" */
function parseTaskLine(line: string): Omit<ParsedWBSItem, "projectName"> | null {
  const t = line.replace(/^[\s\-*]+/, "").trim();
  if (!t) return null;

  let taskName = t;
  let duration = 1;
  let priority: TaskPriority = "中";
  let isRecurring = false;

  const recurMatch = t.match(/[（(]?\s*循环\s*[）)]?/);
  if (recurMatch) {
    isRecurring = true;
    taskName = t.replace(recurMatch[0], "").trim();
  }

  const parenMatch = t.match(/[（(]([^）)]+)[）)]/);
  if (parenMatch) {
    const inner = parenMatch[1];
    taskName = t.replace(parenMatch[0], "").trim();
    const dayMatch = inner.match(/预计?\s*(\d+)\s*天/);
    if (dayMatch) duration = Math.max(1, parseInt(dayMatch[1], 10));
    if (/高/.test(inner)) priority = "高";
    else if (/低/.test(inner)) priority = "低";
  }

  return { taskName, duration, priority, isRecurring };
}

/**
 * 解析多行 WBS 文本；第一行或「无缩进」行视为项目名，后续缩进行视为该项目的任务
 */
export function parseWBSText(text: string): ParsedWBSItem[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
  const result: ParsedWBSItem[] = [];
  let currentProject = "";

  for (const line of lines) {
    if (!line) continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    const content = line.trim();
    if (!content) continue;

    if (indent === 0) {
      // 无缩进：视为项目名
      currentProject = content.replace(/^[\-\*]\s*/, "");
      const asTask = parseTaskLine(content);
      if (asTask && (asTask.taskName !== currentProject || asTask.duration !== 1)) {
        result.push({ projectName: currentProject, ...asTask });
      }
      continue;
    }

    if (!currentProject) continue;
    const task = parseTaskLine(line);
    if (task) {
      result.push({ projectName: currentProject, ...task });
    }
  }

  return result;
}
