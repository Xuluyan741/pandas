"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface AILoaderProps {
  /** 尺寸（宽高一致），默认 180 */
  size?: number;
  /** 展示文字，按字符逐个动画，默认 "Generating" */
  text?: string;
  /** 是否全屏遮罩；false 时仅渲染中央动效块，用于嵌入主页等 */
  fullScreen?: boolean;
  /** 为 true 时表示放在黑底上，字母与圆环用浅色 */
  onDarkBg?: boolean;
  /** 为 true 时表示放在灰白底上，字母与圆环用深灰 */
  onLightBg?: boolean;
}

/**
 * AI 加载组件：黑白灰风格，字母逐字动画 + 旋转圆环。
 * 依赖 globals.css 中的 .animate-loaderCircle / .animate-loaderLetter 及对应 keyframes。
 */
export const AILoader: React.FC<AILoaderProps> = ({
  size = 180,
  text = "Generating",
  fullScreen = true,
  onDarkBg = false,
  onLightBg = false,
}) => {
  const letters = text.split("");
  const letterClass = onLightBg
    ? "text-neutral-600 dark:text-neutral-400"
    : onDarkBg
      ? "text-white"
      : "text-white dark:text-neutral-900";
  const circleClass = onDarkBg ? "animate-loaderCircleOnDark" : "animate-loaderCircle";

  const inner = (
    <div
      className="relative flex items-center justify-center select-none font-sans"
      style={{ width: size, height: size }}
    >
      {letters.map((letter, index) => (
        <span
          key={index}
          className={cn("inline-block animate-loaderLetter opacity-40", letterClass)}
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          {letter}
        </span>
      ))}
      <div className={cn("absolute inset-0 rounded-full", circleClass)} />
    </div>
  );

  if (!fullScreen) {
    return inner;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-neutral-800 via-neutral-900 to-black dark:from-gray-100 dark:via-gray-200 dark:to-gray-300">
      {inner}
    </div>
  );
};

/** 与原有命名保持一致，便于 demo 等引用 */
export const Component = AILoader;
