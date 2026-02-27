/**
 * /api/scheduler — 冲突检测 + LLM 建议文案
 * POST { newTask: Task, existingTasks: Task[], generateAdvice?: boolean }
 * 返回 { hasConflict, conflicts, suggestions, advice? }
 */
import { NextRequest, NextResponse } from "next/server";
import {
  detectConflicts,
  formatConflictsForLLM,
  formatConflictsForUser,
  type ConflictResult,
} from "@/lib/scheduler";
import type { Task } from "@/types";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canConsume, recordUsage } from "@/lib/quota";
import { DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL } from "@/lib/models";

interface SchedulerRequest {
  newTask: Task;
  existingTasks: Task[];
  /** 是否额外调用 LLM 生成自然语言建议（默认 true） */
  generateAdvice?: boolean;
}

interface SchedulerResponse {
  hasConflict: boolean;
  /** 纯算法结果（序列化安全） */
  conflicts: Array<{
    existingTaskId: string;
    existingTaskName: string;
    existingTaskPriority: string;
    overlapMinutes: number;
    overlapStart: string;
    overlapEnd: string;
  }>;
  suggestions: Array<{
    taskId: string;
    taskName: string;
    action: string;
    proposedStart?: string;
    proposedEnd?: string;
    reason: string;
  }>;
  /** 用户可读的简报 */
  userSummary: string;
  /** LLM 生成的自然语言建议（仅在 generateAdvice=true 时存在） */
  advice?: string;
}

export async function POST(req: NextRequest) {
  let body: SchedulerRequest;
  try {
    body = (await req.json()) as SchedulerRequest;
  } catch {
    return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  }

  if (!body.newTask || !body.existingTasks) {
    return NextResponse.json(
      { error: "缺少 newTask 或 existingTasks" },
      { status: 400 },
    );
  }

  // Phase 5：对冲突消解建议也施加 Token 配额（视为 suggest 入口）
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? "guest";
  const now = new Date();
  const quota = await canConsume(userId, "scheduler", now);
  if (!quota.allowed) {
    return NextResponse.json(
      {
        error:
          "小熊猫今天为你生成冲突建议的次数已经用完啦，可以稍后再试，或者登录/升级为会员以获得更多配额。",
      },
      { status: 429 },
    );
  }

  /** 纯算法冲突检测 */
  const result: ConflictResult = detectConflicts(body.newTask, body.existingTasks);

  const response: SchedulerResponse = {
    hasConflict: result.hasConflict,
    conflicts: result.conflicts.map((c) => ({
      existingTaskId: c.existingTask.id,
      existingTaskName: c.existingTask.name,
      existingTaskPriority: c.existingTask.priority,
      overlapMinutes: c.overlapMinutes,
      overlapStart: c.overlapSlot.start.toISOString(),
      overlapEnd: c.overlapSlot.end.toISOString(),
    })),
    suggestions: result.suggestions.map((s) => ({
      taskId: s.taskId,
      taskName: s.taskName,
      action: s.action,
      proposedStart: s.proposedStart?.toISOString(),
      proposedEnd: s.proposedEnd?.toISOString(),
      reason: s.reason,
    })),
    userSummary: formatConflictsForUser(result),
  };

  /** 如果有冲突且要求生成 LLM 建议 */
  if (result.hasConflict && body.generateAdvice !== false && DEEPSEEK_API_KEY) {
    try {
      // 通过配额检查后再实际扣减
      await recordUsage(userId, "scheduler", now);
      const advice = await generateLLMAdvice(result, body.newTask);
      if (advice) response.advice = advice;
    } catch (err) {
      console.error("[scheduler] LLM 建议生成失败，回退为纯算法结果", err);
    }
  }

  return NextResponse.json(response);
}

/** 调用 LLM 将算法分析结果转化为温暖自然的建议文案 */
async function generateLLMAdvice(
  result: ConflictResult,
  newTask: Task,
): Promise<string | null> {
  const conflictContext = formatConflictsForLLM(result);

  const systemPrompt = [
    "你是小熊猫，一个温暖的智能日程管家。",
    "用户刚添加了一个新任务但与已有日程冲突，下面是算法检测出的冲突信息和调整建议。",
    "请用 2-3 句话，以关心朋友的口吻向用户说明情况并给出建议。",
    "要求：简洁、温暖、不说废话，直接告诉用户冲突是什么、建议怎么调整。",
    "不要用 markdown 格式，纯文本即可。",
  ].join("\n");

  const userPrompt = [
    `用户新添加的任务：「${newTask.name}」（优先级：${newTask.priority}）`,
    "",
    conflictContext,
    "",
    "请生成简洁的建议文案。",
  ].join("\n");

  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 200,
      stream: false,
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  return data.choices?.[0]?.message?.content?.trim() || null;
}
