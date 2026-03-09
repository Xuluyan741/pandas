/**
 * POST /api/analytics/event — 前端上报 PMF 事件（如推送点击、用户确认创建日程）
 * 仅接受客户端白名单事件名，鉴权后写入 pmf_events，userId 脱敏
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logEvent, type PmfEventName } from "@/lib/analytics";

/** 仅允许前端上报的事件（parse_tasks/scheduler/agent_chat 由服务端埋点） */
const CLIENT_ALLOWED_EVENTS: PmfEventName[] = ["push_click", "schedule_created_with_ai"];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? "guest";

  let body: { event?: string; payload?: Record<string, unknown> };
  try {
    body = (await req.json()) as { event?: string; payload?: Record<string, unknown> };
  } catch {
    return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  }

  const event = body.event;
  if (!event || typeof event !== "string" || !CLIENT_ALLOWED_EVENTS.includes(event as PmfEventName)) {
    return NextResponse.json(
      { error: "无效的 event，允许: " + CLIENT_ALLOWED_EVENTS.join(", ") },
      { status: 400 },
    );
  }

  // payload 仅允许安全字段，过滤掉可能包含任务/语音的 key
  const payload = body.payload && typeof body.payload === "object"
    ? { source: body.payload.source, has_conflict: body.payload.has_conflict, task_count: body.payload.task_count }
    : undefined;

  await logEvent(userId, event as PmfEventName, payload as { source?: "voice" | "text"; has_conflict?: boolean; task_count?: number });
  return NextResponse.json({ ok: true });
}
