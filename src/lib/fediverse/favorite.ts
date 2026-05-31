/**
 * Mastodonのお気に入り連携
 *
 * - 読み取り（count / favourited_by）: オーナーのトークンで取得（オーナーインスタンスが正データ）
 * - お気に入り操作: viewerのトークンで実行。別インスタンスはsearch?resolveで投稿を解決してから操作
 *
 * Mastodonの状態次第で遅延・失敗しうるため、短めのタイムアウトで呼び出すこと。
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const USER_AGENT = APP_URL ? `movapic/1.0 (+${APP_URL})` : "movapic/1.0";
const SHORT_TIMEOUT = 4000; // 4秒

// お気に入り取得・操作の失敗理由
// "deleted":     元の投稿が存在しない（404/410）
// "forbidden":   権限不足（401/403、トークンのscope不足など）
// "unavailable": 一時的に取得不可（タイムアウト、ネットワーク、5xx等）
export type FavoriteErrorReason = "deleted" | "forbidden" | "unavailable";

export class FavoriteError extends Error {
  reason: FavoriteErrorReason;
  /** 0 = 接続失敗・タイムアウト（HTTPレスポンス無し） */
  httpStatus: number;
  constructor(reason: FavoriteErrorReason, httpStatus: number, message?: string) {
    super(message ?? reason);
    this.name = "FavoriteError";
    this.reason = reason;
    this.httpStatus = httpStatus;
  }
}

/**
 * HTTP status → FavoriteErrorReason
 * - 2xx: null（成功）
 * - 404/410: deleted
 * - 401/403: forbidden
 * - その他4xx: forbidden扱い
 * - 5xx / 0(接続失敗): unavailable
 */
export function classifyPostStatus(
  status: number | null | undefined
): FavoriteErrorReason | null {
  if (status == null) return null;
  if (status >= 200 && status < 300) return null;
  if (status === 404 || status === 410) return "deleted";
  if (status === 401 || status === 403) return "forbidden";
  if (status >= 400 && status < 500) return "forbidden";
  if (status === 0 || (status >= 500 && status < 600)) return "unavailable";
  return "unavailable";
}

/** 任意のエラーをFavoriteErrorReasonに分類（FavoriteError以外はunavailable扱い） */
export function toFavoriteReason(error: unknown): FavoriteErrorReason {
  return error instanceof FavoriteError ? error.reason : "unavailable";
}

/** 任意のエラーから推定HTTP status（FavoriteErrorで無ければ0=接続失敗） */
export function toFavoriteHttpStatus(error: unknown): number {
  return error instanceof FavoriteError ? error.httpStatus : 0;
}

/** 理由→ユーザー向けメッセージ。nullなら正常 */
export function favoriteErrorMessage(
  reason: FavoriteErrorReason | null | undefined
): string | null {
  switch (reason) {
    case "deleted":
      return "元のMastodon投稿が見つかりません（削除された可能性があります）";
    case "forbidden":
      return "お気に入り情報を取得する権限がありません。再ログインで解決する場合があります";
    case "unavailable":
      return "Mastodonサーバーに接続できず、お気に入り情報を取得できませんでした。時間をおいて再度お試しください";
    default:
      return null;
  }
}

// favourited_byのキャッシュ1件分
export interface CachedFavoriter {
  acct: string;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
}

export interface FavoriteData {
  count: number;
  favoriters: CachedFavoriter[];
}

// Mastodon Account（必要なフィールドのみ）
interface MastodonAccount {
  acct: string;
  display_name?: string;
  avatar?: string;
  url?: string;
}

interface MastodonStatus {
  id: string;
  favourited?: boolean;
  favourites_count?: number;
}

/**
 * acctをオーナーインスタンス視点で正規化（ローカルユーザーは @domain を補う）
 * 例: "alice" + "handon.club" → "alice@handon.club"
 */
export function normalizeAcct(acct: string, ownerDomain: string): string {
  return acct.includes("@") ? acct : `${acct}@${ownerDomain}`;
}

function mapFavoriter(account: MastodonAccount, ownerDomain: string): CachedFavoriter {
  return {
    acct: normalizeAcct(account.acct, ownerDomain),
    displayName: account.display_name || null,
    avatarUrl: account.avatar || null,
    profileUrl: account.url || null,
  };
}

/**
 * オーナーインスタンスから投稿のお気に入り情報（count + favourited_by 上位40件）を取得
 * 失敗時は例外を投げる
 */
export async function fetchMastodonFavoriteData(
  ownerDomain: string,
  ownerToken: string,
  postId: string
): Promise<FavoriteData> {
  const headers = {
    Authorization: `Bearer ${ownerToken}`,
    "User-Agent": USER_AGENT,
  };

  const [statusRes, favBoyRes] = await Promise.all([
    fetch(`https://${ownerDomain}/api/v1/statuses/${postId}`, {
      headers,
      signal: AbortSignal.timeout(SHORT_TIMEOUT),
    }),
    fetch(`https://${ownerDomain}/api/v1/statuses/${postId}/favourited_by?limit=40`, {
      headers,
      signal: AbortSignal.timeout(SHORT_TIMEOUT),
    }),
  ]);

  if (!statusRes.ok) {
    throw new FavoriteError(
      classifyPostStatus(statusRes.status)!,
      statusRes.status,
      `status取得に失敗: ${statusRes.status}`
    );
  }
  if (!favBoyRes.ok) {
    throw new FavoriteError(
      classifyPostStatus(favBoyRes.status)!,
      favBoyRes.status,
      `favourited_by取得に失敗: ${favBoyRes.status}`
    );
  }

  const status = (await statusRes.json()) as MastodonStatus;
  const accounts = (await favBoyRes.json()) as MastodonAccount[];

  return {
    count: status.favourites_count ?? 0,
    favoriters: accounts.map((a) => mapFavoriter(a, ownerDomain)),
  };
}

/**
 * viewerインスタンス上でのstatus IDを解決する
 * 同一インスタンスならpostIdをそのまま、別インスタンスはsearch?resolveで解決
 */
async function resolveViewerStatusId(params: {
  viewerDomain: string;
  viewerToken: string;
  ownerDomain: string;
  postId: string;
  postUrl: string;
}): Promise<string> {
  const { viewerDomain, viewerToken, ownerDomain, postId, postUrl } = params;

  if (viewerDomain === ownerDomain) {
    return postId;
  }

  const url = `https://${viewerDomain}/api/v2/search?q=${encodeURIComponent(postUrl)}&resolve=true&type=statuses&limit=1`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${viewerToken}`,
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(SHORT_TIMEOUT),
  });

  if (!response.ok) {
    throw new FavoriteError(
      classifyPostStatus(response.status)!,
      response.status,
      `投稿の解決に失敗: ${response.status}`
    );
  }

  const data = (await response.json()) as { statuses?: MastodonStatus[] };
  const statusId = data.statuses?.[0]?.id;
  if (!statusId) {
    // viewerインスタンスから投稿が見えない＝削除orフェデレーション失敗扱い
    throw new FavoriteError("deleted", 404, "投稿を解決できませんでした");
  }
  return statusId;
}

interface FavoriteActionParams {
  viewerDomain: string;
  viewerToken: string;
  ownerDomain: string;
  postId: string;
  postUrl: string;
}

async function toggleFavorite(
  params: FavoriteActionParams,
  action: "favourite" | "unfavourite"
): Promise<{ favourited: boolean; count: number }> {
  const localStatusId = await resolveViewerStatusId(params);

  const response = await fetch(
    `https://${params.viewerDomain}/api/v1/statuses/${localStatusId}/${action}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.viewerToken}`,
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(SHORT_TIMEOUT),
    }
  );

  if (!response.ok) {
    throw new FavoriteError(
      classifyPostStatus(response.status)!,
      response.status,
      `お気に入り操作に失敗: ${response.status}`
    );
  }

  const status = (await response.json()) as MastodonStatus;
  return {
    favourited: status.favourited ?? action === "favourite",
    count: status.favourites_count ?? 0,
  };
}

/** viewerのトークンで投稿をお気に入り登録 */
export function favoriteMastodonStatus(params: FavoriteActionParams) {
  return toggleFavorite(params, "favourite");
}

/** viewerのトークンで投稿のお気に入りを解除 */
export function unfavoriteMastodonStatus(params: FavoriteActionParams) {
  return toggleFavorite(params, "unfavourite");
}
