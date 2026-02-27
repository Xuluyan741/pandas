import { NextRequest, NextResponse } from "next/server";

const LOCAL_STT_URL = "http://localhost:8000/transcribe";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com";

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

    // 若配置了 OpenAI API，则优先走云端转写（线上 Vercel 场景）
    if (OPENAI_API_KEY) {
      const openaiForm = new FormData();
      const audioFile = file instanceof Blob ? file : new Blob([file as unknown as BlobPart], { type: "audio/webm" });
      openaiForm.append("file", audioFile, "audio.webm");
      openaiForm.append("model", OPENAI_TRANSCRIBE_MODEL);
      openaiForm.append("response_format", "json");
      openaiForm.append("language", "zh");

      const res = await fetch(`${OPENAI_BASE_URL}/v1/audio/transcriptions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: openaiForm,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[whisper] OpenAI transcription failed:", res.status, res.statusText, text);
        return NextResponse.json(
          { error: "云端语音识别失败，请稍后再试。" },
          { status: 502 },
        );
      }

      const data = (await res.json()) as { text?: string };
      return NextResponse.json({ text: data.text ?? "" });
    }

    // 本地开发：退回到 local_stt（需手动启动 Python 服务）
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
        { error: "本地语音服务未启动，请先启动本地语音识别服务（local_stt）。" },
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
        { error: detail || "本地语音识别失败，请检查语音识别服务。" },
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

