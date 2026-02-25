"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceInputProps {
  /** 语音转文字完成后回调，返回识别出的文本 */
  onTextReady: (text: string) => void;
}

type Phase = "idle" | "listening" | "transcribing" | "analyzing";

/**
 * 语音输入组件：使用 MediaRecorder 录音，并调用 /api/whisper 做语音识别
 */
export function VoiceInput({ onTextReady }: VoiceInputProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string>("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const resetRecorder = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      resetRecorder();
    };
  }, [resetRecorder]);

  const uploadAndTranscribe = useCallback(
    async (blob: Blob) => {
      try {
        setPhase("transcribing");
        setHint("正在翻译语音…");
        setError(null);

        const formData = new FormData();
        formData.append("file", blob, "voice.webm");

        const res = await fetch("/api/whisper", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "语音识别失败，请稍后重试。");
        }

        const data: { text?: string } = await res.json();
        const text = (data.text || "").trim();
        if (!text) {
          throw new Error("识别结果为空，请再说一次试试。");
        }

        setPhase("analyzing");
        setHint("正在分析日程…");
        onTextReady(text);

        // 短暂展示“正在分析日程…”，再回到 idle
        setTimeout(() => {
          setPhase("idle");
          setHint("");
        }, 800);
      } catch (e) {
        console.error(e);
        setPhase("idle");
        setHint("");
        setError(e instanceof Error ? e.message : "语音识别时出现未知错误。");
      }
    },
    [onTextReady],
  );

  const handleToggle = async () => {
    if (phase === "listening") {
      // 停止录音，开始上传
      setHint("正在翻译语音…");
      setPhase("transcribing");
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      return;
    }

    // 开始录音
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("当前浏览器不支持麦克风录音，请更换最新版本浏览器。");
      return;
    }

    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        uploadAndTranscribe(blob);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setPhase("listening");
      setHint("小龙虾正在听… 再次点击停止录音。");
    } catch (e) {
      console.error(e);
      let message = "无法访问麦克风，请检查设备设置。";
      if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
        message = "麦克风权限被拒绝，请在浏览器地址栏旁允许访问麦克风。";
      }
      setError(message);
      resetRecorder();
      setPhase("idle");
      setHint("");
    }
  };

  const isBusy = phase === "listening" || phase === "transcribing" || phase === "analyzing";

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={handleToggle}
        disabled={phase === "transcribing"}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-full border text-xs transition-all focus:outline-none focus:ring-2 focus:ring-[#FFDAA8]/70 disabled:opacity-60",
          phase === "listening"
            ? "border-red-500 bg-red-500/10 text-red-500 animate-pulse"
            : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700",
        )}
        title={phase === "listening" ? "点击停止录音" : "点击开始语音输入"}
      >
        <Mic className="h-4 w-4" />
      </button>
      {hint && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {hint}
        </p>
      )}
      {error && (
        <p className="max-w-xs text-xs text-red-500 dark:text-red-400">
          {error}
        </p>
      )}
      {!hint && !error && !isBusy && (
        <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
          语音描述任务，例如：“明天下午三点开项目复盘，高优先级”
        </p>
      )}
    </div>
  );
}

