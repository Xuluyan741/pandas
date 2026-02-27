/**
 * POST /api/ai/router-test
 * 测试接口：对用户输入做意图分类与路由决策，返回路由结果与成本预估
 * 可选参数 execute: true 则真正调用模型并返回结果
 */
import { NextRequest, NextResponse } from "next/server";
import { modelRouter } from "@/lib/ai";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? (body.text as string).trim() : "";
  if (!text) {
    return NextResponse.json({ error: "缺少 text 字段" }, { status: 400 });
  }

  const execute = body.execute === true;

  const messages = [
    { role: "system" as const, content: "你是小熊猫智能日程伙伴，用简洁友好的中文回复。" },
    { role: "user" as const, content: text },
  ];

  if (!execute) {
    const decision = await modelRouter.route(text, messages);
    return NextResponse.json({ decision });
  }

  try {
    const result = await modelRouter.routeAndCall(text, messages);
    return NextResponse.json({
      decision: result.decision,
      usedFallback: result.usedFallback,
      response: {
        content: result.content,
        model: result.model,
        provider: result.provider,
        usage: result.usage,
        costUSD: result.costUSD,
        latencyMs: result.latencyMs,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `调用失败: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
