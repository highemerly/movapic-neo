/*
 * SHAMEZO Service Worker
 *
 * 役割は2つ:
 *  1. Web Share Target（POST /share-target）で共有画像を受け取り投稿ページへ誘導。
 *  2. 投稿画像の CacheFirst キャッシュ（少数・FIFO）。iOS は HTTP/画像キャッシュを積極的に
 *     退避するため、リロード/再前面化のたびに投稿画像を取り直してしまう。Cache Storage は
 *     明示削除まで残るので、ここに持たせて再ダウンロードを避ける。
 *
 * 注: Web Share Target は Android Chrome 等のみ対応。iOS Safari では発火しない。
 */

const SHARED_CACHE = "shared-image";
const SHARED_KEY = "/__shared";

// 投稿画像キャッシュ。URL は不変（storageKey = YYYY/MM/DD/<uuid>.<ext>）なので CacheFirst で
// 永久保持して安全。多く持っても仕方ないので少数＋FIFO で上限管理する。
const IMG_CACHE = "post-img-v1";
const IMG_CACHE_LIMIT = 50;
// 投稿画像のパス構造（/YYYY/MM/DD/…）。env でホストが変わっても・SW 再起動で状態が消えても
// パスだけで判定できるので、オリジンの受け渡し（postMessage）が不要になる。
const POST_IMAGE_PATH = /\/\d{4}\/\d{2}\/\d{2}\//;

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
    return;
  }

  // 投稿画像（不変URL）を CacheFirst で配る。<img> の GET のみが対象。
  if (
    request.method === "GET" &&
    request.destination === "image" &&
    POST_IMAGE_PATH.test(url.pathname)
  ) {
    event.respondWith(cacheFirstImage(event));
  }
});

/**
 * 投稿画像の CacheFirst。hit ならネット無しで即返す。miss は取得してキャッシュへ入れる。
 *
 * <img> の元リクエストは no-cors なので素直に保存すると opaque（クォータのパディングが
 * 大きく iOS で丸ごと退避されやすい）。ストレージ（R2）は ACAO:* を返すので mode:'cors' で
 * 取り直し、非 opaque で保存する。失敗時は素の fetch にフォールバック（表示は諦めない）。
 */
async function cacheFirstImage(event) {
  const { request } = event;
  try {
    const cache = await caches.open(IMG_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request.url, { mode: "cors" });
    if (response && response.ok) {
      const clone = response.clone();
      // 応答は先に返し、保存＋上限トリムはバックグラウンドで（SW が途中終了しないよう waitUntil）。
      event.waitUntil(cache.put(request, clone).then(() => trimImageCache(cache)));
    }
    return response;
  } catch {
    return fetch(request);
  }
}

/**
 * FIFO で上限超過分を削除。cache.keys() は挿入順なので古い順に消せる。
 */
async function trimImageCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - IMG_CACHE_LIMIT;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

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
