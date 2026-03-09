/**
 * POST /api/channels/telegram/webhook — Telegram Bot 接收消息
 * 需在 BotFather 设置 webhook 为该 URL；收到消息后查用户绑定并调用 Agent 回复
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_API = (token: string) => `https://api.telegram.org/bot${token}`;

/** 向 Telegram 发送消息 */
async function sendTelegram(chatId: string, text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;
  const url = `${BOT_API(TELEGRAM_BOT_TOKEN)}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4096),
      parse_mode: "HTML",
    }),
  });
}

/** 从 SSE 流中收集最后一条 reply 的 text */
async function consumeChatStream(
  baseUrl: string,
  userId: string,
  text: string,
  secret: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/agent/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-User-Id": userId,
      "X-Internal-Secret": secret,
    },
    body: JSON.stringify({ text, tasks: [], projects: [] }),
  });
  if (!res.ok || !res.body) return "小熊猫暂时无法回复，请稍后再试。";
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = "";
  let lastEvent = "";
  let lastReply = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        lastEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ") && lastEvent === "reply") {
        try {
          const data = JSON.parse(line.slice(6)) as { text?: string };
          if (data.text) lastReply = data.text;
        } catch {
          // ignore
        }
      }
    }
  }
  return lastReply || "（暂无回复）";
}

/** GET：Telegram 有时会请求验证，返回 200 */
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  if (!TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  let body: { message?: { chat?: { id: number }; text?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  const message = body.message;
  if (!message?.chat?.id) {
    return NextResponse.json({ ok: true });
  }
  const chatId = String(message.chat.id);
  const text = (message.text || "").trim();

  if (text === "/start" || text === "/id") {
    await sendTelegram(
      chatId,
      text === "/id"
        ? `你的 Chat ID：<code>${chatId}</code>\n请到小熊猫网页端「设置 → 通道」中绑定此 ID。`
        : "你好，我是小熊猫管家。请先在网页端绑定 Telegram：设置 → 通道 → 输入你的 Chat ID 并保存。发送 /id 可获取本对话的 Chat ID。",
    );
    return NextResponse.json({ ok: true });
  }

  if (!text) {
    return NextResponse.json({ ok: true });
  }

  const bindRes = await db.execute({
    sql: "SELECT user_id FROM channel_bindings WHERE channel = ? AND channel_chat_id = ?",
    args: ["telegram", chatId],
  });
  const bindRows = (bindRes.rows || []) as Record<string, unknown>[];
  if (bindRows.length === 0) {
    await sendTelegram(
      chatId,
      "尚未绑定。请到小熊猫网页端：设置 → 通道 → 输入你的 Chat ID 并保存。发送 /id 可获取 Chat ID。",
    );
    return NextResponse.json({ ok: true });
  }
  const userId = bindRows[0].user_id as string;
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    await sendTelegram(chatId, "服务未配置 CRON_SECRET，无法调用 Agent。");
    return NextResponse.json({ ok: true });
  }
  const baseUrl =
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3001");
  const reply = await consumeChatStream(baseUrl, userId, text, secret);
  await sendTelegram(chatId, reply);
  return NextResponse.json({ ok: true });
}
