import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Google 头像（OAuth 登录后头像来源）
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // GitHub 头像（备用）
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  // 安全头（PRD 四-A 技术实现 checklist）
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
