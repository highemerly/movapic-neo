/**
 * 「自分の投稿がお気に入りされた」通知の生成・更新。
 *
 * お気に入りは Mastodon が正データで、syncFavoriteCache() が走ったときにだけ
 * Image.favoritersCache（上位40件のスナップショット）が更新される。そのため通知も
 * 「sync のたびに」差分を取り直して修正する必要がある。
 *
 * 設計:
 * - 1画像につき通知は1件（id = `fav-<imageId>`）。複数人のお気に入りは1通知にまとめる。
 *   主キー固定で upsert/findUnique するため、同時 sync でも重複行は生まれない。
 * - 「新規のみ通知」: 通知がまだ無い画像では、直前の favoritersCache に居なかった人が
 *   現れたときだけ通知を作る。これでリリース前から付いていた既存お気に入りは通知化しない。
 *   その投稿の初回 sync（favoritesSyncedAt が null）も同様にベースライン化のみ。
 * - 通知ができた後の「新規」判定は data.seenAccts（通知済み acct の集合）を基準にする。
 *   Mastodon の favourited_by は remote ユーザー等で一時的に空/部分的に返ることがあり、
 *   画像キャッシュ基準だと取得のブレで再通知・名前消失が起きるため、安定した集合で持つ。
 * - 新規 acct があれば createdAt を now に更新（＝未読の赤ドットが点く）。
 *   取得が空でも、表示用の名前（favoriters）は前回分を保持して消さない。
 */

import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import type { CachedFavoriter } from "@/lib/fediverse/favorite";

export const FAVORITE_NOTIFICATION_TYPE = "favorite";

// 表示用に保持するお気に入り相手の最大件数（最新順）
const MAX_STORED_FAVORITERS = 8;
// 新規判定用に保持する acct の最大件数（最新順。これを超えた古い acct は再通知され得る）
const MAX_SEEN_ACCTS = 200;

/** Notification.data に格納する type="favorite" のペイロード。 */
export interface FavoriteNotificationData {
  /** Mastodon 上の総お気に入り数（上位40件外を含む）。「他N人」表示に使う。 */
  count: number;
  /** 表示用の最新お気に入り相手（最大 MAX_STORED_FAVORITERS 件、最新順）。 */
  favoriters: CachedFavoriter[];
  /** 通知済みの acct 集合（最新順、最大 MAX_SEEN_ACCTS 件）。新規判定の基準。 */
  seenAccts?: string[];
}

function favoriteNotificationId(imageId: string): string {
  return `fav-${imageId}`;
}

interface ReconcileParams {
  imageId: string;
  /** 通知の受信者（＝画像の所有者）。 */
  ownerUserId: string;
  /** 所有者自身の acct（username@domain）。自分のお気に入りは通知しない。 */
  ownerAcct: string;
  /** この sync が「その投稿の初回 sync」か（直前の favoritesSyncedAt が null）。 */
  wasFirstSync: boolean;
  /** 更新前の favoritersCache（通知未作成時の差分の基準）。 */
  previousFavoriters: CachedFavoriter[];
  /** 今回取得した favoritersCache（最新順、上位40件）。 */
  currentFavoriters: CachedFavoriter[];
  /** 今回取得した総お気に入り数。 */
  count: number;
}

/**
 * お気に入り通知を差分更新する。例外は飲み込んでログのみ（お気に入り sync 本体を止めない）。
 */
export async function reconcileFavoriteNotificationSafely(
  params: ReconcileParams
): Promise<void> {
  try {
    await reconcileFavoriteNotification(params);
  } catch (error) {
    console.error(
      `[favorite] 通知の更新に失敗: imageId=${params.imageId}`,
      error
    );
  }
}

function asJson(data: FavoriteNotificationData): Prisma.InputJsonValue {
  return data as unknown as Prisma.InputJsonValue;
}

async function reconcileFavoriteNotification({
  imageId,
  ownerUserId,
  ownerAcct,
  wasFirstSync,
  previousFavoriters,
  currentFavoriters,
  count,
}: ReconcileParams): Promise<void> {
  // 所有者自身のお気に入りは除外
  const current = currentFavoriters.filter((f) => f.acct !== ownerAcct);
  const id = favoriteNotificationId(imageId);

  const existing = await prisma.notification.findUnique({
    where: { id },
    select: { data: true },
  });

  // ── 通知がまだ無い画像 ───────────────────────────────────────────
  // 既存お気に入りを通知化しないため、「直前の画像キャッシュに居なかった人」が
  // 現れたときだけ作成する。初回 sync はベースライン化のみで作らない。
  if (!existing) {
    if (wasFirstSync) return;
    const prevCacheAccts = new Set(
      previousFavoriters.filter((f) => f.acct !== ownerAcct).map((f) => f.acct)
    );
    const added = current.filter((f) => !prevCacheAccts.has(f.acct));
    if (added.length === 0) return;

    await prisma.notification.create({
      data: {
        id,
        userId: ownerUserId,
        type: FAVORITE_NOTIFICATION_TYPE,
        imageId,
        data: asJson({
          count,
          favoriters: current.slice(0, MAX_STORED_FAVORITERS),
          seenAccts: current.map((f) => f.acct).slice(0, MAX_SEEN_ACCTS),
        }),
      },
    });
    return;
  }

  // ── 既存通知あり ─────────────────────────────────────────────────
  const prev = existing.data as unknown as FavoriteNotificationData | null;
  // seenAccts が無い旧データは favoriters から復元
  const seen = new Set(prev?.seenAccts ?? prev?.favoriters?.map((f) => f.acct) ?? []);
  const added = current.filter((f) => !seen.has(f.acct));

  // 表示用の名前: 取得が空のときは前回分を保持して消さない（favourited_by のブレ対策）
  const favoriters =
    current.length > 0 ? current.slice(0, MAX_STORED_FAVORITERS) : prev?.favoriters ?? [];
  // seenAccts は最新を前に積んで重複排除＋上限カット
  const seenAccts = Array.from(
    new Set([...current.map((f) => f.acct), ...(prev?.seenAccts ?? [])])
  ).slice(0, MAX_SEEN_ACCTS);

  const data = asJson({ count, favoriters, seenAccts });

  if (added.length > 0) {
    // 新規お気に入りあり → データ更新＋未読として再浮上
    await prisma.notification.update({
      where: { id },
      data: { data, createdAt: new Date() },
    });
  } else {
    // 解除や再取得のみ → 表示用データだけ更新（赤ドットは点けない）
    await prisma.notification.update({
      where: { id },
      data: { data },
    });
  }
}
