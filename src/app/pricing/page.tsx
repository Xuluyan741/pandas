"use client";

/**
 * Pricing 页面：Free vs Pro，PRD 定价 ¥19.9/月、¥199/年
 * 支付跳转 Stripe Checkout（配置 STRIPE_SECRET_KEY + Price ID 后生效）
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const PRICE_MONTHLY = 19.9;
const PRICE_YEARLY = 199;

export default function PricingPage() {
  const [loading, setLoading] = useState<"monthly" | "yearly" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async (plan: "monthly" | "yearly") => {
    setError(null);
    setLoading(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) {
        setError(data.error || "创建支付链接失败");
        return;
      }
      if (data.url) window.location.href = data.url;
      else setError("支付未配置，请稍后再试或联系我们");
    } catch {
      setError("网络异常，请重试");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-16">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-1 text-sm text-neutral-400 hover:text-orange-400"
        >
          <ArrowLeft className="h-4 w-4" /> 返回首页
        </Link>
        <div className="space-y-4 text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            小熊猫 · 订阅与支付
          </h1>
          <p className="text-base text-neutral-400 sm:text-lg">
            用专业项目管理思维，<span className="text-[#FF8C00]">掌控你的人生项目</span>
          </p>
          <p className="text-sm text-neutral-400 sm:text-base">
            Free 版适合体验与小规模使用，Pro 版解锁无限项目、更多 AI 建议额度与优先支持。
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Free */}
          <div className="relative flex flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Free
            </div>
            <div className="mb-4 flex items-baseline gap-1">
              <span className="text-3xl font-semibold">¥0</span>
              <span className="text-xs text-neutral-500"> / 永久</span>
            </div>
            <p className="mb-6 text-sm text-neutral-400">适合个人体验、单人项目或短期规划。</p>
            <ul className="mb-6 space-y-2 text-sm text-neutral-300">
              <li>· 最多 10 个项目（创业 / 工作 / 生活）</li>
              <li>· WBS 批量录入 + 甘特图可视化</li>
              <li>· 基础 AI 建议额度（轻量使用）</li>
              <li>· 浏览器推送提醒（每日进度）</li>
            </ul>
            <button
              className="mt-auto inline-flex items-center justify-center rounded-xl bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-700"
              disabled
            >
              当前方案
            </button>
          </div>

          {/* Pro */}
          <div className="relative flex flex-col overflow-hidden rounded-2xl border border-[#FF8C00]/40 bg-gradient-to-b from-[#2B0A1D] via-neutral-950 to-neutral-950 p-6">
            <div className="absolute right-4 top-4 rounded-full bg-[#FF8C00] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
              推荐
            </div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">
              Pro
            </div>
            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-3xl font-semibold">¥{PRICE_MONTHLY}</span>
              <span className="text-xs text-neutral-400">/ 月</span>
              <span className="text-sm text-neutral-500">或 ¥{PRICE_YEARLY}/年</span>
            </div>
            <p className="mb-6 text-sm text-neutral-300">
              面向认真对待人生项目的人：求职、考研、独立开发、长期习惯养成。
            </p>
            <ul className="mb-6 space-y-2 text-sm text-neutral-100">
              <li>· <span className="font-semibold text-[#FFDAA8]">无限项目</span> 与任务数量</li>
              <li>· 更高 AI 建议额度与优先推送</li>
              <li>· 高级统计卡片与进度分析（预留）</li>
              <li>· 新功能优先体验 & 独立开发者支持你</li>
            </ul>
            <div className="mt-auto flex flex-col gap-2">
              <button
                onClick={() => handleCheckout("monthly")}
                disabled={!!loading}
                className="inline-flex items-center justify-center rounded-xl bg-[#FF8C00] px-4 py-2 text-sm font-semibold text-white hover:bg-[#CC704B] disabled:opacity-50"
              >
                {loading === "monthly" ? "跳转中…" : `¥${PRICE_MONTHLY} / 月`}
              </button>
              <button
                onClick={() => handleCheckout("yearly")}
                disabled={!!loading}
                className="inline-flex items-center justify-center rounded-xl border border-[#FF8C00]/60 px-4 py-2 text-sm font-medium text-[#FFDAA8] hover:bg-[#FF8C00]/10 disabled:opacity-50"
              >
                {loading === "yearly" ? "跳转中…" : `¥${PRICE_YEARLY} / 年（更划算）`}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-center text-sm text-amber-400">{error}</p>
        )}
        <p className="text-center text-xs text-neutral-500">
          支付由 Stripe 安全处理，我们不会存储你的卡号。未配置 Stripe 时按钮会提示。
        </p>
      </div>
    </div>
  );
}

