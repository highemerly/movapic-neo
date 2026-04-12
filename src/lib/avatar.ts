const MEDIA_PROXY_BASE = "https://delivery.piyo.me/proxy/image.webp";

export function getAvatarUrl(originalUrl: string | null | undefined): string | null {
  if (!originalUrl) return null;
  return `${MEDIA_PROXY_BASE}?url=${encodeURIComponent(originalUrl)}&avatar=1&fallback`;
}
