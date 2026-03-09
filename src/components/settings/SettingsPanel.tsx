"use client";

/**
 * 设置面板：账号登录/注册、Heartbeat、通道绑定、定时提醒、技能市场
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Heart, MessageCircle, Clock, Puzzle, Loader2, BarChart3, CreditCard, LogIn, UserPlus, LogOut, User } from "lucide-react";
import { GradientButton } from "@/components/ui/gradient-button";
import { cn } from "@/lib/utils";

interface HeartbeatTask {
  id: string;
  content: string;
  done: boolean;
  isRecurring: boolean;
  createdAt: string;
}

interface CronJob {
  id: string;
  name: string;
  message: string;
  nextRunAt: string;
  cronExpr?: string | null;
  intervalSeconds?: number | null;
}

interface SkillItem {
  id: string;
  name: string;
  description: string;
  riskLevel: string;
}

export function SettingsPanel() {
  const { data: session, status } = useSession();
  const [heartbeat, setHeartbeat] = useState<HeartbeatTask[]>([]);
  const [heartbeatNew, setHeartbeatNew] = useState("");
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [cronName, setCronName] = useState("");
  const [cronMessage, setCronMessage] = useState("");
  const [cronExpr, setCronExpr] = useState("0 9 * * *");
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [enabledSkills, setEnabledSkills] = useState<string[]>([]);
  const [telegramChatId, setTelegramChatId] = useState("");
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<"free" | "pro" | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [h, c, m, s, sub] = await Promise.all([
        fetch("/api/heartbeat").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/cron/jobs").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/skills/market").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/skills/me").then((r) => (r.ok ? r.json() : { enabled: [] })),
        fetch("/api/subscription").then((r) => (r.ok ? r.json() : null)),
      ]);
      setHeartbeat(Array.isArray(h) ? h : []);
      setCronJobs(Array.isArray(c) ? c : []);
      setSkills(Array.isArray(m) ? m : []);
      setEnabledSkills(Array.isArray(s?.enabled) ? s.enabled : []);
      setPlan(sub?.plan ?? null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addHeartbeat = async () => {
    if (!heartbeatNew.trim()) return;
    const res = await fetch("/api/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: heartbeatNew.trim(), isRecurring: false }),
    });
    if (res.ok) {
      setHeartbeatNew("");
      load();
    }
  };

  const toggleHeartbeat = async (id: string, done: boolean) => {
    await fetch(`/api/heartbeat/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    load();
  };

  const deleteHeartbeat = async (id: string) => {
    await fetch(`/api/heartbeat/${id}`, { method: "DELETE" });
    load();
  };

  const addCron = async () => {
    if (!cronName.trim() || !cronMessage.trim()) return;
    const res = await fetch("/api/cron/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cronName.trim(), message: cronMessage.trim(), cronExpr: cronExpr.trim() }),
    });
    if (res.ok) {
      setCronName("");
      setCronMessage("");
      load();
    }
  };

  const deleteCron = async (id: string) => {
    await fetch(`/api/cron/jobs/${id}`, { method: "DELETE" });
    load();
  };

  const bindTelegram = async () => {
    if (!telegramChatId.trim()) return;
    const res = await fetch("/api/channels/bind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "telegram", channelChatId: telegramChatId.trim() }),
    });
    if (res.ok) load();
  };

  const toggleSkill = async (skillId: string, enabled: boolean) => {
    await fetch("/api/skills/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillId, enabled }),
    });
    setEnabledSkills((prev) =>
      enabled ? [...prev.filter((s) => s !== skillId), skillId] : prev.filter((s) => s !== skillId),
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* 账号：未登录显示登录/注册，已登录显示退出 */}
      <section>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          <User className="h-4 w-4 text-neutral-500" />
          账号
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
          {status === "loading" ? (
            <p className="text-sm text-neutral-500">加载中…</p>
          ) : session?.user ? (
            <>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                已登录：<span className="font-medium">{session.user.email ?? session.user.name ?? "—"}</span>
              </p>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </button>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                <LogIn className="h-4 w-4" />
                登录
              </Link>
              <Link
                href="/login?tab=register"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                <UserPlus className="h-4 w-4" />
                注册
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* 订阅与支付（入口：右下角工作台悬浮球 → 设置） */}
      <section>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          <CreditCard className="h-4 w-4 text-orange-500" />
          订阅与支付
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            当前方案：<span className="font-medium">{plan === "pro" ? "Pro" : "Free"}</span>
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 dark:bg-orange-600 dark:hover:bg-orange-700"
          >
            <CreditCard className="h-4 w-4" />
            {plan === "pro" ? "管理订阅" : "升级 Pro"}
          </Link>
          <p className="text-xs text-neutral-500">
            支付由 Stripe 处理，支持月付 / 年付，安全可靠。
          </p>
        </div>
      </section>

      <section>
        <Link
          href="/usage"
          className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          <BarChart3 className="h-4 w-4 text-orange-500" />
          使用统计与配额
        </Link>
      </section>

      {/* Heartbeat */}
      <section>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          <Heart className="h-4 w-4 text-red-400" />
          Heartbeat 周期性任务
        </div>
        <p className="mb-2 text-xs text-neutral-500">每 30 分钟 Agent 会执行未完成项并推送汇报</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={heartbeatNew}
            onChange={(e) => setHeartbeatNew(e.target.value)}
            placeholder="例如：检查天气并推送摘要"
            className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
          <GradientButton type="button" onClick={addHeartbeat}>添加</GradientButton>
        </div>
        <ul className="mt-2 space-y-1">
          {heartbeat.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-800/50">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => toggleHeartbeat(t.id, !t.done)}
                className="h-4 w-4 rounded border-neutral-300"
              />
              <span className={cn("flex-1 truncate", t.done && "text-neutral-400 line-through")}>{t.content}</span>
              <button type="button" onClick={() => deleteHeartbeat(t.id)} className="text-xs text-red-500 hover:underline">删除</button>
            </li>
          ))}
        </ul>
      </section>

      {/* 通道：Telegram */}
      <section>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          <MessageCircle className="h-4 w-4 text-blue-500" />
          Telegram 绑定
        </div>
        <p className="mb-2 text-xs text-neutral-500">在 Telegram 给 Bot 发 /id 获取 Chat ID，填入下方并保存</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={telegramChatId}
            onChange={(e) => setTelegramChatId(e.target.value)}
            placeholder="Chat ID"
            className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
          <GradientButton type="button" onClick={bindTelegram}>保存</GradientButton>
        </div>
      </section>

      {/* 定时提醒 */}
      <section>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          <Clock className="h-4 w-4 text-amber-500" />
          定时提醒
        </div>
        <div className="space-y-2">
          <input value={cronName} onChange={(e) => setCronName(e.target.value)} placeholder="名称" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800" />
          <input value={cronMessage} onChange={(e) => setCronMessage(e.target.value)} placeholder="提醒内容" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800" />
          <input value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} placeholder="cron 如 0 9 * * *" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800" />
          <GradientButton type="button" onClick={addCron}>添加定时提醒</GradientButton>
        </div>
        <ul className="mt-2 space-y-1">
          {cronJobs.map((j) => (
            <li key={j.id} className="flex items-center justify-between rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-800/50">
              <span className="font-medium">{j.name}</span>
              <span className="text-xs text-neutral-500">下次: {new Date(j.nextRunAt).toLocaleString()}</span>
              <button type="button" onClick={() => deleteCron(j.id)} className="text-xs text-red-500 hover:underline">删除</button>
            </li>
          ))}
        </ul>
      </section>

      {/* 技能市场 */}
      <section>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          <Puzzle className="h-4 w-4 text-violet-500" />
          技能市场
        </div>
        <ul className="space-y-2">
          {skills.map((s) => (
            <li key={s.id} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
              <div className="flex items-center justify-between">
                <span className="font-medium">{s.name}</span>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={enabledSkills.includes(s.id) || enabledSkills.length === 0}
                    onChange={(e) => toggleSkill(s.id, e.target.checked)}
                  />
                  启用
                </label>
              </div>
              <p className="mt-1 text-xs text-neutral-500">{s.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
