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
import { onReactionsReceived } from "@/lib/achievements/reactionTriggers";
import { isFirstSuccessfulSync } from "@/lib/fediverse/favoritePolicy";
import { resolveLocalEmojiUrls } from "@/lib/fediverse/emojis";
import { mergeReactions, toMergedFavoriters } from "@/lib/reactions/merge";
import {
  loadStoredReactions,
  loadReactionsForReconcile,
  deleteReactions,
} from "@/lib/reactions/store";
import { reactionsUnfavoritedOnOwner } from "@/lib/reactions/reconcile";
import type { ReactionTotalsCache } from "@/lib/reactions/types";

// favourited_by / notes/reactions の取得上限。favorite.ts の limit=40 と一致させること。
// 一覧がこの件数に達している回は「41件目以降が隠れているだけ」かを区別できないため、
// 取り消し検知をまるごと諦める（ユーザー合意済みの割り切り）。
const OWNER_FAVOURITER_LIMIT = 40;
// オーナーインスタンスへ連合が伝播するのを待つ猶予。付けた直後（まだ相手サーバーの一覧に
// 出ていない）を取り消しと誤検知しないための緩衝。
// 判定は閲覧時（GET）の同期でも走り、投稿直後は TTL が1分まで詰まる＝定期の30分間隔より
// はるかに早く回るため、猶予は「相手サーバーの配送キューが詰まっていても届く」時間で取る。
const UNFAVORITE_GRACE_MS = 60 * 60 * 1000;

export type ImageForFavorite = Prisma.ImageGetPayload<{
  include: { user: { include: { instance: true } } };
}>;

export function readCache(image: ImageForFavorite): CachedFavoriter[] {
  return (image.favoritersCache as unknown as CachedFavoriter[] | null) ?? [];
}

export function readTotalsCache(image: ImageForFavorite): ReactionTotalsCache | null {
  return (image.reactionTotalsCache as unknown as ReactionTotalsCache | null) ?? null;
}

export interface SyncResult {
  /** Reaction テーブルとマージ済みの表示用合計 */
  count: number;
  favoriters: CachedFavoriter[];
  /** オーナーインスタンス上の生の合計（マージの土台） */
  fediverseCount: number;
  /** 絵文字別カウント。呼び出し側が再マージできるよう同期後の値を返す */
  totalsCache: ReactionTotalsCache | null;
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
/**
 * オーナーインスタンス側で取り消されたリアクションを SHAMEZO からも取り除く。
 * 判定条件・割り切りの根拠は reactionsUnfavoritedOnOwner の doc を参照。
 * 閲覧時（GET）と定期同期から呼ぶ。route の POST/DELETE 直後だけは除外する
 * （自分が今付けたぶんを、連合が伝播する前に取り消しと誤検知するため）。
 */
async function reconcileUnfavoritedReactions(
  imageId: string,
  favoriters: CachedFavoriter[]
): Promise<void> {
  // 上限まで取れている＝一覧に無い＝取り消し、とは言い切れないのでこの回は諦める。
  if (favoriters.length >= OWNER_FAVOURITER_LIMIT) return;
  const reactions = await loadReactionsForReconcile(imageId);
  if (reactions.length === 0) return;
  const removed = reactionsUnfavoritedOnOwner({
    reactions,
    ownerAccts: new Set(favoriters.map((f) => f.acct)),
    now: new Date(),
    graceMs: UNFAVORITE_GRACE_MS,
  });
  if (removed.length === 0) return;
  await deleteReactions(imageId, removed);
  console.log(
    `[favorite] removed ${removed.length} unfavorited reaction(s): imageId=${imageId}`
  );
}

export async function syncFavoriteCache(
  image: ImageForFavorite,
  opts: { logSuccess?: boolean; reconcileRemovals?: boolean } = {}
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
      fediverseCount: image.fediverseCount,
      totalsCache: readTotalsCache(image),
      errorReason: toFavoriteReason(error),
    };
  }

  // ── 取得成功。キャッシュ永続化は best-effort（DB 障害でも取得値は返せる＝throw しない）──
  // 更新前の状態（差分の基準）を退避してから上書きする
  const previousFavoriters = readCache(image);
  // 「初回の“成功”sync か」を判定（失敗込みの favoritesSyncedAt では誤爆する。理由は
  // isFirstSuccessfulSync の doc / docs/favorite.md §2 参照）。
  const wasFirstSync = isFirstSuccessfulSync(image.postStatus, previousFavoriters.length);
  const ownerDomain = image.user.instance.domain;

  // オーナー自身のカスタム絵文字は notes/show の reactionEmojis に載らないため、URLは
  // オーナーのカタログから補う。失敗してもリアクション自体は表示できる（カスタム絵文字が
  // 画像でなくテキストになるだけ）ので、同期は止めない。
  let emojiUrls = data.emojiUrls;
  try {
    const localUrls = await resolveLocalEmojiUrls(Object.keys(data.totals), ownerDomain);
    emojiUrls = { ...data.emojiUrls, ...localUrls };
  } catch (error) {
    console.error(`[favorite] emoji url resolve failed: imageId=${image.id}`, error);
  }
  const favoriters = data.favoriters.map((favoriter) =>
    favoriter.emoji && !favoriter.emojiImageUrl
      ? { ...favoriter, emojiImageUrl: emojiUrls[favoriter.emoji] ?? null }
      : favoriter
  );
  const totalsCache: ReactionTotalsCache = { totals: data.totals, emojiUrls };

  // 呼び出し元が許した回だけ、オーナー側で取り消されたリアクションを SHAMEZO からも消す。
  // 削除に失敗しても sync 本体は止めない（次の同期でまた判定できる）。この後の
  // loadStoredReactions は削除を反映した状態を読むので favoriteCount も整合する。
  if (opts.reconcileRemovals) {
    try {
      await reconcileUnfavoritedReactions(image.id, favoriters);
    } catch (error) {
      console.error(`[favorite] unfavorite reconcile failed: imageId=${image.id}`, error);
    }
  }

  let merged: ReturnType<typeof mergeReactions>;
  try {
    // 一覧の「＋N」が読む favoriteCount は、連合の生の件数ではなく
    // SHAMEZO 上のリアクションを重ねた表示用の合計にする。
    merged = mergeReactions({
      fediverseCount: data.count,
      totalsCache,
      cachedFavoriters: favoriters,
      storedReactions: await loadStoredReactions(image.id),
      viewerAcct: null,
    });
    await prisma.image.update({
      where: { id: image.id },
      data: {
        favoriteCount: merged.total,
        fediverseCount: data.count,
        favoritersCache: favoriters as unknown as Prisma.InputJsonValue,
        reactionTotalsCache: totalsCache as unknown as Prisma.InputJsonValue,
        favoritesSyncedAt: new Date(),
        postStatus: 200,
      },
    });
  } catch (dbError) {
    // 永続化に失敗。取得データ自体は返せる（表示は正しい）が、キャッシュ未更新のため
    // 通知の差分更新はスキップする（古い基準との比較で誤通知を出さないため）。
    console.error(`[favorite] cache persist failed: imageId=${image.id}`, dbError);
    return {
      count: data.count,
      favoriters,
      fediverseCount: data.count,
      totalsCache,
      errorReason: null,
    };
  }

  // 「リアクションされた」通知を差分更新（失敗してもsync本体は止めない）。
  // 連合キャッシュではなくマージ後の一覧を渡すのは、SHAMEZO 上にしか記録されない
  // リアクション（Mastodonユーザーの絵文字選択など）も通知対象にするため。
  await reconcileFavoriteNotificationSafely({
    imageId: image.id,
    ownerUserId: image.userId,
    ownerAcct: `${image.user.username}@${ownerDomain}`,
    wasFirstSync,
    previousFavoriters,
    currentFavoriters: toMergedFavoriters(merged),
    count: merged.total,
  });
  // 「獲得したリアクション総数」の実績は投稿の瞬間には決まらない。件数を書き換えたこの瞬間が
  // 唯一の確定点なので、ここで評価する（失敗しても同期本体は止めない）。
  await onReactionsReceived({
    ownerUserId: image.userId,
    imageId: image.id,
    previousCount: image.favoriteCount,
    currentCount: merged.total,
  });
  // 高頻度な GET 経由は無音。定期ジョブ経由（logSuccess）のときだけ1行残す
  if (opts.logSuccess) {
    console.log(
      `[favorite] synced imageId=${image.id} count=${merged.total} favoriters=${favoriters.length}`
    );
  }
  return {
    count: merged.total,
    favoriters,
    fediverseCount: data.count,
    totalsCache,
    errorReason: null,
  };
}
