"use client";

/**
 * 客户端 Provider 容器：SessionProvider（NextAuth）+ PWA 注册与每日推送
 */
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { RegisterSW, DailyNotification } from "@/components/pwa";

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  session?: Session | null;
}) {
  return (
    <SessionProvider session={session}>
      <RegisterSW />
      <DailyNotification />
      {children}
    </SessionProvider>
  );
}
