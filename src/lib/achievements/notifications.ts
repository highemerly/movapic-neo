/**
 * 通知フィードの取得。Notification テーブルを直近90日で読み、表示に必要な情報へ整形する。
 * 種別(type)で情報ソースを区別する。現状は "achievement" のみ。
 */

import prisma from "@/lib/db";
import { userPathSegment } from "@/lib/userHandle";
import { getAvatarUrl } from "@/lib/avatar";
import type { FavoriteNotificationData } from "@/lib/notifications/favoriteNotifications";

export const NOTIFICATION_WINDOW_DAYS = 90;

/** type="favorite" の表示用データ（相手のavatarはプロキシ経由に変換済み）。 */
export interface FavoriteFeedData {
  count: number;
  favoriters: {
    acct: string;
    displayName: string | null;
    avatarUrl: string | null;
    profileUrl: string | null;
  }[];
}

export interface NotificationFeedItem {
  id: string;
  type: string;
  /** type="achievement" のとき、獲得した実績キー（表示文言は CATALOG から解決）。
   *  type="makeup-reminder" のとき、対象月キー perfect-month:YYYY-MM。 */
  achievementKey: string | null;
  createdAt: Date;
  /** 関連画像（きっかけ写真 / お気に入りされた写真）。サムネイルURLと画像ページへのリンク。 */
  image: { id: string; pageUrl: string; thumbnailUrl: string } | null;
  /** type="favorite" のとき、お気に入りした相手と総数。 */
  favorite: FavoriteFeedData | null;
  /** 受信者の /u/ パスセグメント（既定インスタンスは素のusername、他は username@domain）。
   *  makeup-reminder のカレンダー遷移などのリンク生成に使う。 */
  recipientUsername: string;
}

function publicBase(): string {
  return (process.env.S3_PUBLIC_URL || "").replace(/\/+$/, "");
}

/**
 * 直近90日の通知を新しい順に返す。limit 未指定なら全件（通知ページ用）。
 */
export async function getRecentNotifications(
  userId: string,
  limit?: number
): Promise<NotificationFeedItem[]> {
  const since = new Date(Date.now() - NOTIFICATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.notification.findMany({
    where: { userId, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    ...(limit ? { take: limit } : {}),
    select: {
      id: true,
      type: true,
      achievementKey: true,
      data: true,
      createdAt: true,
      user: { select: { username: true, instance: { select: { domain: true } } } },
      image: {
        select: {
          id: true,
          thumbnailKey: true,
          storageKey: true,
          user: { select: { username: true, instance: { select: { domain: true } } } },
        },
      },
    },
  });

  const base = publicBase();
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    achievementKey: r.achievementKey,
    createdAt: r.createdAt,
    recipientUsername: userPathSegment(r.user.username, r.user.instance.domain),
    image: r.image
      ? {
          id: r.image.id,
          pageUrl: `/u/${userPathSegment(r.image.user.username, r.image.user.instance.domain)}/status/${r.image.id}`,
          thumbnailUrl: `${base}/${r.image.thumbnailKey || r.image.storageKey}`,
        }
      : null,
    favorite: r.type === "favorite" ? toFavoriteFeedData(r.data) : null,
  }));
}

// Notification.data（type="favorite"）を表示用に整形。avatarはプロキシ経由に変換。
function toFavoriteFeedData(data: unknown): FavoriteFeedData | null {
  const d = data as FavoriteNotificationData | null;
  if (!d || !Array.isArray(d.favoriters)) return null;
  return {
    count: typeof d.count === "number" ? d.count : d.favoriters.length,
    favoriters: d.favoriters.map((f) => ({
      acct: f.acct,
      displayName: f.displayName,
      avatarUrl: getAvatarUrl(f.avatarUrl),
      profileUrl: f.profileUrl,
    })),
  };
}
