import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "小熊猫 · 智能日程伙伴",
  description: "用对话管理你的创业、工作与生活，AI 帮你安排一切",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "小熊猫" },
  icons: { apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#171717",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let session = null;
  try {
    session = await getServerSession(authOptions);
  } catch (e) {
    // NEXTAUTH_SECRET 更换或 cookie 与当前 secret 不匹配时会解密失败，不阻塞渲染，用户清除 cookie 后重新登录即可
    console.warn("[layout] getServerSession failed (e.g. JWT decryption):", (e as Error).message);
  }
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}
