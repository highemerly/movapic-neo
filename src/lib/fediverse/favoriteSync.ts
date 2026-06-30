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
import {
  fetchFavoriteData,
  toFavoriteReason,
  toFavoriteHttpStatus,
  FavoriteError,
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
  image: ImageForFavorite,
  opts: { logSuccess?: boolean } = {}
): Promise<SyncResult> {
  try {
    // 読み取りは未認証 GET（public/unlisted は誰でも読める）。オーナートークンは使わない
    const data = await fetchFavoriteData(
      image.user.instance.type,
      image.user.instance.domain,
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
    // 高頻度な GET 経由は無音。定期ジョブ経由（logSuccess）のときだけ1行残す
    if (opts.logSuccess) {
      console.log(
        `[favorite] synced imageId=${image.id} count=${data.count} favoriters=${data.favoriters.length}`
      );
    }
    return { count: data.count, favoriters: data.favoriters, errorReason: null };
  } catch (error) {
    const httpStatus = toFavoriteHttpStatus(error);
    if (error instanceof FavoriteError) {
      // 想定内の分類済みエラー（404/429/5xx 等）はスタックトレース不要。1行で残す
      console.error(
        `[favorite] sync failed (status=${httpStatus}, reason=${error.reason}): imageId=${image.id}`
      );
    } else {
      // 想定外（タイムアウト・復号/DB エラー等）はスタックトレース付きで調査可能にする
      console.error(`[favorite] sync failed (unexpected): imageId=${image.id}`, error);
    }
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
