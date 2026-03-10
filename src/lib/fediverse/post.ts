/**
 * Fediverse（Mastodon/Misskey）への投稿機能
 */

const USER_AGENT = "movapic/1.0";
const REQUEST_TIMEOUT = 30000; // 30秒

export interface PostResult {
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}

/**
 * Mastodonにメディアをアップロード
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
    throw new Error(`メディアのアップロードに失敗しました: ${error}`);
  }

  const data = await response.json();
  return data.id;
}

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
  imageUrl: string
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
        status: `${statusText}\n\n${imageUrl}`,
        media_ids: [mediaId],
        visibility: "public",
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`投稿に失敗しました: ${error}`);
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
  imageUrl: string
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
        text: `${statusText}\n\n${imageUrl}`,
        fileIds: [fileId],
        visibility: "public",
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
