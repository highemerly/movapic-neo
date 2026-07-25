/**
 * Fediverse（Mastodon / Misskey）のお気に入り連携
 *
 * Mastodonの「favourite」と Misskeyの「リアクション（❤️）」を1つの概念として扱う。
 * 連合上は favourite ⇔ リアクション が相互に伝播するため、Mastodon⇔Misskey をまたいだ
 * お気に入りも成立する（MisskeyからMastodonへ送る Like は favourite として扱われる）。
 *
 * - 読み取り（count / 一覧 上位40件）: 未認証 GET（対象は public/unlisted のみで誰でも読める。
 *   オーナーインスタンスが正データ。トークンを使わないのでオーナーのトークン失効に強い）
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
import {
  FAVOURITE_KEY,
  normalizeReactionKey,
  reactionEmojisKeyToInternal,
  toMisskeyReaction,
} from "@/lib/reactions/emojiKey";

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

// favourited_by / notes/reactions のキャッシュ1件分。定義は reactions 側（マージ処理と
// 共有するため）に置き、従来の import パスを保つためここから再エクスポートする。
export type { CachedFavoriter } from "@/lib/reactions/types";

import type { CachedFavoriter } from "@/lib/reactions/types";

export interface FavoriteData {
  /** オーナーインスタンス上のリアクション/fav の合計 */
  count: number;
  /** リアクションしたユーザー上位40件 */
  favoriters: CachedFavoriter[];
  /**
   * 絵文字別カウント（正規化キー→件数）。上位40件の一覧と違い全件を数えた値なので、
   * チップの件数はこちらが正確。Mastodonは種別を持たないため { "❤": count }。
   */
  totals: Record<string, number>;
  /** カスタム絵文字キー→表示用画像URL */
  emojiUrls: Record<string, string>;
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
    // Mastodonのfavouriteは絵文字を持たないため、種別不明を表す受け皿に寄せる
    emoji: FAVOURITE_KEY,
    emojiImageUrl: null,
  };
}

/**
 * オーナーインスタンスから投稿のお気に入り情報（count + favourited_by 上位40件）を取得
 * 失敗時は例外を投げる。
 *
 * 対象は public/unlisted のみで status・favourited_by はどちらも未認証で読めるため、
 * トークンは使わない（オーナーのトークン失効に強い）。限定連合モードのインスタンスでは
 * 未認証アクセスが 401/403 で弾かれ得るが、その場合は forbidden として TTL を延ばす。
 */
export async function fetchMastodonFavoriteData(
  ownerDomain: string,
  postId: string
): Promise<FavoriteData> {
  const headers = { "User-Agent": USER_AGENT };

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
      `failed to fetch status: ${statusRes.status}`
    );
  }
  if (!favBoyRes.ok) {
    throw new FavoriteError(
      classifyPostStatus(favBoyRes.status)!,
      favBoyRes.status,
      `failed to fetch favourited_by: ${favBoyRes.status}`
    );
  }

  const status = (await statusRes.json()) as MastodonStatus;
  const accounts = (await favBoyRes.json()) as MastodonAccount[];

  const count = status.favourites_count ?? 0;
  return {
    count,
    favoriters: accounts.map((a) => mapFavoriter(a, ownerDomain)),
    totals: count > 0 ? { [FAVOURITE_KEY]: count } : {},
    emojiUrls: {},
  };
}

// ---- Misskey（リアクションで favourite を代替）----------------------------

// Misskey Note（必要なフィールドのみ）
interface MisskeyNote {
  id: string;
  // 合計リアクション数。古い実装等で欠ける場合は reactions の合算でフォールバック。
  reactionCount?: number;
  reactions?: Record<string, number>;
  // 使われているカスタム絵文字のURL（キーは "name@host"）。
  // 実サーバーで確認したとおり、ここに載るのはリモート絵文字だけで、
  // オーナー自身のローカル絵文字は含まれない（URLは別途カタログから解決する）。
  reactionEmojis?: Record<string, string>;
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
  reaction: MisskeyReaction,
  ownerDomain: string,
  emojiUrls: Record<string, string>
): CachedFavoriter {
  const user = reaction.user;
  // リモートユーザーは host を、ローカルユーザーはオーナードメインを補う。
  // Misskey/Mastodon ともユーザーページは https://{host}/@{username} で開ける。
  const host = user.host || ownerDomain;
  const emoji = normalizeReactionKey(reaction.type, ownerDomain);
  return {
    acct: `${user.username}@${host}`,
    displayName: user.name || null,
    avatarUrl: user.avatarUrl || null,
    profileUrl: `https://${host}/@${user.username}`,
    emoji,
    emojiImageUrl: emojiUrls[emoji] ?? null,
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
 *
 * public/unlisted の note は notes/show・notes/reactions とも `i` 無し（未認証）で読めるため、
 * トークンは使わない（Mastodon 側と同方針）。
 */
export async function fetchMisskeyFavoriteData(
  ownerDomain: string,
  postId: string
): Promise<FavoriteData> {
  const [noteRes, reactionsRes] = await Promise.all([
    fetch(`https://${ownerDomain}/api/notes/show`, {
      method: "POST",
      headers: MISSKEY_HEADERS,
      body: JSON.stringify({ noteId: postId }),
      signal: AbortSignal.timeout(SHORT_TIMEOUT),
    }),
    fetch(`https://${ownerDomain}/api/notes/reactions`, {
      method: "POST",
      headers: MISSKEY_HEADERS,
      body: JSON.stringify({ noteId: postId, limit: 40 }),
      signal: AbortSignal.timeout(SHORT_TIMEOUT),
    }),
  ]);

  if (!noteRes.ok) {
    const text = await noteRes.text().catch(() => "");
    const { reason, status } = classifyMisskeyError(text, noteRes.status);
    throw new FavoriteError(reason, status, `failed to fetch note: ${noteRes.status}`);
  }
  if (!reactionsRes.ok) {
    const text = await reactionsRes.text().catch(() => "");
    const { reason, status } = classifyMisskeyError(text, reactionsRes.status);
    throw new FavoriteError(reason, status, `failed to fetch reactions: ${reactionsRes.status}`);
  }

  const note = (await noteRes.json()) as MisskeyNote;
  const reactions = (await reactionsRes.json()) as MisskeyReaction[];

  const totals: Record<string, number> = {};
  for (const [raw, count] of Object.entries(note.reactions ?? {})) {
    totals[normalizeReactionKey(raw, ownerDomain)] = count;
  }
  const emojiUrls: Record<string, string> = {};
  for (const [raw, url] of Object.entries(note.reactionEmojis ?? {})) {
    emojiUrls[reactionEmojisKeyToInternal(raw, ownerDomain)] = url;
  }

  return {
    count: sumReactions(note),
    favoriters: reactions.map((r) => mapMisskeyFavoriter(r, ownerDomain, emojiUrls)),
    totals,
    emojiUrls,
  };
}

/**
 * オーナーのインスタンス種別に応じてお気に入り情報を取得する（未認証読み取り）。
 */
export function fetchFavoriteData(
  ownerType: string,
  ownerDomain: string,
  postId: string
): Promise<FavoriteData> {
  return ownerType === "misskey"
    ? fetchMisskeyFavoriteData(ownerDomain, postId)
    : fetchMastodonFavoriteData(ownerDomain, postId);
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
      `failed to resolve status: ${response.status}`
    );
  }

  const data = (await response.json()) as { statuses?: MastodonStatus[] };
  const statusId = data.statuses?.[0]?.id;
  if (!statusId) {
    // searchは成功したが該当statusが無い＝viewerインスタンスにまだ投稿が無い。
    // 削除済みとは限らず、連合の未伝播やresolveの取りこぼしの可能性が高いため
    // "unresolved" として扱い、「削除された」ではなく「未反映」のメッセージを出す。
    throw new FavoriteError("unresolved", 404, "could not resolve status");
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

/** リアクション操作後の viewer 側の状態 */
export interface ReactionActionResult {
  reacted: boolean;
  count: number;
}

async function toggleFavorite(
  params: FavoriteActionParams,
  action: "favourite" | "unfavourite"
): Promise<ReactionActionResult> {
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
      `favourite action failed: ${response.status}`
    );
  }

  const status = (await response.json()) as MastodonStatus;
  return {
    reacted: status.favourited ?? action === "favourite",
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
      `failed to resolve note: ${status}`
    );
  }

  if (!noteId) {
    // ap/showは成功したが note を取得できない＝viewerインスタンスにまだ未連合。
    // Mastodon側と同様 "unresolved"（未反映）として扱う。
    throw new FavoriteError("unresolved", 404, "could not resolve note");
  }
  return noteId;
}

/**
 * Misskey の notes/reactions/create|delete を1回呼ぶ。
 * 「既に望む状態」を表すエラーは成功として扱い、付け替えが要るケースだけ呼び出し元へ返す。
 */
async function misskeyReactionRequest(
  params: FavoriteActionParams,
  noteId: string,
  action: "create" | "delete",
  reaction?: string
): Promise<{ alreadyReacted: boolean }> {
  const response = await fetch(
    `https://${params.viewerDomain}/api/notes/reactions/${action}`,
    {
      method: "POST",
      headers: MISSKEY_HEADERS,
      body: JSON.stringify(
        action === "create"
          ? { i: params.viewerToken, noteId, reaction }
          : { i: params.viewerToken, noteId }
      ),
      signal: AbortSignal.timeout(SHORT_TIMEOUT),
    }
  );
  if (response.ok) return { alreadyReacted: false };

  const detail = await response.text().catch(() => "");
  // 冪等性: 未リアクションでの解除は「既に望む状態」なので成功扱い。
  if (action === "delete" && detail.includes("NOT_REACTED")) {
    return { alreadyReacted: false };
  }
  // Misskeyは既にリアクション済みだと（別の絵文字であっても）ALREADY_REACTED を返す。
  // 付け替えが必要かどうかの判断材料として呼び出し元へ渡す。
  if (action === "create" && detail.includes("ALREADY_REACTED")) {
    return { alreadyReacted: true };
  }
  const { reason, status } = classifyMisskeyError(detail, response.status);
  throw new FavoriteError(reason, status, `reaction ${action} failed: ${response.status}`);
}

/**
 * 操作後の viewer 側の状態を読み直す。
 * reactions/create|delete は204で件数を返さないため、即時表示用にここで取得する
 * （オーナー側との連合遅延は後追いの sync が補正する）。
 */
async function readMisskeyReactionState(
  params: FavoriteActionParams,
  noteId: string,
  optimisticReacted: boolean
): Promise<ReactionActionResult> {
  try {
    const response = await fetch(`https://${params.viewerDomain}/api/notes/show`, {
      method: "POST",
      headers: MISSKEY_HEADERS,
      body: JSON.stringify({ i: params.viewerToken, noteId }),
      signal: AbortSignal.timeout(SHORT_TIMEOUT),
    });
    if (response.ok) {
      const note = (await response.json()) as MisskeyNote;
      return { reacted: !!note.myReaction, count: sumReactions(note) };
    }
  } catch {
    // 取得失敗時は楽観値（操作が成功した前提）を返す
  }
  return { reacted: optimisticReacted, count: 0 };
}

async function sendMisskeyReaction(
  params: FavoriteActionParams,
  reaction: string
): Promise<ReactionActionResult> {
  const noteId = await resolveMisskeyNoteId(params);
  const misskeyReaction = toMisskeyReaction(reaction, params.viewerDomain);

  const created = await misskeyReactionRequest(params, noteId, "create", misskeyReaction);
  if (created.alreadyReacted) {
    // Misskeyには付け替えAPIが無いため、外してから付け直す。手元のDBではなく
    // viewerサーバーの応答で判断するので、過去の失敗でDBと実状態がズレていても収束する。
    await misskeyReactionRequest(params, noteId, "delete");
    await misskeyReactionRequest(params, noteId, "create", misskeyReaction);
  }
  return readMisskeyReactionState(params, noteId, true);
}

async function removeMisskeyReaction(
  params: FavoriteActionParams
): Promise<ReactionActionResult> {
  const noteId = await resolveMisskeyNoteId(params);
  await misskeyReactionRequest(params, noteId, "delete");
  return readMisskeyReactionState(params, noteId, false);
}

/**
 * viewerのトークンでリアクションを設定する（付け替えを含む）。
 * Mastodonはリアクションを持たないため、絵文字によらず favourite を送る
 * （選ばれた絵文字は SHAMEZO の Reaction テーブルにだけ残る）。
 */
export function sendReaction(
  params: FavoriteActionParams,
  reaction: string
): Promise<ReactionActionResult> {
  return params.viewerType === "misskey"
    ? sendMisskeyReaction(params, reaction)
    : toggleFavorite(params, "favourite");
}

/** viewerのトークンでリアクションを解除する（Mastodonは unfavourite） */
export function removeReaction(
  params: FavoriteActionParams
): Promise<ReactionActionResult> {
  return params.viewerType === "misskey"
    ? removeMisskeyReaction(params)
    : toggleFavorite(params, "unfavourite");
}
