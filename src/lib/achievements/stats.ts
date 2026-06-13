/**
 * 実績評価のための集計値を投稿後に1ショットで集める（live 用）。
 * backfill はこれを使わず、メモリ上のリプレイで同じ AchStats を作る。
 */

import prisma from "@/lib/db";
import { calculateStreak, toJstDateString } from "@/lib/streak";
import type { AchStats, PostFacts } from "./catalog";

export async function collectStats(userId: string, post: PostFacts): Promise<AchStats> {
  const postYm = toJstDateString(post.createdAt).slice(0, 7);
  const postDay = toJstDateString(post.createdAt);

  const [dateRows, featureCounts, fontGroups, distinctGroups] = await Promise.all([
    // 全投稿日（streak / today / monthly-distinct-days 用）
    prisma.image.findMany({ where: { userId }, select: { createdAt: true } }),
    // 機能別の利用回数
    prisma.$transaction([
      prisma.image.count({ where: { userId, arrangement: "neon" } }),
      prisma.image.count({ where: { userId, arrangement: "stamp" } }),
      prisma.image.count({ where: { userId, size: "extra-large" } }),
      prisma.image.count({ where: { userId, position: { in: ["left", "right"] } } }),
    ]),
    // フォントの種類数
    prisma.image.groupBy({ by: ["font"], where: { userId }, orderBy: { font: "asc" } }),
    // distinct カメラ機種 / 都道府県 / source
    prisma.$transaction([
      prisma.image.groupBy({
        by: ["cameraModel"],
        where: { userId, cameraModel: { not: null } },
        orderBy: { cameraModel: "asc" },
      }),
      prisma.image.groupBy({
        by: ["locationPrefecture"],
        where: { userId, locationPrefecture: { not: null } },
        orderBy: { locationPrefecture: "asc" },
      }),
      prisma.image.groupBy({ by: ["source"], where: { userId }, orderBy: { source: "asc" } }),
    ]),
  ]);

  const jstDays = dateRows.map((r) => toJstDateString(r.createdAt));
  const [neon, stamp, xlarge, vertical] = featureCounts;
  const [cameraGroups, prefGroups, sourceGroups] = distinctGroups;
  const sources = new Set(sourceGroups.map((g) => g.source));

  return {
    totalPosts: dateRows.length,
    currentStreak: calculateStreak(dateRows.map((r) => r.createdAt)),
    todayPosts: jstDays.filter((d) => d === postDay).length,
    distinctDaysInPostMonth: new Set(jstDays.filter((d) => d.startsWith(postYm))).size,
    featureCounts: { neon, stamp, xlarge, vertical },
    distinctFonts: fontGroups.length,
    distinctCameraModels: cameraGroups.length,
    distinctPrefectures: prefGroups.length,
    hasEmailPost: sources.has("email"),
    hasMentionPost: sources.has("mention"),
  };
}
