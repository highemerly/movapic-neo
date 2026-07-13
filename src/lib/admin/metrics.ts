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
  /** ストレージ概算容量（Image.file_size 合計・出力画像分のみ） */
  storageApproxBytes: number;
  /** source 別の投稿数（web / email / mention）。多い順 */
  bySource: { source: string; count: number }[];
  /** 未対応（open）の通報数 */
  openReports: number;
  /** お気に入りが一度も同期されていない Fediverse 投稿数 */
  favUnsynced: number;
  /**
   * 直近7日間（ローリング）の各メトリクスの純増減。
   * user/server/image/storage は新規作成分（＝実質の増加、削除は追跡しない）、
   * openReports は「新規通報 − 期間内に対応済みへ移行した数」の純増減（負にもなる）。
   */
  deltas7d: {
    userCount: number;
    serverCount: number;
    imageCount: number;
    storageApproxBytes: number;
    openReports: number;
  };
}

export async function getMainMetrics(): Promise<MainMetrics> {
  // 直近7日間のローリングウィンドウ（暦日ではないのでJST補正は不要）。
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    userCount,
    serverCount,
    imageCount,
    storageAgg,
    bySourceRaw,
    openReports,
    favUnsynced,
    newUsers,
    newServers,
    newImages,
    newStorageAgg,
    reportsOpened,
    reportsClosed,
  ] = await Promise.all([
    prisma.user.count(),
    // ユーザーが1人以上いるサーバーだけを「連携サーバー」として数える
    prisma.instance.count({ where: { users: { some: {} } } }),
    prisma.image.count(),
    // ストレージ概算（出力画像の file_size 合計）。/admin/system と同じ算出。
    prisma.image.aggregate({ _sum: { fileSize: true } }),
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
    // ── 直近7日間の増減 ──
    prisma.user.count({ where: { createdAt: { gte: cutoff } } }),
    // 期間内に「初めてユーザーが付いた」サーバー（全ユーザーが7日以内に参加）
    prisma.instance.count({
      where: { users: { some: {}, none: { createdAt: { lt: cutoff } } } },
    }),
    prisma.image.count({ where: { createdAt: { gte: cutoff } } }),
    prisma.image.aggregate({
      _sum: { fileSize: true },
      where: { createdAt: { gte: cutoff } },
    }),
    // 未対応通報の純増減 = 期間内の新規通報 − 期間内に対応済み（resolved/dismissed）へ移行した数
    prisma.report.count({ where: { createdAt: { gte: cutoff } } }),
    prisma.report.count({ where: { resolvedAt: { gte: cutoff } } }),
  ]);

  const bySource = bySourceRaw
    .map((r) => ({ source: r.source, count: r._count._all }))
    .sort((a, b) => b.count - a.count);

  return {
    userCount,
    serverCount,
    imageCount,
    storageApproxBytes: storageAgg._sum.fileSize ?? 0,
    bySource,
    openReports,
    favUnsynced,
    deltas7d: {
      userCount: newUsers,
      serverCount: newServers,
      imageCount: newImages,
      storageApproxBytes: newStorageAgg._sum.fileSize ?? 0,
      openReports: reportsOpened - reportsClosed,
    },
  };
}
