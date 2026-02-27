"use client";

import { useState } from "react";

/** 路由决策结果类型 */
interface RouteDecision {
  intent: string;
  model: { id: string; displayName: string; provider: string; inputPricePer1M: number; outputPricePer1M: number };
  fallback: { id: string; displayName: string; provider: string };
  reason: string;
  estimatedTokens: { input: number; output: number };
  estimatedCostUSD: number;
  maxTokens?: number;
}

interface TestResult {
  decision: RouteDecision;
  usedFallback?: boolean;
  response?: {
    content: string;
    model: string;
    provider: string;
    usage: { inputTokens: number; outputTokens: number };
    costUSD: number;
    latencyMs: number;
  };
}

/** 意图标签颜色 */
const INTENT_COLORS: Record<string, string> = {
  TRIVIAL: "bg-gray-200 text-gray-700",
  EXTRACTION: "bg-blue-200 text-blue-800",
  REASONING: "bg-purple-200 text-purple-800",
  ACTION: "bg-orange-200 text-orange-800",
  VOICE_STREAM: "bg-green-200 text-green-800",
};

/** 预设示例输入 */
const EXAMPLES = [
  { label: "闲聊", text: "你好呀" },
  { label: "提取日程", text: "明天下午三点开产品评审会" },
  { label: "复杂规划", text: "两个月后考研数学，帮我制定备考计划" },
  { label: "搜索执行", text: "帮我搜一下去上海的高铁票" },
  { label: "减肥计划", text: "三个月后结婚需要减肥，帮我做训练计划" },
  { label: "冲突检测", text: "周五下午三点约了客户，但那天我已经有团队会议了" },
];

/**
 * 模型路由测试页：输入文本 → 展示路由决策、模型选择、成本预估
 */
export default function RouterTestPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState("");
  const [executeMode, setExecuteMode] = useState(false);

  async function handleSubmit() {
    if (!input.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/ai/router-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input, execute: executeMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "请求失败");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-6 dark:bg-neutral-900">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-2xl font-bold text-neutral-800 dark:text-neutral-100">
          模型路由测试
        </h1>
        <p className="mb-6 text-sm text-neutral-500">
          输入任意文本，查看小熊猫如何选择最合适的 AI 模型
        </p>

        {/* 预设示例 */}
        <div className="mb-4 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.text}
              onClick={() => setInput(ex.text)}
              className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 transition hover:bg-neutral-200 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              {ex.label}
            </button>
          ))}
        </div>

        {/* 输入区 */}
        <div className="mb-4 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="输入文本，如：明天下午三点开会"
            className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
          />
          <button
            onClick={handleSubmit}
            disabled={loading || !input.trim()}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "分析中…" : "路由分析"}
          </button>
        </div>

        {/* 执行开关 */}
        <label className="mb-6 flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
          <input
            type="checkbox"
            checked={executeMode}
            onChange={(e) => setExecuteMode(e.target.checked)}
            className="rounded"
          />
          同时调用模型并返回结果（会产生 API 费用）
        </label>

        {/* 错误 */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* 结果展示 */}
        {result && (
          <div className="space-y-4">
            {/* 意图 */}
            <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-800">
              <div className="mb-3 flex items-center gap-3">
                <span className="text-sm font-medium text-neutral-500">意图分类</span>
                <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${INTENT_COLORS[result.decision.intent] ?? "bg-gray-200"}`}>
                  {result.decision.intent}
                </span>
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                {result.decision.reason}
              </p>
            </div>

            {/* 模型选择 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                <p className="mb-1 text-xs font-medium text-blue-500">主模型</p>
                <p className="text-lg font-bold text-blue-800 dark:text-blue-200">
                  {result.decision.model.displayName}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {result.decision.model.provider} / {result.decision.model.id}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
                <p className="mb-1 text-xs font-medium text-neutral-400">降级备选</p>
                <p className="text-lg font-bold text-neutral-700 dark:text-neutral-200">
                  {result.decision.fallback.displayName}
                </p>
                <p className="text-xs text-neutral-500">
                  {result.decision.fallback.provider} / {result.decision.fallback.id}
                </p>
              </div>
            </div>

            {/* 成本预估 */}
            <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-800">
              <p className="mb-3 text-sm font-medium text-neutral-500">成本预估</p>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-neutral-800 dark:text-neutral-100">
                    {result.decision.estimatedTokens.input}
                  </p>
                  <p className="text-xs text-neutral-400">输入 tokens</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-neutral-800 dark:text-neutral-100">
                    {result.decision.estimatedTokens.output}
                  </p>
                  <p className="text-xs text-neutral-400">输出 tokens</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">
                    ${result.decision.estimatedCostUSD.toFixed(6)}
                  </p>
                  <p className="text-xs text-neutral-400">预估费用</p>
                </div>
              </div>
              {result.decision.maxTokens && (
                <p className="mt-2 text-center text-xs text-amber-600">
                  输出限制 {result.decision.maxTokens} tokens（成本控制）
                </p>
              )}
            </div>

            {/* 实际调用结果 */}
            {result.usedFallback !== undefined && (
              <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-800">
                <div className="mb-3 flex items-center gap-2">
                  <p className="text-sm font-medium text-neutral-500">实际调用</p>
                  {result.usedFallback && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                      已降级
                    </span>
                  )}
                </div>
                {result.response && (
                  <>
                    <div className="mb-3 grid grid-cols-4 gap-2 text-center text-xs">
                      <div>
                        <p className="font-bold text-neutral-700 dark:text-neutral-200">{result.response.provider}</p>
                        <p className="text-neutral-400">provider</p>
                      </div>
                      <div>
                        <p className="font-bold text-neutral-700 dark:text-neutral-200">{result.response.latencyMs}ms</p>
                        <p className="text-neutral-400">延迟</p>
                      </div>
                      <div>
                        <p className="font-bold text-neutral-700 dark:text-neutral-200">
                          {result.response.usage.inputTokens + result.response.usage.outputTokens}
                        </p>
                        <p className="text-neutral-400">总 tokens</p>
                      </div>
                      <div>
                        <p className="font-bold text-green-600">${result.response.costUSD.toFixed(6)}</p>
                        <p className="text-neutral-400">实际费用</p>
                      </div>
                    </div>
                    <div className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                      {result.response.content}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
