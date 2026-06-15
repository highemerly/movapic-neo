/**
 * 実績評価のための集計値を投稿後に1ショットで集める（live 用）。
 * backfill はこれを使わず、メモリ上のリプレイで同じ AchStats を作る。
 */

import prisma from "@/lib/db";
import { calculateStreak, toJstDateString } from "@/lib/streak";
import type { AchStats, PostFacts } from "./catalog";
import { summarizeDayCounts } from "./perfectMonth";

export async function collectStats(userId: string, post: PostFacts): Promise<AchStats> {
  const postYm = toJstDateString(post.createdAt).slice(0, 7);
  const postDay = toJstDateString(post.createdAt);

  const [dateRows, featureCounts, fontGroups, colorGroups, distinctGroups] = await Promise.all([
    // 全投稿日（streak / today / monthly-distinct-days / 当日のsource種類 用）
    prisma.image.findMany({ where: { userId }, select: { createdAt: true, source: true } }),
    // 機能別の利用回数
    prisma.$transaction([
      prisma.image.count({ where: { userId, arrangement: "neon" } }),
      prisma.image.count({ where: { userId, arrangement: "stamp" } }),
      prisma.image.count({ where: { userId, size: "extra-large" } }),
      prisma.image.count({ where: { userId, position: { in: ["left", "right"] } } }),
    ]),
    // フォントの種類数
    prisma.image.groupBy({ by: ["font"], where: { userId }, orderBy: { font: "asc" } }),
    // 文字色の種類数
    prisma.image.groupBy({ by: ["color"], where: { userId }, orderBy: { color: "asc" } }),
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

  // 投稿月の日別投稿数 → distinct日数 / 日付順マッチング（皆勤賞の穴埋め判定に使用）
  const monthDayCounts = new Map<string, number>();
  for (const d of jstDays) {
    if (d.startsWith(postYm)) monthDayCounts.set(d, (monthDayCounts.get(d) ?? 0) + 1);
  }
  const monthSummary = summarizeDayCounts(monthDayCounts.values());
  // 日(1-31)→投稿数（穴埋めの日付順マッチング用。キーは JST 日付文字列の DD 部分）
  const postMonthDayCounts: Record<number, number> = {};
  for (const [dayStr, c] of monthDayCounts) {
    postMonthDayCounts[Number(dayStr.slice(8, 10))] = c;
  }

  // 投稿日（JST）に使った source の種類数（ハットトリック判定）
  const sourcesToday = new Set(
    dateRows.filter((r) => toJstDateString(r.createdAt) === postDay).map((r) => r.source)
  );

  return {
    totalPosts: dateRows.length,
    currentStreak: calculateStreak(dateRows.map((r) => r.createdAt)),
    todayPosts: jstDays.filter((d) => d === postDay).length,
    distinctDaysInPostMonth: monthSummary.distinctDays,
    postMonthDayCounts,
    featureCounts: { neon, stamp, xlarge, vertical },
    distinctFonts: fontGroups.length,
    distinctColors: colorGroups.length,
    distinctCameraModels: cameraGroups.length,
    distinctPrefectures: prefGroups.length,
    hasEmailPost: sources.has("email"),
    hasMentionPost: sources.has("mention"),
    distinctSourcesToday: sourcesToday.size,
  };
}

/**
 * 実績タブのラダー表示用に、各 ladderKey の「今時点の数」を集める（表示専用）。
 * 累計系（投稿数・機能利用・カメラ・都道府県）はそのままの現在値、
 * streak は現在の連続日数、daily は今日（JST）の投稿数。
 */
export async function collectLadderValues(userId: string): Promise<Record<string, number>> {
  const todayStr = toJstDateString(new Date());

  const [dateRows, featureCounts, distinctGroups] = await Promise.all([
    prisma.image.findMany({ where: { userId }, select: { createdAt: true } }),
    prisma.$transaction([
      prisma.image.count({ where: { userId, arrangement: "neon" } }),
      prisma.image.count({ where: { userId, arrangement: "stamp" } }),
      prisma.image.count({ where: { userId, size: "extra-large" } }),
      prisma.image.count({ where: { userId, position: { in: ["left", "right"] } } }),
    ]),
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
      prisma.image.groupBy({ by: ["color"], where: { userId }, orderBy: { color: "asc" } }),
    ]),
  ]);

  const jstDays = dateRows.map((r) => toJstDateString(r.createdAt));
  const [neon, stamp, xlarge, vertical] = featureCounts;
  const [cameraGroups, prefGroups, colorGroups] = distinctGroups;

  return {
    "post-count": dateRows.length,
    streak: calculateStreak(dateRows.map((r) => r.createdAt)),
    daily: jstDays.filter((d) => d === todayStr).length,
    "feature:neon": neon,
    "feature:stamp": stamp,
    "feature:xlarge": xlarge,
    "feature:vertical": vertical,
    cameras: cameraGroups.length,
    prefectures: prefGroups.length,
    colors: colorGroups.length,
  };
}
