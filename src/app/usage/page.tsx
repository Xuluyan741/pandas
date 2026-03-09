"use client";

/**
 * 使用统计页（参考 ClawWork：成本与配额可视化）
 */
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { BarChart3, Zap, ArrowLeft, CreditCard } from "lucide-react";

interface UsageStats {
  plan: string;
  dailyLimit: number;
  monthlyLimit: number;
  today: {
    byKind: Record<string, { count: number; costUSD: number }>;
    weightedUsed: number;
    reward: number;
    costUSD: number;
    remaining: number;
  };
  month: {
    byKind: Record<string, { count: number; costUSD: number }>;
    weightedUsed: number;
    reward: number;
    costUSD: number;
    remaining: number;
  };
  trend: { date: string; weighted: number; cost: number }[];
}

const KIND_LABEL: Record<string, string> = {
  agent_chat: "对话",
  parse_tasks: "解析任务",
  scheduler: "冲突建议",
  agent_push: "推送",
};

export default function UsagePage() {
  const { status } = useSession();
  const [stats, setStats] = useState<UsageStats | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/usage/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats);
  }, [status]);

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-white p-6 dark:bg-neutral-950">
        <p className="text-neutral-500">请先登录后查看使用统计。</p>
        <Link href="/" className="mt-4 inline-flex items-center gap-1 text-orange-500">
          <ArrowLeft className="h-4 w-4" /> 返回首页
        </Link>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-6 dark:bg-neutral-950">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-orange-500"
        >
          <ArrowLeft className="h-4 w-4" /> 返回首页
        </Link>
        <h1 className="mb-2 flex items-center gap-2 text-xl font-semibold text-neutral-800 dark:text-neutral-100">
          <BarChart3 className="h-5 w-5 text-orange-500" />
          使用统计
        </h1>
        <p className="mb-6 text-sm text-neutral-500">
          配额按加权次数计算；高价值行为（如采纳冲突建议）会返还额度。
        </p>

        {stats.plan === "free" && (
          <Link
            href="/pricing"
            className="mb-6 flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-medium text-white hover:bg-orange-600 dark:bg-orange-600 dark:hover:bg-orange-700"
          >
            <CreditCard className="h-4 w-4" />
            升级 Pro 解锁更高额度
          </Link>
        )}

        <div className="space-y-6">
          <section className="rounded-2xl border border-neutral-200 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
            <h2 className="mb-3 flex items-center gap-1 text-sm font-medium text-neutral-600 dark:text-neutral-400">
              <Zap className="h-4 w-4" /> 今日 / 本月剩余
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-2xl font-semibold text-orange-500">{stats.today.remaining}</p>
                <p className="text-xs text-neutral-500">今日剩余（加权）</p>
                <p className="mt-1 text-xs text-neutral-400">
                  已用 {stats.today.weightedUsed.toFixed(1)}
                  {stats.today.reward > 0 && `，奖励 +${stats.today.reward}`}
                </p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-neutral-700 dark:text-neutral-200">
                  {stats.month.remaining}
                </p>
                <p className="text-xs text-neutral-500">本月剩余（加权）</p>
                <p className="mt-1 text-xs text-neutral-400">
                  已用 {stats.month.weightedUsed.toFixed(1)}
                  {stats.month.reward > 0 && `，奖励 +${stats.month.reward}`}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-neutral-400">
              额度上限：每日 {stats.dailyLimit}，每月 {stats.monthlyLimit}（{stats.plan}）
            </p>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
            <h2 className="mb-3 text-sm font-medium text-neutral-600 dark:text-neutral-400">
              今日按类型
            </h2>
            <ul className="space-y-2">
              {Object.entries(stats.today.byKind).map(([kind, v]) => (
                <li
                  key={kind}
                  className="flex justify-between text-sm"
                >
                  <span className="text-neutral-600 dark:text-neutral-300">
                    {KIND_LABEL[kind] ?? kind}
                  </span>
                  <span className="text-neutral-500">
                    {v.count} 次
                    {v.costUSD > 0 && ` · 约 $${v.costUSD.toFixed(4)}`}
                  </span>
                </li>
              ))}
            </ul>
            {stats.today.costUSD > 0 && (
              <p className="mt-2 text-xs text-neutral-400">
                今日总成本约 ${stats.today.costUSD.toFixed(4)} USD
              </p>
            )}
          </section>

          {stats.trend.length > 0 && (
            <section className="rounded-2xl border border-neutral-200 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
              <h2 className="mb-3 text-sm font-medium text-neutral-600 dark:text-neutral-400">
                近 7 日趋势（加权用量）
              </h2>
              <div className="flex items-end justify-between gap-1">
                {stats.trend.map((d) => (
                  <div key={d.date} className="flex flex-1 flex-col items-center">
                    <div
                      className="w-full min-h-[4px] rounded-t bg-orange-400/70 dark:bg-orange-500/70"
                      style={{ height: `${Math.min(100, (d.weighted / (stats.dailyLimit || 1)) * 80)}px` }}
                    />
                    <span className="mt-1 text-[10px] text-neutral-400">
                      {d.date.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
