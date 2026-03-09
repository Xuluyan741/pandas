/**
 * Agent 工作区路径（nanobot restrictToWorkspace 等价）
 * 文件系统、Shell 等工具仅允许在此目录下操作
 */
import path from "path";
import { existsSync, mkdirSync } from "fs";

const DEFAULT_WORKSPACE = path.join(process.cwd(), "data", "workspace");

/** 获取工作区根目录（若不存在则创建） */
export function getWorkspaceRoot(): string {
  const root = process.env.AGENT_WORKSPACE_DIR || DEFAULT_WORKSPACE;
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true });
  }
  return path.resolve(root);
}

/** 是否启用「仅限工作区」沙箱（默认 true） */
export function isRestrictToWorkspace(): boolean {
  return process.env.AGENT_RESTRICT_TO_WORKSPACE !== "false";
}

/**
 * 将用户传入的相对路径解析为绝对路径，并校验不越界工作区
 * 若越界或非法则返回 null
 */
export function resolveWithinWorkspace(relativePath: string): string | null {
  const root = getWorkspaceRoot();
  const resolved = path.resolve(root, relativePath || ".");
  const normalized = path.normalize(resolved);
  if (!normalized.startsWith(path.normalize(root))) {
    return null;
  }
  return normalized;
}
