/**
 * Fediverse（Mastodon / Misskey）のお気に入り連携
 *
 * Mastodonの「favourite」と Misskeyの「リアクション（❤️）」を1つの概念として扱う。
 * 連合上は favourite ⇔ リアクション が相互に伝播するため、Mastodon⇔Misskey をまたいだ
 * お気に入りも成立する（MisskeyからMastodonへ送る Like は favourite として扱われる）。
 *
 * - 読み取り（count / 一覧 上位40件）: オーナーのトークンで取得（オーナーインスタンスが正データ）
 *   - Mastodon: /statuses/:id（count）＋ /favourited_by（一覧）
 *   - Misskey:  notes/show（reactionCount）＋ notes/reactions（一覧）
 * - お気に入り操作: viewerのトークンで実行。別インスタンスは投稿を解決してから操作
 *   - Mastodon: /api/v2/search?resolve=true → /statuses/:id/favourite|unfavourite
 *   - Misskey:  /api/ap/show（uri解決）→ notes/reactions/create|delete
 *
 * 連携先の状態次第で遅延・失敗しうるため、短めのタイムアウトで呼び出すこと。
 */

import { USER_AGENT } from "@/lib/userAgent";
import { apShowNoteId, ApShowError } from "@/lib/fediverse/misskey";

const SHORT_TIMEOUT = 4000; // 4秒（オーナーインスタンス＝自前サーバーへの読み取り・お気に入り操作）
// 別インスタンスの投稿解決（search?resolve=true）は、viewerインスタンスがオーナー
// インスタンスへ連合取得しに行くため遅くなりがち。取りこぼしを減らすため長めに取る。
const RESOLVE_TIMEOUT = 10000; // 10秒

// お気に入り取得・操作の失敗理由
// "deleted":     元の投稿が存在しない（404/410）
// "forbidden":   権限不足（401/403、トークンのscope不足など）
// "unavailable": 一時的に取得不可（タイムアウト、ネットワーク、5xx等）
// "unresolved":  別インスタンスの投稿をviewer側でまだ解決できない（連合の未伝播など）。
//                searchは成功（200）したが該当statusが見つからないケース。削除とは区別する。
export type FavoriteErrorReason =
  | "deleted"
  | "forbidden"
  | "unavailable"
  | "unresolved";

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
 * - 429: unavailable（レート制限。一時的なので5xxと同じ「時間をおいて再試行」扱い）
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
  if (status === 429) return "unavailable";
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
      return "元の投稿が見つかりません（削除された可能性があります）";
    case "forbidden":
      return "お気に入り情報を取得する権限がありません。再ログインで解決する場合があります";
    case "unavailable":
      return "連携先サーバーに接続できず、お気に入り情報を取得できませんでした。時間をおいて再度お試しください";
    case "unresolved":
      return "投稿がまだあなたのサーバーに反映されていないようです。少し時間をおいて再度お試しください";
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

// ---- Misskey（リアクションで favourite を代替）----------------------------

// Mastodonのfavouriteに対応させるリアクション。Unicode絵文字なので、Misskey間でも
// Mastodonへ連合する際も「いいね/favourite」として伝わる（カスタム絵文字は連合先で化けるため避ける）。
const MISSKEY_REACTION = "❤️";

// Misskey Note（必要なフィールドのみ）
interface MisskeyNote {
  id: string;
  // 合計リアクション数。古い実装等で欠ける場合は reactions の合算でフォールバック。
  reactionCount?: number;
  reactions?: Record<string, number>;
  // トークン付きで取得したときの自分のリアクション（未リアクションは null/undefined）
  myReaction?: string | null;
}

// Misskey User（必要なフィールドのみ）
interface MisskeyUserLite {
  username: string;
  host: string | null; // ローカルユーザーは null
  name?: string | null;
  avatarUrl?: string | null;
}

interface MisskeyReaction {
  id: string;
  type: string; // リアクション絵文字
  user: MisskeyUserLite;
}

function sumReactions(note: MisskeyNote): number {
  if (typeof note.reactionCount === "number") return note.reactionCount;
  if (note.reactions) {
    return Object.values(note.reactions).reduce((a, b) => a + b, 0);
  }
  return 0;
}

function mapMisskeyFavoriter(
  user: MisskeyUserLite,
  ownerDomain: string
): CachedFavoriter {
  // リモートユーザーは host を、ローカルユーザーはオーナードメインを補う。
  // Misskey/Mastodon ともユーザーページは https://{host}/@{username} で開ける。
  const host = user.host || ownerDomain;
  return {
    acct: `${user.username}@${host}`,
    displayName: user.name || null,
    avatarUrl: user.avatarUrl || null,
    profileUrl: `https://${host}/@${user.username}`,
  };
}

const MISSKEY_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": USER_AGENT,
};

/**
 * Misskeyのエラーを分類する。
 *
 * Misskeyは削除済みノートも権限不足も大半を HTTP 400 で返すため、HTTPステータスだけでは
 * deleted と forbidden を区別できない。レスポンスボディの error.code で判別する。
 * さらに、後段（syncのpostStatus保存→次回GETでの classifyPostStatus 復元、TTL算出）が
 * Mastodonのステータス前提で動くため、Mastodon相当のステータス（deleted→404 / forbidden→403）
 * に正規化して返す。
 */
function classifyMisskeyError(
  bodyText: string,
  status: number
): { reason: FavoriteErrorReason; status: number } {
  if (bodyText.includes("NO_SUCH_NOTE")) {
    return { reason: "deleted", status: 404 };
  }
  if (
    bodyText.includes("AUTHENTICATION_FAILED") ||
    bodyText.includes("CREDENTIAL_REQUIRED") ||
    bodyText.includes("PERMISSION_DENIED") ||
    bodyText.includes("ACCESS_DENIED")
  ) {
    return { reason: "forbidden", status: 403 };
  }
  return { reason: classifyPostStatus(status) ?? "unavailable", status };
}

/**
 * オーナー（Misskey）インスタンスから、投稿のリアクション情報
 * （合計数 + リアクションしたユーザー上位40件）を取得する。失敗時は例外を投げる。
 */
export async function fetchMisskeyFavoriteData(
  ownerDomain: string,
  ownerToken: string,
  postId: string
): Promise<FavoriteData> {
  const [noteRes, reactionsRes] = await Promise.all([
    fetch(`https://${ownerDomain}/api/notes/show`, {
      method: "POST",
      headers: MISSKEY_HEADERS,
      body: JSON.stringify({ i: ownerToken, noteId: postId }),
      signal: AbortSignal.timeout(SHORT_TIMEOUT),
    }),
    fetch(`https://${ownerDomain}/api/notes/reactions`, {
      method: "POST",
      headers: MISSKEY_HEADERS,
      body: JSON.stringify({ i: ownerToken, noteId: postId, limit: 40 }),
      signal: AbortSignal.timeout(SHORT_TIMEOUT),
    }),
  ]);

  if (!noteRes.ok) {
    const text = await noteRes.text().catch(() => "");
    const { reason, status } = classifyMisskeyError(text, noteRes.status);
    throw new FavoriteError(reason, status, `note取得に失敗: ${noteRes.status}`);
  }
  if (!reactionsRes.ok) {
    const text = await reactionsRes.text().catch(() => "");
    const { reason, status } = classifyMisskeyError(text, reactionsRes.status);
    throw new FavoriteError(reason, status, `reactions取得に失敗: ${reactionsRes.status}`);
  }

  const note = (await noteRes.json()) as MisskeyNote;
  const reactions = (await reactionsRes.json()) as MisskeyReaction[];

  return {
    count: sumReactions(note),
    favoriters: reactions.map((r) => mapMisskeyFavoriter(r.user, ownerDomain)),
  };
}

/**
 * オーナーのインスタンス種別に応じてお気に入り情報を取得する。
 */
export function fetchFavoriteData(
  ownerType: string,
  ownerDomain: string,
  ownerToken: string,
  postId: string
): Promise<FavoriteData> {
  return ownerType === "misskey"
    ? fetchMisskeyFavoriteData(ownerDomain, ownerToken, postId)
    : fetchMastodonFavoriteData(ownerDomain, ownerToken, postId);
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
    signal: AbortSignal.timeout(RESOLVE_TIMEOUT),
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
    // searchは成功したが該当statusが無い＝viewerインスタンスにまだ投稿が無い。
    // 削除済みとは限らず、連合の未伝播やresolveの取りこぼしの可能性が高いため
    // "unresolved" として扱い、「削除された」ではなく「未反映」のメッセージを出す。
    throw new FavoriteError("unresolved", 404, "投稿を解決できませんでした");
  }
  return statusId;
}

interface FavoriteActionParams {
  viewerType: string; // "mastodon" | "misskey"
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

/**
 * viewer（Misskey）インスタンス上でのnoteIdを解決する。
 * 同一インスタンスならpostIdをそのまま、別インスタンスは ap/show で uri から解決。
 */
async function resolveMisskeyNoteId(params: FavoriteActionParams): Promise<string> {
  const { viewerDomain, viewerToken, ownerDomain, postId, postUrl } = params;

  if (viewerDomain === ownerDomain) {
    return postId;
  }

  let noteId: string | null;
  try {
    noteId = await apShowNoteId(viewerDomain, viewerToken, postUrl, RESOLVE_TIMEOUT);
  } catch (error) {
    const status = error instanceof ApShowError ? error.status : 0;
    throw new FavoriteError(
      classifyPostStatus(status)!,
      status,
      `投稿の解決に失敗: ${status}`
    );
  }

  if (!noteId) {
    // ap/showは成功したが note を取得できない＝viewerインスタンスにまだ未連合。
    // Mastodon側と同様 "unresolved"（未反映）として扱う。
    throw new FavoriteError("unresolved", 404, "投稿を解決できませんでした");
  }
  return noteId;
}

async function toggleMisskeyReaction(
  params: FavoriteActionParams,
  action: "favourite" | "unfavourite"
): Promise<{ favourited: boolean; count: number }> {
  const noteId = await resolveMisskeyNoteId(params);

  const endpoint =
    action === "favourite" ? "notes/reactions/create" : "notes/reactions/delete";
  const body =
    action === "favourite"
      ? { i: params.viewerToken, noteId, reaction: MISSKEY_REACTION }
      : { i: params.viewerToken, noteId };

  const response = await fetch(`https://${params.viewerDomain}/api/${endpoint}`, {
    method: "POST",
    headers: MISSKEY_HEADERS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SHORT_TIMEOUT),
  });

  if (!response.ok) {
    // 冪等性: お気に入り済みで再リアクション（ALREADY_REACTED）、未リアクションで解除
    // （NOT_REACTED）は「既に望む状態」なので成功扱いにする。
    const detail = await response.text().catch(() => "");
    const alreadyInDesiredState =
      (action === "favourite" && detail.includes("ALREADY_REACTED")) ||
      (action === "unfavourite" && detail.includes("NOT_REACTED"));
    if (!alreadyInDesiredState) {
      const { reason, status } = classifyMisskeyError(detail, response.status);
      throw new FavoriteError(reason, status, `リアクション操作に失敗: ${response.status}`);
    }
  }

  // Misskeyの reactions/create|delete は204でcountを返さないため、操作後の最新状態を
  // viewer側から取り直して即時表示に使う（federation遅延はオーナー側syncで後追い補正）。
  let count = 0;
  let favourited = action === "favourite";
  try {
    const showRes = await fetch(`https://${params.viewerDomain}/api/notes/show`, {
      method: "POST",
      headers: MISSKEY_HEADERS,
      body: JSON.stringify({ i: params.viewerToken, noteId }),
      signal: AbortSignal.timeout(SHORT_TIMEOUT),
    });
    if (showRes.ok) {
      const note = (await showRes.json()) as MisskeyNote;
      count = sumReactions(note);
      favourited = !!note.myReaction;
    }
  } catch {
    // 取得失敗時は楽観値（操作が成功した前提）を返す
  }

  return { favourited, count };
}

/** viewerのトークンで投稿をお気に入り登録（Mastodon=favourite / Misskey=リアクション） */
export function favoriteStatus(params: FavoriteActionParams) {
  return params.viewerType === "misskey"
    ? toggleMisskeyReaction(params, "favourite")
    : toggleFavorite(params, "favourite");
}

/** viewerのトークンで投稿のお気に入りを解除 */
export function unfavoriteStatus(params: FavoriteActionParams) {
  return params.viewerType === "misskey"
    ? toggleMisskeyReaction(params, "unfavourite")
    : toggleFavorite(params, "unfavourite");
}
