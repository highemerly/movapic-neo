/**
 * Fediverse投稿（Mastodon=status / Misskey=note）の存在確認・削除
 *
 * 画像削除時に「連携先に残っている投稿も消すか」を尋ねるために使う。
 * - {mastodon,misskey}StatusExists / fediverseStatusExists: 投稿がまだ存在するか
 * - delete{Mastodon,Misskey}Status / deleteFediverseStatus: 投稿を削除（既に無い場合も成功扱い）
 *
 * いずれもユーザー自身のアクセストークン（復号済み）で、
 * ユーザーのインスタンスに対して実行する。
 */

import { USER_AGENT } from "@/lib/userAgent";

const REQUEST_TIMEOUT = 15000; // 15秒

const MISSKEY_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": USER_AGENT,
};

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

/**
 * Misskeyのノートがまだ存在するか確認する（notes/show が 200 なら存在）。
 * home/followers 投稿も確認できるよう、トークン付きで叩く。
 */
export async function misskeyNoteExists(
  domain: string,
  accessToken: string,
  noteId: string
): Promise<boolean> {
  try {
    const response = await fetch(`https://${domain}/api/notes/show`, {
      method: "POST",
      headers: MISSKEY_HEADERS,
      body: JSON.stringify({ i: accessToken, noteId }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    return response.ok;
  } catch (error) {
    console.error("[fediverse] Misskeyノートの存在確認に失敗:", error);
    return false;
  }
}

/**
 * Misskeyのノートを削除する（notes/delete）。
 * すでに存在しない（NO_SUCH_NOTE / 404）場合も成功として扱う。
 * @returns 削除できた/もともと無い場合は true、失敗した場合は false
 */
export async function deleteMisskeyNote(
  domain: string,
  accessToken: string,
  noteId: string
): Promise<boolean> {
  try {
    const response = await fetch(`https://${domain}/api/notes/delete`, {
      method: "POST",
      headers: MISSKEY_HEADERS,
      body: JSON.stringify({ i: accessToken, noteId }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    // 204成功 / 404 / 既に存在しない(NO_SUCH_NOTE=400) は成功扱い
    if (response.ok || response.status === 404) {
      return true;
    }
    if (response.status === 400) {
      const detail = await response.text().catch(() => "");
      if (detail.includes("NO_SUCH_NOTE")) return true;
    }

    console.error(`[fediverse] Misskeyノート削除失敗: ${response.status}`);
    return false;
  } catch (error) {
    console.error("[fediverse] Misskeyノート削除でエラー:", error);
    return false;
  }
}

/** インスタンス種別に応じて投稿の存在を確認する */
export function fediverseStatusExists(
  type: string,
  domain: string,
  accessToken: string,
  statusId: string
): Promise<boolean> {
  return type === "misskey"
    ? misskeyNoteExists(domain, accessToken, statusId)
    : mastodonStatusExists(domain, accessToken, statusId);
}

/** インスタンス種別に応じて投稿を削除する */
export function deleteFediverseStatus(
  type: string,
  domain: string,
  accessToken: string,
  statusId: string
): Promise<boolean> {
  return type === "misskey"
    ? deleteMisskeyNote(domain, accessToken, statusId)
    : deleteMastodonStatus(domain, accessToken, statusId);
}
