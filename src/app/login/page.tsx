"use client";

/**
 * 登录 / 注册页面
 * 设计：暖色渐变背景、居中卡片、社交 App 风格（参考 netease-style-app）
 * 支持：Google OAuth + 邮箱密码（Gmail / QQ邮箱 / 163邮箱等）
 */
import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { BackgroundGradientAnimation } from "@/components/ui/background-gradient-animation";
import { GradientButton } from "@/components/ui/gradient-button";
import { Eye, EyeOff, Loader2, Target } from "lucide-react";
import { cn } from "@/lib/utils";

const ERROR_MSG: Record<string, string> = {
  EMAIL_TAKEN:         "该邮箱已注册，请直接登录",
  CredentialsSignin:   "邮箱或密码错误，请重试",
  OAuthAccountNotLinked: "该邮箱已通过其他方式注册，请使用原方式登录",
  Configuration:       "Google 登录未配置，请使用邮箱登录",
};

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab]             = useState<"login" | "register">("login");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [name, setName]           = useState("");
  const [showPwd, setShowPwd]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
    const err = searchParams.get("error");
    if (err) setError(ERROR_MSG[err] ?? `登录出错：${err}`);
  }, [status, searchParams, router]);

  /** 工作台设置里「注册」链接带 ?tab=register，进入时默认切到注册 tab */
  useEffect(() => {
    if (searchParams.get("tab") === "register") setTab("register");
  }, [searchParams]);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        redirect: false,
        email: email.trim(),
        password,
        name: name.trim(),
        action: tab,
      });
      if (res?.error) {
        setError(ERROR_MSG[res.error] ?? res.error);
      } else {
        router.replace("/");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "发生未知错误，请重试";
      setError(process.env.NODE_ENV === "development" ? msg : "网络或服务异常，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    setLoading(true);
    signIn("google", { callbackUrl: "/" });
  };

  return (
    <BackgroundGradientAnimation
      gradientBackgroundStart="rgb(120, 40, 20)"
      gradientBackgroundEnd="rgb(60, 10, 60)"
      firstColor="220, 120, 40"
      secondColor="200, 60, 100"
      thirdColor="240, 160, 60"
      fourthColor="160, 30, 80"
      fifthColor="200, 100, 20"
      pointerColor="240, 140, 60"
      containerClassName="min-h-screen w-full"
      className="flex min-h-screen items-center justify-center p-4"
      interactive
    >
      <div className="w-full max-w-md rounded-3xl bg-white/95 p-8 shadow-2xl backdrop-blur-xl dark:bg-neutral-900/95">

        {/* ── 应用标识 ── */}
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div
            className="app-logo-icon flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg"
            style={{
              background: "linear-gradient(to bottom right, var(--brand-orange), var(--brand-orange-dark))",
            }}
          >
            <Target className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-2 text-2xl font-bold text-neutral-900 dark:text-white">
            小熊猫 · 智能日程伙伴
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            掌控你的每一个目标，多线程无忧
          </p>
        </div>

        {/* ── Tab 切换 ── */}
        <div className="mb-6 flex rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
          {(["login", "register"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={cn(
                "flex-1 rounded-lg py-2 text-sm font-medium transition-all",
                tab === t
                  ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400"
              )}
              onClick={() => { setTab(t); setError(null); }}
            >
              {t === "login" ? "登录" : "注册"}
            </button>
          ))}
        </div>

        {/* ── Google 登录 ── */}
        {process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true" && (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={handleGoogle}
              className="mb-4 flex w-full items-center justify-center gap-3 rounded-xl border border-neutral-200 bg-white py-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              使用 Google 账号{tab === "register" ? "注册" : "登录"}
            </button>
            <div className="mb-4 flex items-center gap-3 text-xs text-neutral-400">
              <span className="flex-1 border-t border-neutral-200 dark:border-neutral-700" />
              或
              <span className="flex-1 border-t border-neutral-200 dark:border-neutral-700" />
            </div>
          </>
        )}

        {/* ── 邮箱密码表单 ── */}
        <form onSubmit={handleCredentials} className="space-y-4">
          {tab === "register" && (
            <label className="flex flex-col gap-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300">
              用户名
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:border-neutral-700 dark:bg-neutral-800"
                placeholder="你的昵称"
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            邮箱
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:border-neutral-700 dark:bg-neutral-800"
              placeholder="example@gmail.com 或 qq.com"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            密码
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 pr-11 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:border-neutral-700 dark:bg-neutral-800"
                placeholder="至少 6 位"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                onClick={() => setShowPwd((v) => !v)}
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </p>
          )}

          <GradientButton type="submit" disabled={loading} className="w-full justify-center gap-2 py-3">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {tab === "login" ? "登录" : "注册并开始使用"}
          </GradientButton>
        </form>

        {/* ── 邮箱支持说明 ── */}
        <p className="mt-4 text-center text-xs text-neutral-400">
          支持 Gmail · QQ邮箱 (qq.com) · 163邮箱 · 企业邮箱等所有邮箱
        </p>
        <p className="mt-4 text-center text-xs text-neutral-500">
          <a href="/privacy" className="hover:underline">隐私政策</a>
          {" · "}
          <a href="/terms" className="hover:underline">用户协议</a>
        </p>
      </div>
    </BackgroundGradientAnimation>
  );
}
