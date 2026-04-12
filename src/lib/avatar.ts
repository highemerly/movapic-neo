const MEDIA_PROXY_BASE_URL = process.env.MEDIA_PROXY_BASE_URL;

export function getAvatarUrl(originalUrl: string | null | undefined): string | null {
  if (!originalUrl) return null;
  if (!MEDIA_PROXY_BASE_URL) return originalUrl;
  return `${MEDIA_PROXY_BASE_URL}/proxy/image.webp?url=${encodeURIComponent(originalUrl)}&avatar=1&fallback`;
}
