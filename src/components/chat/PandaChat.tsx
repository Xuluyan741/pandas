"use client";

/**
 * 小熊猫 AI 对话组件：主界面核心交互入口
 * 支持文本输入 + 语音输入 → AI 解析任务 → 智能项目匹配 → 冲突检测
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Mic, MicOff, Loader2, AlertTriangle, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project, Task, GoalCategory } from "@/types";

type NewTaskParams = {
  name: string;
  projectId: string;
  startDate: string;
  startTime?: string;
  endTime?: string;
  duration: number;
  dependencies: string[];
  status: "To Do";
  priority: "高" | "中" | "低";
  isRecurring?: boolean;
  parentGoalId?: string;
  resourceUrl?: string;
};

type AgentLog = {
  id: string;
  type: "thought" | "error";
  step?: string;
  message: string;
};

interface AgentTaskOutput {
  title: string;
  projectName?: string;
  startDate?: string;
  startTime?: string;
  endTime?: string;
  durationDays?: number;
  priority?: "高" | "中" | "低";
  isRecurring?: boolean;
}

interface AgentConflictOutput {
  hasConflict: boolean;
  suggestions: Array<{
    taskId: string;
    taskName: string;
    action: string;
    proposedStart?: string;
    proposedEnd?: string;
    reason: string;
  }>;
  summary: string;
}

interface AgentReplyPayload {
  text?: string;
  tasks?: Array<{
    task: AgentTaskOutput;
    conflict?: AgentConflictOutput;
  }>;
  actionCard?: {
    title: string;
    description: string;
    url: string;
    riskLevel: "low" | "medium" | "high";
  };
  goalPlan?: {
    goalId?: string;
    title: string;
    deadline: string;
    category?: GoalCategory;
    preview: Array<{
      name: string;
      startDate: string;
      duration: number;
      priority: "高" | "中" | "低";
      resourceUrl?: string;
    }>;
    resources?: Array<{
      title: string;
      url: string;
      summary: string;
      type?: string;
    }>;
  };
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  /** 冲突建议交互（仅 assistant 消息） */
  conflictAction?: {
    type: "conflict_confirm";
    pendingTask: NewTaskParams;
    adjustments: Array<{
      taskId: string;
      taskName: string;
      action: string;
      proposedStart?: string;
      proposedEnd?: string;
    }>;
  };
  /** 是否已被用户处理 */
  resolved?: boolean;
  /** Deep Link 执行预览卡片（可选） */
  actionCard?: {
    title: string;
    description: string;
    url: string;
    riskLevel: "low" | "medium" | "high";
  };
  /** 长期目标规划预览（如五一韩国旅游准备步骤） */
  goalPlan?: AgentReplyPayload["goalPlan"];
}

interface PandaChatProps {
  projects: Project[];
  tasks: Task[];
  onTaskCreated?: (info: { created: number; skipped: string[] }) => void;
  addTask: (task: NewTaskParams) => void;
  addProject: (project: { name: string; group: "创业" | "工作" | "生活"; description?: string }) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
}

const TODAY = new Date().toISOString().slice(0, 10);
const NEW_TASK_ID = "__NEW_TASK__";

/** 根据时段生成小熊猫问候语 */
function getGreeting(name?: string | null): string {
  const hour = new Date().getHours();
  const who = name || "朋友";
  if (hour < 6) return `夜深了，${who}，还没休息吗？`;
  if (hour < 9) return `早上好，${who}，新的一天从这里开始`;
  if (hour < 12) return `上午好，${who}，今天想做些什么？`;
  if (hour < 14) return `中午好，${who}，记得吃午饭哦`;
  if (hour < 18) return `下午好，${who}，有什么我能帮你的？`;
  if (hour < 22) return `晚上好，${who}，今天辛苦了`;
  return `夜深了，${who}，早点休息吧`;
}

/** 判断任务是否已经逾期（基于当前日期动态计算） */
function isOverdueNow(task: Task): boolean {
  if (task.status === "Done") return false;
  const start = new Date(task.startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + (task.duration || 1) - 1);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const todayDate = new Date(todayStr);
  return end < todayDate;
}

/** 模糊匹配项目：先精确匹配，再尝试包含关系匹配 */
function findMatchingProject(projectName: string, projects: Project[]): Project | undefined {
  if (!projectName) return undefined;
  const name = projectName.trim();
  const exact = projects.find((p) => p.name.trim() === name);
  if (exact) return exact;
  return projects.find(
    (p) => p.name.includes(name) || name.includes(p.name),
  );
}

export function PandaChat({ projects, tasks, onTaskCreated, addTask, addProject, updateTask }: PandaChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** 处理冲突确认：用户接受建议后执行调整并创建任务 */
  const handleConflictAccept = useCallback(
    (msgId: string, action: NonNullable<Message["conflictAction"]>) => {
      // 先根据建议调整已有任务 & 待创建的新任务时间
      const pending = { ...action.pendingTask };

      for (const adj of action.adjustments) {
        if (adj.action === "cancel") continue;

        // 针对新任务本身的建议：直接改写 pendingTask 的时间
        if (adj.taskId === NEW_TASK_ID) {
          if (adj.proposedStart) {
            const d = new Date(adj.proposedStart);
            pending.startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            pending.startTime = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
          }
          if (adj.proposedEnd) {
            const d = new Date(adj.proposedEnd);
            pending.endTime = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
          }
          continue;
        }

        // 针对已有任务的建议：调用 updateTask 调整时间
        const patch: Partial<Task> = {};
        if (adj.proposedStart) {
          const d = new Date(adj.proposedStart);
          patch.startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          patch.startTime = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        }
        if (adj.proposedEnd) {
          const d = new Date(adj.proposedEnd);
          patch.endTime = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        }
        updateTask(adj.taskId, patch);
      }

      // 按调整后的时间真正创建新任务
      addTask(pending);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, resolved: true } : m,
        ),
      );
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "好的，已按建议调整日程并创建任务 ✓",
          timestamp: new Date(),
        },
      ]);
    },
    [addTask, updateTask],
  );

  /** 处理冲突拒绝：忽略冲突直接创建 */
  const handleConflictReject = useCallback(
    (msgId: string, action: NonNullable<Message["conflictAction"]>) => {
      addTask(action.pendingTask);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, resolved: true } : m,
        ),
      );
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "好的，已直接创建任务（保留现有日程不变）。",
          timestamp: new Date(),
        },
      ]);
    },
    [addTask],
  );

  /**
   * 确保至少有一个项目可用——如果没有项目则自动创建「日常」兜底项目
   * 返回可用的项目列表
   */
  const ensureProjectsAvailable = useCallback(async (): Promise<Project[]> => {
    if (projects.length > 0) return projects;
    addProject({ name: "日常", group: "生活", description: "小熊猫自动创建的默认项目" });
    // addProject 是同步乐观更新，直接从 store 拿最新状态
    const { useStore } = await import("@/store/useStore");
    return useStore.getState().projects;
  }, [projects, addProject]);

  /**
   * 将长期目标规划预览写入日程，同时创建 Goal 实体，子任务带 parentGoalId 和 resourceUrl
   */
  const handleApplyGoalPlan = useCallback(
    async (plan: NonNullable<AgentReplyPayload["goalPlan"]>) => {
      const title = plan.title.trim() || "长期目标";
      const { useStore } = await import("@/store/useStore");
      let currentProjects = useStore.getState().projects;

      let project =
        currentProjects.find((p) => p.name.trim() === title) ??
        currentProjects.find((p) => p.name.includes(title));

      if (!project) {
        addProject({
          name: title,
          group: "生活",
          description: "小熊猫为你创建的长期目标项目",
        });
        currentProjects = useStore.getState().projects;
        project =
          currentProjects.find((p) => p.name.trim() === title) ??
          currentProjects.find((p) => p.name.includes(title));
      }

      if (!project) return;

      // 创建 Goal 实体
      const goalId = plan.goalId || `goal-${Date.now()}`;
      useStore.getState().addGoal({
        title,
        deadline: plan.deadline,
        category: plan.category || "custom",
        status: "active",
      });

      // 获取刚创建的 goal 的实际 id（由 store 生成）
      const createdGoals = useStore.getState().goals;
      const actualGoalId = createdGoals[createdGoals.length - 1]?.id || goalId;

      plan.preview.forEach((g) => {
        addTask({
          name: g.name,
          projectId: project!.id,
          startDate: g.startDate,
          duration: g.duration,
          dependencies: [],
          status: "To Do",
          priority: g.priority,
          isRecurring: false,
          parentGoalId: actualGoalId,
          resourceUrl: g.resourceUrl || undefined,
        });
      });

      const taskCount = plan.preview.length;
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `已创建「${title}」长期目标，${taskCount} 个准备步骤已写入日程。你可以在工作台 → 大盘中查看进度和管理目标。`,
          timestamp: new Date(),
        },
      ]);
    },
    [addProject, addTask],
  );

  /** 调用 AI 解析并创建任务，含冲突检测与智能项目匹配 */
  const processWithAI = useCallback(
    async (text: string) => {
      setAgentLogs([]);
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const res = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            tasks,
            projects: projects.map((p) => p.name),
          }),
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || "小熊猫这次没有响应成功，请稍后再试");
        }

        const reader = res.body.getReader();
        const textDecoder = new TextDecoder("utf-8");
        let buffer = "";
        let handledReply = false;

        // 流式解析 SSE：Thought → Reply → Error
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += textDecoder.decode(value, { stream: true });

          let separatorIndex = buffer.indexOf("\n\n");
          while (separatorIndex !== -1) {
            const rawEvent = buffer.slice(0, separatorIndex);
            buffer = buffer.slice(separatorIndex + 2);
            separatorIndex = buffer.indexOf("\n\n");

            const lines = rawEvent.split("\n");
            let eventType = "message";
            let dataLine = "";
            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                dataLine = line.slice(5).trim();
              }
            }
            if (!dataLine) continue;

            if (eventType === "thought") {
              try {
                const payload = JSON.parse(dataLine) as { step?: string; message?: string };
                if (payload.message) {
                  const message = payload.message ?? "";
                  setAgentLogs((prev) => {
                    const next: AgentLog[] = [
                      ...prev,
                      {
                        id: crypto.randomUUID(),
                        type: "thought",
                        step: payload.step,
                        message,
                      },
                    ];
                    return next.slice(-5);
                  });
                }
              } catch {
                // 忽略解析错误
              }
              continue;
            }

            if (eventType === "error") {
              try {
                const payload = JSON.parse(dataLine) as { message?: string };
                const msgText = payload.message || "小熊猫这边出了一点小状况，请稍后再试。";
                setAgentLogs((prev) => {
                  const next: AgentLog[] = [
                    ...prev,
                    { id: crypto.randomUUID(), type: "error", message: msgText },
                  ];
                  return next.slice(-5);
                });
                setMessages((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: msgText,
                    timestamp: new Date(),
                  },
                ]);
              } catch {
                // 忽略解析错误
              }
              continue;
            }

            if (eventType === "reply" && !handledReply) {
              handledReply = true;
              let payload: AgentReplyPayload | null = null;
              try {
                payload = JSON.parse(dataLine) as AgentReplyPayload;
              } catch {
                // 当成普通文本回复
                setMessages((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: dataLine,
                    timestamp: new Date(),
                  },
                ]);
                continue;
              }

              const baseAssistantMessage: Message | null = payload.text
                ? {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: payload.text ?? "",
                    timestamp: new Date(),
                    actionCard: payload.actionCard
                      ? {
                          ...payload.actionCard,
                        }
                      : undefined,
                    goalPlan: payload.goalPlan
                      ? {
                          ...payload.goalPlan,
                        }
                      : undefined,
                  }
                : null;

              const taskResults = payload.tasks ?? [];
              if (taskResults.length === 0) {
                // 纯对话，无任务
                if (baseAssistantMessage) {
                  setMessages((prev) => [...prev, baseAssistantMessage]);
                }
                continue;
              }

              const currentProjects = await ensureProjectsAvailable();
              let created = 0;
              const createdDetails: string[] = [];
              const skipped: string[] = [];

              for (const item of taskResults) {
                const t = item.task;
                const projectName = (t.projectName ?? "").trim();

                // 若已存在同名且逾期的任务，视为「重新安排」：创建新任务的同时把旧任务标记为已完成
                const sameNameOverdue = tasks.filter(
                  (existing) =>
                    existing.name.trim() === t.title.trim() &&
                    isOverdueNow(existing),
                );
                const existingToClose =
                  sameNameOverdue.length === 1 ? sameNameOverdue[0] : undefined;

                let project: Project | undefined;
                if (projectName) {
                  project = findMatchingProject(projectName, currentProjects);
                }
                if (!project) {
                  project = currentProjects[0];
                }

                const taskParams: NewTaskParams = {
                  name: t.title,
                  projectId: project.id,
                  startDate: t.startDate || TODAY,
                  startTime: t.startTime || undefined,
                  endTime: t.endTime || undefined,
                  duration: t.durationDays && t.durationDays > 0 ? t.durationDays : 1,
                  dependencies: [],
                  status: "To Do",
                  priority: t.priority ?? "中",
                  isRecurring: t.isRecurring ?? false,
                };

                if (!project) {
                  skipped.push(t.title);
                  continue;
                }

                const conflict = item.conflict;
                if (conflict && conflict.hasConflict && conflict.suggestions.length > 0) {
                  const summary = conflict.summary;
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      role: "assistant",
                      content: summary,
                      timestamp: new Date(),
                      conflictAction: {
                        type: "conflict_confirm",
                        pendingTask: taskParams,
                        adjustments: conflict.suggestions,
                      },
                    },
                  ]);
                } else {
                  addTask(taskParams);
                    if (existingToClose) {
                      updateTask(existingToClose.id, { status: "Done", progress: 100 });
                    }
                  created += 1;
                  const timeDesc = taskParams.startTime
                    ? `${taskParams.startDate} ${taskParams.startTime}${
                        taskParams.endTime ? `~${taskParams.endTime}` : ""
                      }`
                    : taskParams.startDate;
                  createdDetails.push(
                    `  · ${t.title}（${timeDesc}，${taskParams.priority}优先级）→ ${project.name}`,
                  );
                }
              }

              if (created > 0) {
                let replyText = `收到，已帮你安排好：\n${createdDetails.join("\n")}`;
                if (created === 1) {
                  replyText += "\n\n还有别的安排吗？随时告诉我。";
                }
                const msg: Message = {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: replyText,
                  timestamp: new Date(),
                  actionCard: payload.actionCard
                    ? {
                        ...payload.actionCard,
                      }
                    : undefined,
                  goalPlan: payload.goalPlan
                    ? {
                        ...payload.goalPlan,
                      }
                    : undefined,
                };
                setMessages((prev) => [...prev, msg]);
              }

              if (skipped.length > 0) {
                const skippedMsg = `我识别出了这些任务，但暂时没找到合适的项目来承载：\n${skipped
                  .map((name) => `  · ${name}`)
                  .join(
                    "\n",
                  )}\n\n可以先在右下角工作台里创建对应项目，我再帮你安排行程。`;
                setMessages((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: skippedMsg,
                    timestamp: new Date(),
                  },
                ]);
              }

              // 若存在 actionCard 且尚未随着其他回复发送，则追加一条包含动作预览的消息
              if (payload.actionCard && !created && skipped.length === 0 && !baseAssistantMessage) {
                const msg: Message = {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: payload.text ?? "",
                  timestamp: new Date(),
                  actionCard: { ...payload.actionCard },
                  goalPlan: payload.goalPlan
                    ? {
                        ...payload.goalPlan,
                      }
                    : undefined,
                };
                setMessages((prev) => [...prev, msg]);
              } else if (baseAssistantMessage && !created && skipped.length === 0) {
                setMessages((prev) => [...prev, baseAssistantMessage]);
              }

              onTaskCreated?.({ created, skipped });
            }
          }
        }
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: e instanceof Error ? e.message : "出了点问题，请稍后再试",
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [projects, tasks, addTask, updateTask, ensureProjectsAvailable, onTaskCreated],
  );

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    processWithAI(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  /** 语音录制 */
  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        setIsTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("file", blob, "voice.webm");
          const res = await fetch("/api/whisper", { method: "POST", body: fd });
          if (!res.ok) throw new Error("语音识别失败");
          const data: { text?: string } = await res.json();
          const text = (data.text || "").trim();
          if (text) {
            setInput(text);
            processWithAI(text);
          }
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: "语音识别出了点问题，请再试一次或直接打字告诉我",
              timestamp: new Date(),
            },
          ]);
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      /* 权限被拒绝等 */
    }
  }, [processWithAI]);

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const isBusy = isLoading || isTranscribing;

  return (
    <div className="flex h-full flex-col">
      {/* 对话区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <EmptyState
            projects={projects}
            tasks={tasks}
            onSelect={(text) => processWithAI(text)}
          />
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                    msg.role === "user"
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                      : msg.conflictAction && !msg.resolved
                        ? "border border-orange-200 bg-orange-50 text-neutral-800 dark:border-orange-800 dark:bg-orange-950/30 dark:text-neutral-200"
                        : "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
                  )}
                >
                  {msg.role === "assistant" && (
                    <span className={cn(
                      "mb-1 flex items-center gap-1 text-xs font-medium",
                      msg.conflictAction && !msg.resolved ? "text-orange-600" : "text-orange-500",
                    )}>
                      {msg.conflictAction && !msg.resolved ? (
                        <><AlertTriangle className="h-3 w-3" /> 小熊猫 · 冲突检测</>
                      ) : (
                        <>🐾 小熊猫</>
                      )}
                    </span>
                  )}
                  {msg.content}
                  {/* 长期目标规划预览卡片 */}
                  {msg.goalPlan && msg.role === "assistant" && msg.goalPlan.preview.length > 0 && (
                    <div className="mt-3 rounded-xl border border-neutral-200 bg-white/90 p-3 text-xs text-neutral-700 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-200">
                      <div className="mb-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                        长期目标 · {msg.goalPlan.title}
                        <span className="ml-2 text-[10px] text-neutral-400">截止 {msg.goalPlan.deadline}</span>
                      </div>
                      <div className="mb-2 text-[11px] text-neutral-400 dark:text-neutral-500">
                        以下是准备计划（不会自动写入，确认后点击下方按钮）：
                      </div>
                      <ol className="mb-2 space-y-1.5 text-[11px]">
                        {msg.goalPlan.preview.map((g, idx) => (
                          <li key={`${g.startDate}-${idx}`} className="leading-snug">
                            <span className="font-medium text-neutral-600 dark:text-neutral-200">
                              {idx + 1}. {g.startDate}
                            </span>
                            <span className="mx-1 text-neutral-400">·</span>
                            <span>{g.name}</span>
                            <span className="ml-1 text-[10px] text-orange-500">
                              （{g.priority}）
                            </span>
                            {g.resourceUrl && (
                              <a
                                href={g.resourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-1 text-[10px] text-blue-500 underline hover:text-blue-600"
                              >
                                参考资料
                              </a>
                            )}
                          </li>
                        ))}
                      </ol>
                      {/* 推荐资料列表 */}
                      {msg.goalPlan.resources && msg.goalPlan.resources.length > 0 && (
                        <div className="mb-3 rounded-lg bg-neutral-50 p-2 dark:bg-neutral-800/50">
                          <div className="mb-1 text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
                            推荐资料
                          </div>
                          {msg.goalPlan.resources.map((r, idx) => (
                            <div key={idx} className="mb-1 text-[10px] leading-snug">
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 underline hover:text-blue-600"
                              >
                                {r.title}
                              </a>
                              <span className="ml-1 text-neutral-400">{r.summary}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => msg.goalPlan && handleApplyGoalPlan(msg.goalPlan)}
                        className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-3 py-1 text-[11px] font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                      >
                        一键写入到日历
                      </button>
                    </div>
                  )}
                  {/* Deep Link 执行预览卡片 */}
                  {msg.actionCard && msg.role === "assistant" && msg.actionCard.url && (
                    <div className="mt-3 rounded-xl border border-neutral-200 bg-white/90 p-3 text-xs text-neutral-700 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-200">
                      <div className="mb-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                        小熊猫可以帮你打开一个相关页面，后续是否执行完全由你决定：
                      </div>
                      <div className="mb-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                        {msg.actionCard.title}
                      </div>
                      <p className="mb-3 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                        {msg.actionCard.description}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] text-neutral-400">
                          风险等级：{msg.actionCard.riskLevel === "high" ? "较高（涉及外部网站）" : msg.actionCard.riskLevel === "medium" ? "中等" : "较低"}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (typeof window !== "undefined") {
                                window.open(msg.actionCard!.url, "_blank", "noopener,noreferrer");
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-3 py-1 text-[11px] font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                          >
                            允许并打开
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-[11px] font-medium text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                          >
                            暂不执行
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* 冲突确认操作按钮 */}
                  {msg.conflictAction && !msg.resolved && (
                    <div className="mt-3 flex items-center gap-2 border-t border-orange-200/50 pt-3 dark:border-orange-800/50">
                      <button
                        type="button"
                        onClick={() => handleConflictAccept(msg.id, msg.conflictAction!)}
                        className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-600"
                      >
                        <Check className="h-3 w-3" />
                        接受建议
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConflictReject(msg.id, msg.conflictAction!)}
                        className="flex items-center gap-1.5 rounded-lg bg-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600"
                      >
                        <X className="h-3 w-3" />
                        忽略冲突
                      </button>
                    </div>
                  )}
                  {msg.resolved && msg.conflictAction && (
                    <div className="mt-2 text-xs text-neutral-400">已处理</div>
                  )}
                </div>
              </div>
            ))}
            {isBusy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-neutral-100 px-4 py-3 text-sm text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isTranscribing ? "正在听你说…" : "小熊猫正在思考…"}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Agent 状态面板（桌面端展示 Thought → Action → Observation） */}
      {agentLogs.length > 0 && (
        <div className="pointer-events-none fixed bottom-24 right-4 z-20 hidden w-64 rounded-2xl bg-neutral-900/90 p-3 text-xs text-neutral-100 shadow-lg backdrop-blur md:block">
          <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-orange-300">
            <Loader2 className="h-3 w-3 animate-spin" />
            小熊猫状态
          </div>
          <div className="max-h-28 space-y-1 overflow-y-auto">
            {agentLogs.slice(-4).map((log) => (
              <div
                key={log.id}
                className={cn(
                  "rounded-md px-2 py-1",
                  log.type === "error"
                    ? "bg-red-500/20 text-red-100"
                    : "bg-neutral-800/80 text-neutral-100",
                )}
              >
                {log.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 输入区域 */}
      <div className="border-t border-neutral-200/60 bg-white/80 px-4 py-4 backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            type="button"
            onClick={toggleRecording}
            disabled={isBusy}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all",
              isRecording
                ? "bg-red-500 text-white animate-pulse"
                : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700",
              isBusy && "opacity-50",
            )}
            title={isRecording ? "停止录音" : "语音输入"}
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="告诉小熊猫你想做什么…"
            disabled={isBusy}
            className="h-10 flex-1 rounded-full border border-neutral-200 bg-neutral-50 px-4 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-200/50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-50 dark:placeholder:text-neutral-500 dark:focus:border-orange-600 dark:focus:ring-orange-800/30"
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isBusy}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all",
              input.trim() && !isBusy
                ? "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                : "bg-neutral-100 text-neutral-300 dark:bg-neutral-800 dark:text-neutral-600",
            )}
            title="发送"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** 根据用户实际项目/任务动态生成上下文相关的示例提示 */
function buildContextualPrompts(projects: Project[], tasks: Task[]): string[] {
  const prompts: string[] = [];
  const activeTasks = tasks.filter((t) => t.status !== "Done");
  const todayStr = new Date().toISOString().slice(0, 10);

  const overdue = activeTasks.filter((t) => {
    const end = new Date(t.startDate);
    end.setDate(end.getDate() + (t.duration || 1));
    return end < new Date(todayStr);
  });
  if (overdue.length > 0) {
    prompts.push(`帮我重新安排「${overdue[0].name}」，已经逾期了`);
  }

  const doing = activeTasks.filter((t) => t.status === "Doing");
  if (doing.length > 0 && prompts.length < 3) {
    prompts.push(`「${doing[0].name}」进度怎么样了，需要调整时间吗`);
  }

  if (projects.length > 0 && prompts.length < 3) {
    prompts.push(`给「${projects[0].name}」添加一个明天下午的任务`);
  }

  const todayTasks = activeTasks.filter((t) => t.startDate === todayStr);
  if (todayTasks.length > 0 && prompts.length < 3) {
    prompts.push(`今天还有 ${todayTasks.length} 个任务，帮我排一下优先级`);
  }

  const fallbacks = [
    "帮我安排明天下午三点开一个会议",
    "这周内需要完成一份报告，高优先级",
    "每天早上提醒我运动30分钟",
  ];
  let i = 0;
  while (prompts.length < 3 && i < fallbacks.length) {
    prompts.push(fallbacks[i]);
    i++;
  }

  return prompts.slice(0, 3);
}

/** 空状态：对话开始前的引导界面（动态展示用户上下文） */
function EmptyState({
  projects,
  tasks,
  onSelect,
}: {
  projects: Project[];
  tasks: Task[];
  onSelect: (text: string) => void;
}) {
  const prompts = buildContextualPrompts(projects, tasks);
  const hasData = projects.length > 0 || tasks.length > 0;
  const activeCount = tasks.filter((t) => t.status !== "Done").length;

  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <div className="mb-6 text-6xl">🐾</div>
      <h2 className="mb-2 text-xl font-semibold text-neutral-800 dark:text-neutral-200">
        {getGreeting()}
      </h2>
      <p className="mb-8 max-w-sm text-center text-sm text-neutral-500 dark:text-neutral-400">
        {hasData ? (
          <>
            你有 {projects.length} 个项目、{activeCount} 个进行中的任务。
            <br />
            试试下面的快捷指令，或直接告诉我你的计划。
          </>
        ) : (
          <>
            我是小熊猫，你的智能日程伙伴。
            <br />
            告诉我你的计划，我来帮你安排。
          </>
        )}
      </p>
      <div className="grid w-full max-w-md gap-2">
        {prompts.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onSelect(example)}
            className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left text-sm text-neutral-600 transition-colors hover:border-orange-200 hover:bg-orange-50/50 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-400 dark:hover:border-orange-800 dark:hover:bg-orange-900/10"
          >
            &ldquo;{example}&rdquo;
          </button>
        ))}
      </div>
    </div>
  );
}
