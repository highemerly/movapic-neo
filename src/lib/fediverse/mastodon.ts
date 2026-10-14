/**
 * Mastodon 共通ヘルパー
 *
 * viewer のサーバーでリモート投稿の URL を search?resolve=true 解決し、ローカルの status ID を得る中核。
 * お気に入り（リアクション）の投稿解決と、リプライ先の解決が共有する（Misskey 側は misskey.ts の apShowNoteId）。
 * 同一サーバー判定・エラー分類は用途ごとに違うため、呼び出し側に残す。
 */

import { USER_AGENT } from "@/lib/userAgent";

/** search が HTTPエラー（!ok）で終わったときに投げる。 */
export class SearchResolveError extends Error {
  status: number;
  constructor(status: number, message?: string) {
    super(message ?? `search resolve failed: ${status}`);
    this.name = "SearchResolveError";
    this.status = status;
  }
}

/**
 * viewer の Mastodon サーバーで url を search?resolve=true 解決し、ローカルの status ID を返す。
 * - 成功: status ID
 * - 該当なし（search は 200 だが statuses が空＝連合の未伝播・取りこぼしなど）: null
 * - HTTPエラー: SearchResolveError(status) を throw
 * - タイムアウト・接続失敗の例外は包まずそのまま投げる（お気に入り側がこの挙動に依存している）
 */
export async function searchResolveStatusId(
  viewerDomain: string,
  viewerToken: string,
  url: string,
  timeoutMs = 10000
): Promise<string | null> {
  const response = await fetch(
    `https://${viewerDomain}/api/v2/search?q=${encodeURIComponent(url)}&resolve=true&type=statuses&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(timeoutMs),
    }
  );

  if (!response.ok) {
    throw new SearchResolveError(response.status);
  }

  const data = (await response.json()) as { statuses?: { id?: string }[] };
  return data.statuses?.[0]?.id ?? null;
}
