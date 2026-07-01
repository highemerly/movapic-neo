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
import { isFirstSuccessfulSync } from "@/lib/fediverse/favoritePolicy";

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
 *
 * **throw しない契約**: 取得失敗も DB 障害も内部で握り、必ず SyncResult を返す。呼び出し側
 * （route の GET/POST/DELETE・定期ジョブ）はこれに依存している。特に POST/DELETE は既に
 * Fediverse 操作が成功した後に呼ぶため、ここで throw すると「操作は成功したのに 500 →
 * ユーザーが再操作して二重トグル」になる。
 */
export async function syncFavoriteCache(
  image: ImageForFavorite,
  opts: { logSuccess?: boolean } = {}
): Promise<SyncResult> {
  // ── 取得（未認証 GET。public/unlisted は誰でも読めるためオーナートークンは使わない）──
  let data: Awaited<ReturnType<typeof fetchFavoriteData>>;
  try {
    data = await fetchFavoriteData(
      image.user.instance.type,
      image.user.instance.domain,
      image.postId!
    );
  } catch (error) {
    // 取得失敗。失敗状態（postStatus/favoritesSyncedAt）を記録し errorReason を返す。
    const httpStatus = toFavoriteHttpStatus(error);
    if (error instanceof FavoriteError) {
      // 想定内の分類済みエラー（404/429/5xx 等）はスタックトレース不要。1行で残す
      console.error(
        `[favorite] sync failed (status=${httpStatus}, reason=${error.reason}): imageId=${image.id}`
      );
    } else {
      // 想定外（タイムアウト・復号エラー等）はスタックトレース付きで調査可能にする
      console.error(`[favorite] sync failed (unexpected): imageId=${image.id}`, error);
    }
    // 失敗状態の永続化も best-effort（DB 障害でも throw しない）
    try {
      await prisma.image.update({
        where: { id: image.id },
        data: { favoritesSyncedAt: new Date(), postStatus: httpStatus },
      });
    } catch (dbError) {
      console.error(`[favorite] failure-state persist failed: imageId=${image.id}`, dbError);
    }
    return {
      count: image.favoriteCount,
      favoriters: readCache(image),
      errorReason: toFavoriteReason(error),
    };
  }

  // ── 取得成功。キャッシュ永続化は best-effort（DB 障害でも取得値は返せる＝throw しない）──
  // 更新前の状態（差分の基準）を退避してから上書きする
  const previousFavoriters = readCache(image);
  // 「初回の“成功”sync か」を判定（失敗込みの favoritesSyncedAt では誤爆する。理由は
  // isFirstSuccessfulSync の doc / docs/favorite.md §2 参照）。
  const wasFirstSync = isFirstSuccessfulSync(image.postStatus, previousFavoriters.length);
  try {
    await prisma.image.update({
      where: { id: image.id },
      data: {
        favoriteCount: data.count,
        favoritersCache: data.favoriters as unknown as Prisma.InputJsonValue,
        favoritesSyncedAt: new Date(),
        postStatus: 200,
      },
    });
  } catch (dbError) {
    // 永続化に失敗。取得データ自体は返せる（表示は正しい）が、キャッシュ未更新のため
    // 通知の差分更新はスキップする（古い基準との比較で誤通知を出さないため）。
    console.error(`[favorite] cache persist failed: imageId=${image.id}`, dbError);
    return { count: data.count, favoriters: data.favoriters, errorReason: null };
  }

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
}
