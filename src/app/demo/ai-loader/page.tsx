"use client";

import { useState } from "react";
import { AILoader } from "@/components/ui/ai-loader";

/**
 * AILoader 演示页：展示全屏 AI 生成中动效。
 * 访问 /demo/ai-loader 查看，点击按钮可切换显示/隐藏。
 */
export default function DemoAILoaderPage() {
  const [show, setShow] = useState(false);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 bg-background">
      <h1 className="text-2xl font-semibold">AI Loader 演示</h1>
      <p className="text-muted-foreground text-center max-w-md">
        点击下方按钮显示全屏「生成中」动效，再次点击或 3 秒后自动关闭以便查看页面。
      </p>
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90"
      >
        {show ? "隐藏 Loader" : "显示 Loader"}
      </button>
      {show && (
        <>
          <AILoader text="Generating" size={180} />
          {/* 用透明按钮盖住一部分区域，点任意处可关（可选） */}
          <button
            type="button"
            className="fixed inset-0 z-[60] cursor-default"
            aria-label="关闭"
            onClick={() => setShow(false)}
          />
        </>
      )}
    </div>
  );
}
