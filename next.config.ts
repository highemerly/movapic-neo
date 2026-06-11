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
    ];
  },
};

export default nextConfig;

// OpenNext の Cloudflare バインディング初期化は開発時のみ実行する。
// 本番ビルド（next build / Docker standalone）では workerd を起動しようとして ENOENT で失敗するため、
// NODE_ENV が development のときに限定する。
if (process.env.NODE_ENV === "development") {
  void import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
}
