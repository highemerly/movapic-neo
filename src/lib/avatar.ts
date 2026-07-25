import { isShamezoEmojiKey } from "@/lib/reactions/emojiKey";

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

/**
 * リアクションチップの絵文字画像URLを、キーの種別に応じて解決する。
 *
 * SHAMEZO 独自カスタム絵文字（":name@shamezo:"）は自前ストレージ配信なので、メディアプロキシを
 * 通さず URL をそのまま返す（プロキシの 128px WebP 再エンコードはアニメーション(APNG/GIF)を潰すため）。
 * それ以外（Fediverse インスタンス由来のカスタム絵文字）は従来どおりプロキシ経由にする。
 * CSP img-src は self / メディアプロキシ / ストレージ公開URL を許可済み（src/proxy.ts）。
 */
export function getReactionEmojiImageUrl(
  emojiKey: string,
  originalUrl: string | null | undefined
): string | null {
  if (!originalUrl) return null;
  if (isShamezoEmojiKey(emojiKey)) return originalUrl;
  return getEmojiImageUrl(originalUrl);
}
