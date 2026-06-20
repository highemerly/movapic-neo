/*
 * SHAMEZO Service Worker（Web Share Target 専用・最小実装）
 *
 * 役割は1つだけ: manifest の share_target（POST /share-target）で他アプリから
 * 共有された画像を受け取り、Cache Storage に一時保存して投稿ページへ誘導する。
 * オフラインキャッシュ等は意図的に行わない（複雑化を避ける）。
 *
 * 注: Web Share Target は Android Chrome 等のみ対応。iOS Safari では発火しない。
 */

const SHARED_CACHE = "shared-image";
const SHARED_KEY = "/__shared";

self.addEventListener("install", () => {
  // 新バージョンを即時有効化（待機させない）
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // 既存クライアントをすぐ制御下に置く
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 共有受信（POST /share-target）だけを横取りする。それ以外は通常どおり。
  if (request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(handleShareTarget(request));
  }
});

/**
 * 共有POSTを処理: 添付画像を Cache Storage に保存し、投稿ページへ 303 リダイレクト。
 * 投稿ページ側（CreateClient）が ?shared=1 を見てキャッシュから画像を取り出す。
 */
async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image");

    if (file && typeof file !== "string") {
      const cache = await caches.open(SHARED_CACHE);
      // File をそのまま Response として保存（Content-Type は file.type を引き継ぐ）
      await cache.put(
        SHARED_KEY,
        new Response(file, {
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
        }),
      );
      return Response.redirect("/create?shared=1", 303);
    }
  } catch (err) {
    // 失敗しても投稿ページは開く（画像なしの通常状態）
    console.error("[sw] share-target handling failed:", err);
  }
  return Response.redirect("/create", 303);
}
