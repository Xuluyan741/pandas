"use client";

import { useState } from "react";
import { GradientButton } from "@/components/ui/gradient-button";
import { VoiceInput } from "./VoiceInput";
import { cn } from "@/lib/utils";

interface InputSectionProps {
  /** 文本输入变化时触发（可选，兼容已有逻辑） */
  onChangeText?: (text: string) => void;
  /**
   * 触发 AI 解析逻辑：
   * - 解析时间、优先级
   * - 检测冲突并生成任务
   */
  onAnalyze?: (text: string) => Promise<void> | void;
}

/**
 * 日程自然语言输入区：文本输入 + 语音输入 + AI 解析按钮
 */
export function InputSection({ onChangeText, onAnalyze }: InputSectionProps) {
  const [value, setValue] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (next: string) => {
    setValue(next);
    setError(null);
    onChangeText?.(next);
  };

  const triggerAnalyze = async (text: string) => {
    if (!onAnalyze) return;
    if (!text.trim()) {
      setError("请输入或说出一个任务描述。");
      return;
    }
    try {
      setAnalyzing(true);
      setError(null);
      await onAnalyze(text);
    } catch (e) {
      console.error(e);
      setError("AI 解析日程时出现问题，请稍后再试。");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            自然语言创建任务
          </span>
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            例如：“明天上午 10 点开周会，2 小时，高优先级”
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex-1">
          <input
            className={cn(
              "h-10 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm outline-none focus:border-[#FFDAA8] focus:ring-2 focus:ring-[#FFDAA8]/40 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-50",
            )}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="输入或通过语音描述你的任务…"
          />
        </div>
        <div className="flex items-center gap-3">
          <VoiceInput
            onTextReady={(text) => {
              handleChange(text);
              // Whisper 识别完成后，自动触发一次 AI 解析
              if (onAnalyze) {
                void triggerAnalyze(text);
              }
            }}
          />
          <GradientButton
            type="button"
            onClick={() => triggerAnalyze(value)}
            disabled={analyzing}
            className="whitespace-nowrap px-4 py-2 text-xs sm:text-sm"
          >
            {analyzing ? "正在分析日程…" : "AI 解析任务"}
          </GradientButton>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-500 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

