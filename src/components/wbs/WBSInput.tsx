"use client";

/**
 * WBS 批量录入：项目名 chip 点击插入 + 导入成功/失败提示
 */
import { useState } from "react";
import { parseWBSText } from "@/lib/wbs-parser";
import type { Project } from "@/types";
import { GradientButton } from "@/components/ui/gradient-button";
import { FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WBSInputProps {
  projects: Project[];
  onImport: (items: {
    projectId: string;
    taskName: string;
    duration: number;
    priority: "高" | "中" | "低";
    isRecurring?: boolean;
  }[]) => void;
}

const PLACEHOLDER = `示例（第一行为项目名，缩进行为任务）：
工作项目
  - 优化简历 (预计2天, 高优先级)
  - 每日投递 (循环任务)
创业项目A
  - 准备审批材料 (预计3天, 高)`;

export function WBSInput({ projects, onImport }: WBSInputProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  const handleParse = () => {
    setError(null);
    setSuccessCount(null);
    const parsed = parseWBSText(text);
    if (parsed.length === 0) {
      setError("未解析到有效任务，请按示例格式输入（项目名在第一列，任务用缩进 + - 标记）");
      return;
    }
    const byName = new Map(projects.map((p) => [p.name.trim(), p]));
    const toImport: { projectId: string; taskName: string; duration: number; priority: "高" | "中" | "低"; isRecurring?: boolean }[] = [];
    const missing: string[] = [];
    for (const item of parsed) {
      const project = byName.get(item.projectName.trim());
      if (!project) {
        if (!missing.includes(item.projectName)) missing.push(item.projectName);
        continue;
      }
      toImport.push({ projectId: project.id, taskName: item.taskName, duration: item.duration, priority: item.priority, isRecurring: item.isRecurring });
    }
    if (missing.length > 0) {
      const existingNames = projects.map((p) => `「${p.name}」`).join(" ");
      setError(`项目名不匹配：${missing.map((n) => `「${n}」`).join(" ")}。${existingNames ? `当前已有：${existingNames}` : "请先添加项目。"}`);
      return;
    }
    if (toImport.length === 0) {
      setError("没有可导入的任务");
      return;
    }
    onImport(toImport);
    setText("");
    setSuccessCount(toImport.length);
  };

  const appendProjectName = (name: string) => {
    setText((prev) => {
      const base = prev.trimEnd();
      return base ? `${base}\n${name}\n` : `${name}\n`;
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-violet-500" />
        <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">WBS 批量录入</span>
      </div>

      {projects.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-neutral-400">点击插入项目名：</span>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                p.group === "创业" && "border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300",
                p.group === "工作" && "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300",
                p.group === "生活" && "border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/50 dark:text-green-300"
              )}
              onClick={() => appendProjectName(p.name)}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <textarea
        className="min-h-[120px] w-full rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-mono text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-neutral-700 dark:bg-neutral-800"
        value={text}
        onChange={(e) => { setText(e.target.value); setSuccessCount(null); }}
        placeholder={PLACEHOLDER}
      />

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {successCount !== null && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          已成功导入 {successCount} 条任务
        </div>
      )}

      <GradientButton type="button" onClick={handleParse} className="self-start">
        解析并导入任务
      </GradientButton>
    </div>
  );
}
