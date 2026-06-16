/**
 * Mastodon投稿の存在確認・削除
 *
 * 画像削除時に「Mastodon側に残っている投稿も消すか」を尋ねるために使う。
 * - mastodonStatusExists: 投稿がまだ存在するか（200=あり / 404=なし）
 * - deleteMastodonStatus: 投稿を削除（既に無い場合も成功扱い）
 *
 * いずれもユーザー自身のアクセストークン（復号済み）で、
 * ユーザーのインスタンスに対して実行する。
 */

import { USER_AGENT } from "@/lib/userAgent";

const REQUEST_TIMEOUT = 15000; // 15秒

/**
 * Mastodonの投稿がまだ存在するか確認する。
 * - 200 → true（存在）
 * - 404/410 など → false（削除済み）
 * - ネットワーク/権限エラー等 → false（確証が持てないため尋ねない）
 */
export async function mastodonStatusExists(
  domain: string,
  accessToken: string,
  statusId: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://${domain}/api/v1/statuses/${statusId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      }
    );
    return response.ok;
  } catch (error) {
    console.error("[fediverse] Mastodon投稿の存在確認に失敗:", error);
    return false;
  }
}

/**
 * Mastodonの投稿を削除する。
 * すでに存在しない（404/410）場合も成功として扱う。
 * @returns 削除できた/もともと無い場合は true、失敗した場合は false
 */
export async function deleteMastodonStatus(
  domain: string,
  accessToken: string,
  statusId: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://${domain}/api/v1/statuses/${statusId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      }
    );

    if (response.ok || response.status === 404 || response.status === 410) {
      return true;
    }

    console.error(`[fediverse] Mastodon投稿削除失敗: ${response.status}`);
    return false;
  } catch (error) {
    console.error("[fediverse] Mastodon投稿削除でエラー:", error);
    return false;
  }
}
