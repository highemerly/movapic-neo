/**
 * Fediverse（Mastodon/Misskey）への投稿機能
 */

import { USER_AGENT } from "@/lib/userAgent";
import { truncateGraphemes } from "@/lib/text/grapheme";

const REQUEST_TIMEOUT = 30000; // 30秒
const MEDIA_READY_TIMEOUT = 25000; // Mastodonメディア処理完了待ちの上限
const MEDIA_POLL_INTERVAL = 1000; // メディア処理状況のポーリング間隔

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fediverseサーバーが HTTP エラー応答を返したことを表すエラー。
 * status（サーバーが返したステータスコード）を保持し、PostResult.statusCode に伝える。
 * タイムアウト・接続失敗（status を持たない）と区別するために使う。
 */
class FediverseHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "FediverseHttpError";
    this.status = status;
  }
}

/**
 * Mastodon との往復の失敗を1行で記録する。
 * 投稿失敗が「どの往復で・誰が返した何なのか」（Mastodon本体 / 前段のリバースプロキシ）を
 * 切り分けられないと原因に辿り着けないため、ステータスに加えて応答元のヘッダと body も残す。
 * （Mastodon 4.7.2 の AVIF 500 は、この body が唯一の手がかりだった）
 * 成功時は出さない＝投稿ごとに出る定常ログにしない。
 */
function logMastodon(step: string, fields: Record<string, unknown>): void {
  const body = Object.entries(fields)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
  console.log(`[fediverse:mastodon] ${step} ${body}`);
}

/**
 * 応答の出所を示すヘッダ（500がアプリ由来かゲートウェイ由来かの判別に使う）。
 * server ヘッダを via に載せ替えるのは、投稿先ドメインを示す server フィールドと
 * キーが衝突して一方が消えるため。
 */
function responseMeta(res: Response): Record<string, unknown> {
  return {
    status: res.status,
    via: res.headers.get("server") ?? "",
    contentType: res.headers.get("content-type") ?? "",
    requestId: res.headers.get("x-request-id") ?? "",
  };
}

/**
 * Fediverse API のエラーレスポンスから、エラーメッセージ末尾に付ける詳細文字列を作る。
 * 503/504（ゲートウェイの一時障害）はレスポンスbodyが巨大なHTMLエラーページのことが多く、
 * そのまま露出しても意味がない・ノイズになるため body は読まずステータスのみ返す。
 */
async function fediverseErrorDetail(response: Response): Promise<string> {
  if (response.status === 503 || response.status === 504) {
    return `HTTP ${response.status}`;
  }
  const body = await response.text();
  return `HTTP ${response.status} ${body}`;
}

export interface PostResult {
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
  /** サーバーが HTTP エラー応答を返した場合のステータスコード（タイムアウト等では undefined） */
  statusCode?: number;
  /**
   * replyToId を指定したが、サーバーが返信先を無効と応答したため返信なしで投稿し直した。
   * 単独投稿としては成功している（success=true）。docs/reply.md「繋げられないケース」。
   */
  replyDropped?: boolean;
}

/**
 * postToMastodon / postToMisskey の引数。
 * 位置引数が10個に増えると呼び出し元（publishImage / カレンダーコラージュ）で取り違えやすいため
 * オブジェクトで受ける。
 */
export interface PostToFediverseParams<V extends string> {
  server: string;
  accessToken: string;
  imageBuffer: Buffer;
  mimeType: string;
  filename: string;
  statusText: string;
  /**
   * 本文末尾に付ける画像ページURL。空文字なら付けない（カレンダー画像などサービス側にページを
   * 持たない投稿はメディア＋本文のみで投稿する）。
   */
  imageUrl: string;
  visibility?: V;
  altText?: string;
  /**
   * リプライ先の status / note ID（投稿者自身のインスタンス上のID）。null/undefined=単独投稿。
   * Mastodon は in_reply_to_id・Misskey は replyId として送る。
   */
  replyToId?: string | null;
}

/**
 * Mastodonにメディアをアップロードし、処理完了後の media id を返す。
 *
 * Mastodon は重いメディア（AVIF等）を非同期処理し、POST /api/v2/media が
 * 202 Accepted（url=null）を返すことがある。処理が完了する前に status へ添付すると
 * 422「しばらくしてからもう一度お試しください」で弾かれるため、
 * GET /api/v1/media/:id が 200（=処理完了, url 確定）を返すまで待ってから id を返す。
 * （同一インスタンス宛だと処理が速く間に合うが、リモート宛だと間に合わず失敗していた）
 */
async function uploadMastodonMedia(
  server: string,
  accessToken: string,
  imageBuffer: Buffer,
  mimeType: string,
  filename: string,
  altText?: string
): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: mimeType });
  formData.append("file", blob, filename);
  // 代替テキスト（ALT）。未設定なら送らない。Mastodon の description 上限は約1500字。
  if (altText) formData.append("description", altText);

  const response = await fetch(`https://${server}/api/v2/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": USER_AGENT,
    },
    body: formData,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!response.ok) {
    logMastodon("media.upload.failed", {
      server,
      mimeType,
      bytes: imageBuffer.length,
      altLength: altText?.length ?? 0,
      ...responseMeta(response),
      body: (await response.clone().text()).slice(0, 1000),
    });
    throw new FediverseHttpError(
      `メディアのアップロードに失敗しました: ${await fediverseErrorDetail(response)}`,
      response.status
    );
  }

  const data = await response.json();

  // 200 かつ url 確定済みなら即利用可。202 や url=null は処理中なので完了を待つ。
  if (response.status !== 200 || !data.url) {
    await waitForMastodonMediaReady(server, accessToken, data.id);
  }

  return data.id;
}

/**
 * GET /api/v1/media/:id をポーリングし、メディア処理の完了を待つ。
 * 200=完了, 206=処理中（継続）, それ以外（404/422等）は処理失敗として throw。
 */
async function waitForMastodonMediaReady(
  server: string,
  accessToken: string,
  mediaId: string
): Promise<void> {
  const deadline = Date.now() + MEDIA_READY_TIMEOUT;
  let attempt = 0;
  while (Date.now() < deadline) {
    await sleep(MEDIA_POLL_INTERVAL);
    attempt += 1;

    const res = await fetch(`https://${server}/api/v1/media/${mediaId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (res.status === 200) return; // 処理完了
    if (res.status === 206) continue; // まだ処理中

    logMastodon("media.poll.failed", {
      mediaId,
      attempt,
      ...responseMeta(res),
      body: (await res.clone().text()).slice(0, 1000),
    });
    throw new FediverseHttpError(
      `メディア処理に失敗しました: ${await fediverseErrorDetail(res)}`,
      res.status
    );
  }

  throw new Error(
    `メディア処理がタイムアウトしました（${server}, id=${mediaId}）`
  );
}

// Mastodonの公開範囲
export type MastodonVisibility = "public" | "unlisted" | "private" | "direct";

/**
 * Mastodon が「返信先が無い／見えない」と応答したか。
 * Mastodon は in_reply_to_id の status を見つけられない（削除済み・閲覧権限なし）と 404 を返す
 * （StatusesController#set_thread）。メディアや本文の不正は 422 なので区別できる。
 */
function isMastodonReplyTargetInvalid(status: number): boolean {
  return status === 404;
}

/**
 * Mastodonにステータスを投稿
 */
export async function postToMastodon(
  params: PostToFediverseParams<MastodonVisibility>
): Promise<PostResult> {
  const {
    server,
    accessToken,
    imageBuffer,
    mimeType,
    filename,
    statusText,
    imageUrl,
    visibility = "public",
    altText,
    replyToId,
  } = params;
  try {
    // メディアをアップロード
    const mediaId = await uploadMastodonMedia(
      server,
      accessToken,
      imageBuffer,
      mimeType,
      filename,
      altText
    );

    const createStatus = (inReplyToId: string | null | undefined) =>
      fetch(`https://${server}/api/v1/statuses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify({
          status: imageUrl ? `${statusText}\n${imageUrl}` : statusText,
          media_ids: [mediaId],
          visibility,
          ...(inReplyToId ? { in_reply_to_id: inReplyToId } : {}),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

    // ステータスを投稿
    let response = await createStatus(replyToId);
    let replyDropped = false;

    // 返信先がサーバー上で消えている（Fediverse 側だけで削除された等）と、返信付きの投稿は
    // 何度送っても失敗する。「連」は常に直前の投稿へ繋ぐため、放置すると以後の投稿が恒久失敗する。
    // 返信先が原因と確定できる応答のときだけ、アップロード済みメディアを使って返信なしで1回送り直す。
    if (!response.ok && replyToId && isMastodonReplyTargetInvalid(response.status)) {
      logMastodon("status.reply_target_invalid", {
        server,
        replyToId,
        ...responseMeta(response),
        body: (await response.clone().text()).slice(0, 1000),
      });
      response = await createStatus(null);
      replyDropped = true;
    }

    if (!response.ok) {
      logMastodon("status.failed", {
        server,
        mediaId,
        visibility,
        ...responseMeta(response),
        body: (await response.clone().text()).slice(0, 1000),
      });
      throw new FediverseHttpError(
        `投稿に失敗しました: ${await fediverseErrorDetail(response)}`,
        response.status
      );
    }

    const data = await response.json();
    return {
      success: true,
      postId: data.id,
      postUrl: data.url,
      ...(replyDropped ? { replyDropped } : {}),
    };
  } catch (error) {
    // HTTP エラーは各往復の時点で応答内容ごと記録済み。ここで拾うのはタイムアウトや
    // 接続断など応答が無かった失敗で、原因は cause にしか出ない。
    if (!(error instanceof FediverseHttpError)) {
      logMastodon("post.error", {
        server,
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
        cause:
          error instanceof Error && error.cause
            ? String((error.cause as { message?: string }).message ?? error.cause)
            : "",
      });
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "投稿に失敗しました",
      statusCode: error instanceof FediverseHttpError ? error.status : undefined,
    };
  }
}

/**
 * Misskeyにファイルをアップロード
 */
async function uploadMisskeyFile(
  server: string,
  accessToken: string,
  imageBuffer: Buffer,
  mimeType: string,
  filename: string,
  altText?: string
): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: mimeType });
  formData.append("file", blob, filename);
  formData.append("i", accessToken);
  // 代替テキスト（ALT）。Misskey の comment 上限は512字なので切り詰める。未設定なら送らない。
  // 書記素境界で切る（結合絵文字・サロゲートペアを途中で割らない）。
  if (altText) formData.append("comment", truncateGraphemes(altText, 512));

  const response = await fetch(`https://${server}/api/drive/files/create`, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
    },
    body: formData,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!response.ok) {
    throw new FediverseHttpError(
      `ファイルのアップロードに失敗しました: ${await fediverseErrorDetail(response)}`,
      response.status
    );
  }

  const data = await response.json();
  return data.id;
}

// Misskeyの公開範囲
export type MisskeyVisibility = "public" | "home" | "followers" | "specified";

/**
 * Misskey が「返信先が無い／返信できない」と応答したときの error.code。
 * いずれも返信先ノート側の状態（削除済み・不可視・ブロック）が原因で、返信を外せば投稿できる。
 */
const MISSKEY_REPLY_TARGET_INVALID_CODES = new Set([
  "NO_SUCH_REPLY_TARGET",
  "CANNOT_REPLY_TO_AN_INVISIBLE_NOTE",
  "YOU_HAVE_BEEN_BLOCKED",
]);

async function isMisskeyReplyTargetInvalid(response: Response): Promise<boolean> {
  if (response.status !== 400) return false;
  try {
    const body = (await response.clone().json()) as { error?: { code?: string } };
    return MISSKEY_REPLY_TARGET_INVALID_CODES.has(body.error?.code ?? "");
  } catch {
    return false;
  }
}

/**
 * Misskeyにノートを投稿
 */
export async function postToMisskey(
  params: PostToFediverseParams<MisskeyVisibility>
): Promise<PostResult> {
  const {
    server,
    accessToken,
    imageBuffer,
    mimeType,
    filename,
    statusText,
    imageUrl,
    visibility = "public",
    altText,
    replyToId,
  } = params;
  try {
    // ファイルをアップロード
    const fileId = await uploadMisskeyFile(
      server,
      accessToken,
      imageBuffer,
      mimeType,
      filename,
      altText
    );

    const createNote = (replyId: string | null | undefined) =>
      fetch(`https://${server}/api/notes/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify({
          i: accessToken,
          text: imageUrl ? `${statusText}\n${imageUrl}` : statusText,
          fileIds: [fileId],
          visibility,
          ...(replyId ? { replyId } : {}),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

    // ノートを投稿
    let response = await createNote(replyToId);
    let replyDropped = false;

    // Mastodon と同じ理由（返信先が消えていると以後の「連」が恒久失敗する）で、
    // 返信先が原因と確定できる応答のときだけ、アップロード済みファイルで返信なしで1回送り直す。
    if (!response.ok && replyToId && (await isMisskeyReplyTargetInvalid(response))) {
      console.log(
        `[fediverse:misskey] note.reply_target_invalid server=${server} replyToId=${replyToId} ` +
          `body=${(await response.clone().text()).slice(0, 1000)}`
      );
      response = await createNote(null);
      replyDropped = true;
    }

    if (!response.ok) {
      throw new FediverseHttpError(
        `投稿に失敗しました: ${await fediverseErrorDetail(response)}`,
        response.status
      );
    }

    const data = await response.json();
    const noteId = data.createdNote?.id;
    const postUrl = noteId ? `https://${server}/notes/${noteId}` : undefined;

    return {
      success: true,
      postId: noteId,
      postUrl,
      ...(replyDropped ? { replyDropped } : {}),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "投稿に失敗しました",
      statusCode: error instanceof FediverseHttpError ? error.status : undefined,
    };
  }
}
