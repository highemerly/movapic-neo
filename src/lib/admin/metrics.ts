/**
 * /admin/stats ダッシュボードの主要メトリクス。
 *
 * 各カードは対応する詳細ページ（accounts / servers / favorites / reports）や
 * 公開TL（/public）への導線になる。数値だけを軽く集計する。
 */

import prisma from "@/lib/db";

export interface MainMetrics {
  /** 総ユーザー数 */
  userCount: number;
  /** ユーザーが1人以上いる連携サーバー数 */
  serverCount: number;
  /** 総投稿数 */
  imageCount: number;
  /** source 別の投稿数（web / email / mention）。多い順 */
  bySource: { source: string; count: number }[];
  /** 未対応（open）の通報数 */
  openReports: number;
  /** お気に入りが一度も同期されていない Fediverse 投稿数 */
  favUnsynced: number;
}

export async function getMainMetrics(): Promise<MainMetrics> {
  const [userCount, serverCount, imageCount, bySourceRaw, openReports, favUnsynced] =
    await Promise.all([
      prisma.user.count(),
      // ユーザーが1人以上いるサーバーだけを「連携サーバー」として数える
      prisma.instance.count({ where: { users: { some: {} } } }),
      prisma.image.count(),
      prisma.image.groupBy({ by: ["source"], _count: { _all: true } }),
      prisma.report.count({ where: { status: "open" } }),
      // Fediverse 投稿（post_id あり・非表示でない）で一度も sync していないもの
      prisma.image.count({
        where: {
          postId: { not: null },
          isDisabled: false,
          favoritesSyncedAt: null,
        },
      }),
    ]);

  const bySource = bySourceRaw
    .map((r) => ({ source: r.source, count: r._count._all }))
    .sort((a, b) => b.count - a.count);

  return {
    userCount,
    serverCount,
    imageCount,
    bySource,
    openReports,
    favUnsynced,
  };
}
