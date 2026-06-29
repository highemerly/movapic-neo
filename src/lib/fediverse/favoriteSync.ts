/**
 * お気に入りキャッシュの同期。
 *
 * オーナーのトークンで Fediverse（Mastodon/Misskey）から count + favourited_by 上位40件を
 * 取得し、Image.favoriteCount / favoritersCache / favoritesSyncedAt / postStatus を更新する。
 *
 * 呼び出し元は2つ:
 * - 画像詳細ページの GET（TTL切れ時）/ POST・DELETE（操作直後）… route.ts
 * - 定期ジョブのフォールバック sync … src/lib/periodic/index.ts
 *
 * sharp/skia には触れないため worker-front から呼んでも安全。
 */

import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { decryptToken } from "@/lib/auth/tokens";
import {
  fetchFavoriteData,
  toFavoriteReason,
  toFavoriteHttpStatus,
  type CachedFavoriter,
  type FavoriteErrorReason,
} from "@/lib/fediverse/favorite";
import { reconcileFavoriteNotificationSafely } from "@/lib/notifications/favoriteNotifications";

export type ImageForFavorite = Prisma.ImageGetPayload<{
  include: { user: { include: { instance: true } } };
}>;

export function readCache(image: ImageForFavorite): CachedFavoriter[] {
  return (image.favoritersCache as unknown as CachedFavoriter[] | null) ?? [];
}

export interface SyncResult {
  count: number;
  favoriters: CachedFavoriter[];
  errorReason: FavoriteErrorReason | null;
}

/**
 * オーナーのトークンで Fediverse からお気に入り情報を取得し、キャッシュを更新する。
 * 成功/失敗いずれも postStatus と favoritesSyncedAt を記録する。次回の TTL は computeCacheTtl が
 * postStatus に応じて延長する（4xx→1日、429/5xx/接続失敗→1時間）→ 結果的に連打を防げる。
 */
export async function syncFavoriteCache(
  image: ImageForFavorite
): Promise<SyncResult> {
  try {
    const ownerToken = decryptToken(image.user.accessToken);
    const data = await fetchFavoriteData(
      image.user.instance.type,
      image.user.instance.domain,
      ownerToken,
      image.postId!
    );
    // 更新前の状態（差分の基準）を退避してから上書きする
    const previousFavoriters = readCache(image);
    const wasFirstSync = !image.favoritesSyncedAt;
    await prisma.image.update({
      where: { id: image.id },
      data: {
        favoriteCount: data.count,
        favoritersCache: data.favoriters as unknown as Prisma.InputJsonValue,
        favoritesSyncedAt: new Date(),
        postStatus: 200,
      },
    });
    // 「お気に入りされた」通知を差分更新（失敗してもsync本体は止めない）
    await reconcileFavoriteNotificationSafely({
      imageId: image.id,
      ownerUserId: image.userId,
      ownerAcct: `${image.user.username}@${image.user.instance.domain}`,
      wasFirstSync,
      previousFavoriters,
      currentFavoriters: data.favoriters,
      count: data.count,
    });
    return { count: data.count, favoriters: data.favoriters, errorReason: null };
  } catch (error) {
    const httpStatus = toFavoriteHttpStatus(error);
    console.error(
      `[favorite] sync失敗 (status=${httpStatus}): imageId=${image.id}`,
      error
    );
    await prisma.image.update({
      where: { id: image.id },
      data: { favoritesSyncedAt: new Date(), postStatus: httpStatus },
    });
    return {
      count: image.favoriteCount,
      favoriters: readCache(image),
      errorReason: toFavoriteReason(error),
    };
  }
}
