const MEDIA_PROXY_BASE_URL = process.env.MEDIA_PROXY_BASE_URL;

// Next の openGraph.images / twitter.images に渡せる画像エントリ。
export type OgImageEntry = {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  type?: string;
};

// OG画像を持たないページ（トップ等）の既定カード画像（public/og-image.png・1200×630）。
export const DEFAULT_OG_IMAGE = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "SHAMEZO",
} as const;

/**
 * OGカード（og:image / twitter:image）用の画像URL。
 *
 * X はカード画像に AVIF を非対応のため、AVIF 出力はメディアプロキシの OGP モード
 * （`&ogp=1`）経由で WebP（クロップなし・カード向けサイズ）に変換して渡す。
 * 具体的なサイズ・品質の決定はプロキシ側に委ねる（アバターの `&avatar=1` と同じ流儀）。
 * JPEG はXがそのまま表示できるので変換しない＝プロキシ障害時も既存動線を壊さない。
 *
 * プロキシ（delivery.piyo.me 系・アバターと同じ MEDIA_PROXY_BASE_URL）:
 *   GET /proxy/image.webp?url=<元URL>&ogp=1&fallback
 *   - AVIF 入力を WebP にトランスコード、アスペクト比維持で縮小（クロップなし）
 *   - fallback: 変換失敗時は元画像を返す
 */
export function getOgImageUrl(originalUrl: string, mimeType: string): string {
  if (mimeType !== "image/avif") return originalUrl;
  if (!MEDIA_PROXY_BASE_URL) return originalUrl;
  return `${MEDIA_PROXY_BASE_URL}/proxy/image.webp?url=${encodeURIComponent(
    originalUrl
  )}&ogp=1&fallback`;
}

/**
 * 投稿画像から og:image エントリを組み立てる。
 * AVIF はプロキシで WebP 化し、サイズ決定をプロキシに委ねるため width/height は付けない
 * （X が実画像を実測する）。それ以外は寸法と type を付ける。
 */
export function buildOgImage(opts: {
  url: string;
  mimeType: string;
  alt: string;
  width?: number | null;
  height?: number | null;
}): OgImageEntry {
  const proxied = getOgImageUrl(opts.url, opts.mimeType);
  if (proxied !== opts.url) {
    return { url: proxied, alt: opts.alt, type: "image/webp" };
  }
  return {
    url: opts.url,
    ...(opts.width ? { width: opts.width } : {}),
    ...(opts.height ? { height: opts.height } : {}),
    alt: opts.alt,
    type: opts.mimeType,
  };
}
