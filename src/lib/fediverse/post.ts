/**
 * Fediverse（Mastodon/Misskey）への投稿機能
 */

import { USER_AGENT } from "@/lib/userAgent";

const REQUEST_TIMEOUT = 30000; // 30秒
const MEDIA_READY_TIMEOUT = 25000; // Mastodonメディア処理完了待ちの上限
const MEDIA_POLL_INTERVAL = 1000; // メディア処理状況のポーリング間隔

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PostResult {
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
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
  filename: string
): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: mimeType });
  formData.append("file", blob, filename);

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
    const error = await response.text();
    throw new Error(
      `メディアのアップロードに失敗しました: HTTP ${response.status} ${error}`
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
  while (Date.now() < deadline) {
    await sleep(MEDIA_POLL_INTERVAL);

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

    const body = await res.text();
    throw new Error(`メディア処理に失敗しました: HTTP ${res.status} ${body}`);
  }

  throw new Error(
    `メディア処理がタイムアウトしました（${server}, id=${mediaId}）`
  );
}

// Mastodonの公開範囲
export type MastodonVisibility = "public" | "unlisted" | "private" | "direct";

/**
 * Mastodonにステータスを投稿
 */
export async function postToMastodon(
  server: string,
  accessToken: string,
  imageBuffer: Buffer,
  mimeType: string,
  filename: string,
  statusText: string,
  imageUrl: string,
  visibility: MastodonVisibility = "public"
): Promise<PostResult> {
  try {
    // メディアをアップロード
    const mediaId = await uploadMastodonMedia(
      server,
      accessToken,
      imageBuffer,
      mimeType,
      filename
    );

    // ステータスを投稿
    const response = await fetch(`https://${server}/api/v1/statuses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        status: `${statusText}\n${imageUrl}`,
        media_ids: [mediaId],
        visibility,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`投稿に失敗しました: HTTP ${response.status} ${error}`);
    }

    const data = await response.json();
    return {
      success: true,
      postId: data.id,
      postUrl: data.url,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "投稿に失敗しました",
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
  filename: string
): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: mimeType });
  formData.append("file", blob, filename);
  formData.append("i", accessToken);

  const response = await fetch(`https://${server}/api/drive/files/create`, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
    },
    body: formData,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ファイルのアップロードに失敗しました: ${error}`);
  }

  const data = await response.json();
  return data.id;
}

// Misskeyの公開範囲
export type MisskeyVisibility = "public" | "home" | "followers" | "specified";

/**
 * Misskeyにノートを投稿
 */
export async function postToMisskey(
  server: string,
  accessToken: string,
  imageBuffer: Buffer,
  mimeType: string,
  filename: string,
  statusText: string,
  imageUrl: string,
  visibility: MisskeyVisibility = "public"
): Promise<PostResult> {
  try {
    // ファイルをアップロード
    const fileId = await uploadMisskeyFile(
      server,
      accessToken,
      imageBuffer,
      mimeType,
      filename
    );

    // ノートを投稿
    const response = await fetch(`https://${server}/api/notes/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        i: accessToken,
        text: `${statusText}\n${imageUrl}`,
        fileIds: [fileId],
        visibility,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`投稿に失敗しました: ${error}`);
    }

    const data = await response.json();
    const noteId = data.createdNote?.id;
    const postUrl = noteId ? `https://${server}/notes/${noteId}` : undefined;

    return {
      success: true,
      postId: noteId,
      postUrl,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "投稿に失敗しました",
    };
  }
}
