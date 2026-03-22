import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // ネイティブモジュールをサーバーサイドでのみ使用（バンドルから除外）
  serverExternalPackages: ["skia-canvas", "sharp"],
  experimental: {
    // 20MB画像アップロードを許可
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
