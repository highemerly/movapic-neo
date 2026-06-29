/**
 * Misskey 共通ヘルパー
 *
 * viewer のサーバーでリモート投稿の uri を ap/show 解決し、ローカルの noteId を得る中核。
 * お気に入り（リアクション）の投稿解決と、「あなたのサーバーで開く」の解決が共有する。
 * 同一サーバー判定・エラー分類・入力の組み立ては用途ごとに違うため、呼び出し側に残す。
 */

import { USER_AGENT } from "@/lib/userAgent";

const MISSKEY_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": USER_AGENT,
};

/** ap/show が HTTPエラー（!ok）/接続失敗で終わったときに投げる。status=0 は接続失敗。 */
export class ApShowError extends Error {
  status: number;
  constructor(status: number, message?: string) {
    super(message ?? `ap/show failed: ${status}`);
    this.name = "ApShowError";
    this.status = status;
  }
}

/**
 * viewer の Misskey サーバーで uri を ap/show 解決し、ローカルの noteId を返す。
 * - 成功（type=Note）: noteId
 * - 解決できない（Note以外 / object.id 無し＝未連合など）: null
 * - HTTPエラー: ApShowError(status) を throw（接続失敗/タイムアウトは status=0）
 */
export async function apShowNoteId(
  viewerDomain: string,
  viewerToken: string,
  uri: string,
  timeoutMs = 10000
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(`https://${viewerDomain}/api/ap/show`, {
      method: "POST",
      headers: MISSKEY_HEADERS,
      body: JSON.stringify({ i: viewerToken, uri }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // タイムアウト・ネットワーク等のレスポンス無し
    throw new ApShowError(0, error instanceof Error ? error.message : undefined);
  }

  if (!response.ok) {
    throw new ApShowError(response.status);
  }

  const data = (await response.json()) as {
    type?: string;
    object?: { id?: string };
  };
  if (data.type !== "Note" || !data.object?.id) {
    return null;
  }
  return data.object.id;
}
