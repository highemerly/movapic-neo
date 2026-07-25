const MEDIA_PROXY_BASE_URL = process.env.MEDIA_PROXY_BASE_URL;

export function getAvatarUrl(originalUrl: string | null | undefined): string | null {
  if (!originalUrl) return null;
  if (!MEDIA_PROXY_BASE_URL) return originalUrl;
  return `${MEDIA_PROXY_BASE_URL}/proxy/image.webp?url=${encodeURIComponent(originalUrl)}&avatar=1&fallback`;
}

/**
 * Misskeyカスタム絵文字の表示用URL（メディアプロキシの絵文字モード＝128px WebP）。
 *
 * 絵文字画像は任意のFediverseサーバーに置かれているが、CSPの img-src は self /
 * メディアプロキシ / ストレージしか許可していないため、直参照はブラウザに落とされる。
 * 表示に使うURLは必ずここを通すこと。
 */
export function getEmojiImageUrl(originalUrl: string | null | undefined): string | null {
  if (!originalUrl) return null;
  if (!MEDIA_PROXY_BASE_URL) return originalUrl;
  return `${MEDIA_PROXY_BASE_URL}/proxy/image.webp?url=${encodeURIComponent(originalUrl)}&emoji=1&fallback`;
}
