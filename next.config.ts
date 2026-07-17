import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 開発時に許可するクロスオリジン（LAN内のスマホ等からアクセスする用）
  allowedDevOrigins: ["192.168.110.136", "192.168.110.146"],
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
  async redirects() {
    return [
      // 旧「技術仕様」URL（/spec）は「ドキュメント」（/docs）へ恒久リダイレクト。
      { source: "/spec", destination: "/docs", permanent: true },
      { source: "/spec/:path*", destination: "/docs/:path*", permanent: true },
      // 設定は /dashboard 配下から /settings 配下へ移動。旧URL（ブックマーク）を恒久リダイレクト。
      { source: "/dashboard/sessions", destination: "/settings/sessions", permanent: true },
      { source: "/dashboard/delete", destination: "/settings/delete", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*.:ext(svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400",
          },
        ],
      },
      {
        // Service Worker は更新を即時反映させたいのでキャッシュさせない
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
