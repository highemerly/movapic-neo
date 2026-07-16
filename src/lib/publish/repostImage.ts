/**
 * 既存画像を改めて Fediverse へ投稿する（再投稿）。
 *
 * 対象は「まだ Fediverse に投稿されていない自分の画像」＝投稿失敗（web/email）と
 * 未投稿（visibility=local で最初から連合しなかった）の両方。DB 上はどちらも
 * postId=null で区別がつかないため、postId の有無だけを対象条件にする。
 *
 * publishImage（新規レコード作成前提）とは責務が違うので流用しない。ここは
 * 「R2 の保存済み最終画像を取得 → 投稿 → 既存レコードの postUrl/postId を更新」に特化する。
 * 投稿部分（リトライ込み）だけ postImageToFediverse を共有する。
 *
 * 実績は初回保存時に付与済み（web/email は投稿成否に関係なく付与）なので再評価しない。
 * また「Fediverseにはナイショ」(local-only) 実績は grant-only の設計上、再投稿しても剥奪されない。
 */

import prisma from "@/lib/db";
import { getImage } from "@/lib/storage/storage";
import { userPathSegment } from "@/lib/userHandle";
import {
  postImageToFediverse,
  type PublishUser,
} from "@/lib/publish/publishImage";
import type { PublishVisibility } from "@/lib/visibility";

/**
 * SHAMEZO への保存(createdAt)から再投稿を許可する期間。
 *
 * お気に入り同期の窓が createdAt 基準（periodic は最長16日・成熟14日、
 * favoriteSyncQuery.ts / favoritePolicy.ts）なので、それを確実に下回る7日に制限する。
 * これで再投稿画像も periodic とオンデマンド両方の同期対象に収まり、
 * 「createdAt が古すぎて連合直後なのに同期窓から外れる」乖離を根本から防ぐ。
 */
export const REPOST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** 再投稿可能か（オーナー判定は含まない。UI/サーバー双方で共有する純関数）。 */
export function isImageRepostable(
  image: { postId: string | null; createdAt: Date },
  now: number = Date.now()
): boolean {
  // 既に Fediverse 投稿済みなら不可（二重投稿防止）。
  if (image.postId) return false;
  // 保存から一定期間を過ぎたものは不可。
  return now - image.createdAt.getTime() <= REPOST_MAX_AGE_MS;
}

/** 再投稿を拒否する理由。route 側で HTTP ステータスに対応づける。 */
export type RepostFailure =
  | "not_found"
  | "forbidden"
  | "already_posted"
  | "too_old"
  | "no_image_data";

export interface RepostResult {
  /** リクエストとして正常に処理できたか（Fediverse 投稿の成否とは別）。 */
  ok: boolean;
  /** ok=false のときの拒否理由。 */
  failure?: RepostFailure;
  /** Fediverse 投稿に成功した場合の投稿URL。 */
  postUrl?: string;
  /** 画像は処理できたが Fediverse 投稿だけ失敗した場合のエラー。 */
  postError?: string;
  postErrorStatus?: number;
}

function buildImagePageUrl(username: string, domain: string, imageId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return `${appUrl}/u/${userPathSegment(username, domain)}/status/${imageId}`;
}

/**
 * 既存画像を Fediverse へ再投稿する。
 *
 * visibility に "local" は渡さない（連合しない＝再投稿の意味がない）。呼び出し側で弾く。
 */
export async function repostImage(params: {
  imageId: string;
  /** 復号済みトークンを含む投稿ユーザー（getCurrentUserWithValidation + decryptToken から組む）。 */
  user: PublishUser;
  visibility: Exclude<PublishVisibility, "local">;
  now?: number;
}): Promise<RepostResult> {
  const { imageId, user, visibility, now = Date.now() } = params;

  const image = await prisma.image.findUnique({
    where: { id: imageId },
    select: {
      userId: true,
      storageKey: true,
      mimeType: true,
      filename: true,
      overlayText: true,
      altText: true,
      postId: true,
      createdAt: true,
    },
  });

  if (!image) return { ok: false, failure: "not_found" };
  if (image.userId !== user.id) return { ok: false, failure: "forbidden" };
  if (image.postId) return { ok: false, failure: "already_posted" };
  if (!isImageRepostable({ postId: image.postId, createdAt: image.createdAt }, now)) {
    return { ok: false, failure: "too_old" };
  }

  // 保存済みの最終画像（文字入れ済み）を R2 から取得。再レンダリングは不要。
  const buffer = await getImage(image.storageKey);
  if (!buffer) return { ok: false, failure: "no_image_data" };

  const imagePageUrl = buildImagePageUrl(
    user.username,
    user.instance.domain,
    imageId
  );

  const postResult = await postImageToFediverse({
    user,
    buffer,
    contentType: image.mimeType,
    filename: image.filename,
    text: image.overlayText,
    imagePageUrl,
    visibility,
    altText: image.altText,
  });

  // 投稿成功時のみ postUrl/postId を書き込む（publishImage の成功時分岐と同一）。
  // 失敗時はレコードを触らず、postId=null のまま＝再挑戦可能な状態を維持する。
  if (postResult?.success && postResult.postUrl) {
    await prisma.image.update({
      where: { id: imageId },
      data: { postUrl: postResult.postUrl, postId: postResult.postId },
    });
    return { ok: true, postUrl: postResult.postUrl };
  }

  return {
    ok: true,
    postError: postResult?.error ?? "投稿に失敗しました",
    postErrorStatus: postResult?.statusCode,
  };
}
