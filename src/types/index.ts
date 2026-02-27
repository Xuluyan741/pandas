/**
 * 项目组分类：对应 Dashboard 三大板块
 */
export type ProjectGroup = "创业" | "工作" | "生活";

/**
 * 任务状态（PMP 风格）
 */
export type TaskStatus = "To Do" | "Doing" | "Done";

/**
 * 优先级（用于排序与高亮）
 */
export type TaskPriority = "高" | "中" | "低";

/**
 * 项目实体
 */
export interface Project {
  id: string;
  name: string;
  group: ProjectGroup;
  /** 项目描述（可选） */
  description?: string;
  /** 创建时间 ISO 字符串 */
  createdAt: string;
  /** 最后更新时间 */
  updatedAt: string;
}

/**
 * 任务实体（WBS 叶子/节点）
 */
export interface Task {
  id: string;
  /** 任务名称 */
  name: string;
  /** 所属项目 ID */
  projectId: string;
  /** 开始日期 YYYY-MM-DD */
  startDate: string;
  /** 开始时间 HH:mm（可选，无时间则是全天任务） */
  startTime?: string;
  /** 结束时间 HH:mm（可选） */
  endTime?: string;
  /** 预计工期（天数） */
  duration: number;
  /** 依赖的前置任务 ID 列表，用于甘特图连线与关键路径 */
  dependencies: string[];
  status: TaskStatus;
  priority: TaskPriority;
  /** 是否循环任务（如每日投递） */
  isRecurring?: boolean;
  /** 完成百分比 0-100，用于进度计算 */
  progress?: number;
  /** 创建时间 */
  createdAt: string;
  /** 最后更新 */
  updatedAt: string;
}

/**
 * LocalStorage 持久化结构（便于后续扩展为 Supabase/Firebase）
 */
export interface PersistedState {
  projects: Project[];
  tasks: Task[];
  /** 数据版本，便于迁移 */
  version: number;
}
