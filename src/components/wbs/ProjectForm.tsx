"use client";

/**
 * 新增项目表单：名称 + 项目组
 */
import { useState } from "react";
import type { ProjectGroup } from "@/types";
import { GradientButton } from "@/components/ui/gradient-button";
import { PlusCircle } from "lucide-react";

const GROUPS: ProjectGroup[] = ["创业", "工作", "生活"];

interface ProjectFormProps {
  onSubmit: (project: { name: string; group: ProjectGroup }) => void;
}

export function ProjectForm({ onSubmit }: ProjectFormProps) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState<ProjectGroup>("工作");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), group });
    setName("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
        项目名称
        <input
          className="w-44 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-neutral-600 dark:bg-neutral-800 dark:focus:ring-violet-900"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：工作项目"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
        项目组
        <select
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-neutral-600 dark:bg-neutral-800"
          value={group}
          onChange={(e) => setGroup(e.target.value as ProjectGroup)}
        >
          {GROUPS.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </label>
      <GradientButton type="submit" variant="variant" className="flex items-center gap-2">
        <PlusCircle className="h-4 w-4" />
        添加项目
      </GradientButton>
    </form>
  );
}
