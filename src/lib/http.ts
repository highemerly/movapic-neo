/**
 * API ルート共通の HTTP ユーティリティ（リクエストID・キャッシュヘッダー）
 */

/**
 * ログ追跡用のリクエストIDを生成する。
 * 例: generateRequestId() → "lq3k2-9f2a" / generateRequestId("email") → "email-lq3k2-9f2a"
 */
export function generateRequestId(prefix?: string): string {
  const id = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  return prefix ? `${prefix}-${id}` : id;
}

/** 公開一覧（タイムライン/ユーザー画像）向けの短期キャッシュ */
export const CACHE_PUBLIC_SHORT = "public, max-age=10, stale-while-revalidate=30";

/** 更新頻度の低い公開データ（カレンダー等）向けの中期キャッシュ */
export const CACHE_PUBLIC_MEDIUM =
  "public, max-age=60, stale-while-revalidate=300";
