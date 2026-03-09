/**
 * 工具函数：合并 Tailwind CSS 类名（Shadcn UI 风格）
 * 用于条件类名与组件样式合并
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 生成唯一 ID（兼容无 crypto.randomUUID 的环境，如非 HTTPS、旧版浏览器）
 */
export function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** 匹配消息中的 URL（用于自动转成可点击链接） */
const URL_REGEX = /(https?:\/\/[^\s<>"']+)/g;

/**
 * 将文本中的 URL 拆成片段，返回片段数组（字符串与 { type: 'link', url } 对象交替），
 * 由调用方渲染为 <a> 或纯文本
 */
export function splitContentWithUrls(text: string): Array<string | { type: "link"; url: string }> {
  if (!text || typeof text !== "string") return [text || ""];
  const parts: Array<string | { type: "link"; url: string }> = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  URL_REGEX.lastIndex = 0;
  while ((m = URL_REGEX.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push(text.slice(lastIndex, m.index));
    }
    parts.push({ type: "link", url: m[1]! });
    lastIndex = m.index + m[1].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [text];
}
