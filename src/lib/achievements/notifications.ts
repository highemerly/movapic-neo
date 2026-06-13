/**
 * 通知フィードの取得。Notification テーブルを直近90日で読み、表示に必要な情報へ整形する。
 * 種別(type)で情報ソースを区別する。現状は "achievement" のみ。
 */

import prisma from "@/lib/db";

export const NOTIFICATION_WINDOW_DAYS = 90;

export interface NotificationFeedItem {
  id: string;
  type: string;
  /** type="achievement" のとき、獲得した実績キー（表示文言は CATALOG から解決） */
  achievementKey: string | null;
  createdAt: Date;
  /** 関連画像（きっかけ写真）。サムネイルURLと画像ページへのリンク。 */
  image: { id: string; pageUrl: string; thumbnailUrl: string } | null;
}

function publicBase(): string {
  return (process.env.S3_PUBLIC_URL || process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
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
      createdAt: true,
      image: {
        select: {
          id: true,
          thumbnailKey: true,
          storageKey: true,
          user: { select: { username: true } },
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
    image: r.image
      ? {
          id: r.image.id,
          pageUrl: `/u/${r.image.user.username}/status/${r.image.id}`,
          thumbnailUrl: `${base}/${r.image.thumbnailKey || r.image.storageKey}`,
        }
      : null,
  }));
}
