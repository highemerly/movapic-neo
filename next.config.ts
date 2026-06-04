import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 開発時に許可するクロスオリジン（LAN内のスマホ等からアクセスする用）
  allowedDevOrigins: ["192.168.110.136"],
  // ネイティブモジュールをサーバーサイドでのみ使用（バンドルから除外）
  serverExternalPackages: ["skia-canvas", "sharp"],
  experimental: {
    // 20MB画像アップロードを許可
    serverActions: {
      bodySizeLimit: "20mb",
    },
    // Route Handler（API）のボディサイズ制限
    proxyClientMaxBodySize: "20mb",
  },
};

export default nextConfig;
