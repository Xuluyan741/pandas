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
};

export default nextConfig;
