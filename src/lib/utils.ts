/**
 * 工具函数：合并 Tailwind CSS 类名（Shadcn UI 风格）
 * 用于条件类名与组件样式合并
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
