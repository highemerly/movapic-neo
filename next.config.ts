import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // ネイティブモジュールをサーバーサイドでのみ使用（バンドルから除外）
  serverExternalPackages: ["skia-canvas"],
};

export default nextConfig;
