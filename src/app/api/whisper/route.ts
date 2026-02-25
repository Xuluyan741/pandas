import { NextRequest, NextResponse } from "next/server";

const LOCAL_STT_URL = "http://localhost:8000/transcribe";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "缺少音频文件，请重新录音后重试。" },
        { status: 400 },
      );
    }

    const forward = new FormData();
    forward.append("file", file, "audio.webm");

    let res: Response;
    try {
      res = await fetch(LOCAL_STT_URL, {
        method: "POST",
        body: forward,
      });
    } catch (err) {
      console.error("[whisper] local STT service unreachable", err);
      return NextResponse.json(
        { error: "本地语音服务未启动，请先启动本地小龙虾助手（local_stt）。" },
        { status: 503 },
      );
    }

    if (!res.ok) {
      let detail = "";
      try {
        const data = (await res.json()) as { detail?: string; error?: string; text?: string };
        detail = data.detail || data.error || "";
      } catch {
        detail = await res.text().catch(() => "");
      }
      console.error("[whisper] local STT error:", res.status, detail);
      return NextResponse.json(
        { error: detail || "本地语音识别失败，请检查小龙虾助手服务。" },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { text?: string };
    return NextResponse.json({ text: data.text ?? "" });
  } catch (err) {
    console.error("[whisper] unexpected error", err);
    return NextResponse.json(
      { error: "服务器处理语音时发生异常，请稍后再试。" },
      { status: 500 },
    );
  }
}

