/**
 * 実績評価のための集計値を投稿後に1ショットで集める（live 用）。
 * backfill はこれを使わず、メモリ上のリプレイで同じ AchStats を作る。
 */

import prisma from "@/lib/db";
import { calculateStreak, toJstDateString } from "@/lib/streak";
import type { AchStats, PostFacts, ReactionStats } from "./catalog";
import {
  summarizeDayCounts,
  daysInMonthOf,
  isPerfectMonth,
  currentMonthMakeupStatus,
  type CurrentMonthMakeupStatus,
} from "./perfectMonth";

export async function collectStats(userId: string, post: PostFacts): Promise<AchStats> {
  const postYm = toJstDateString(post.createdAt).slice(0, 7);
  const postDay = toJstDateString(post.createdAt);

  const [dateRows, featureCounts, fontGroups, colorGroups, distinctGroups] = await Promise.all([
    // 全投稿日（streak / today / monthly-distinct-days / 当日のsource種類 用）
    // makeupTargetDay も相乗せ（投稿月の永続穴埋め割当＝皆勤賞判定の filledHoleDays に使う）。
    prisma.image.findMany({
      where: { userId },
      select: { createdAt: true, source: true, makeupTargetDay: true },
    }),
    // 機能別の利用回数（season 投稿はスタイル列が中立デフォルト＝案Bの隔離のため除外）
    prisma.$transaction([
      prisma.image.count({ where: { userId, season: null, arrangement: "neon" } }),
      prisma.image.count({ where: { userId, season: null, arrangement: "stamp" } }),
      prisma.image.count({ where: { userId, season: null, size: "extra-large" } }),
      prisma.image.count({ where: { userId, season: null, position: { in: ["left", "right"] } } }),
    ]),
    // フォントの種類数（season 投稿を除外）
    prisma.image.groupBy({ by: ["font"], where: { userId, season: null }, orderBy: { font: "asc" } }),
    // 文字色の種類数（season 投稿を除外）
    prisma.image.groupBy({ by: ["color"], where: { userId, season: null }, orderBy: { color: "asc" } }),
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

  // 投稿月の永続穴埋め割当（Image.makeupTargetDay）が指す空き日。皆勤賞判定の単一ソース。
  const filledHoleDays: number[] = [];
  for (const r of dateRows) {
    if (r.makeupTargetDay != null && toJstDateString(r.createdAt).startsWith(postYm)) {
      filledHoleDays.push(r.makeupTargetDay);
    }
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
    filledHoleDays,
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
 * カスタム絵文字キーの接頭辞。正規化キーは Unicode 絵文字そのもの or `:name@host:` の
 * 2種類しかないため（src/lib/reactions/emojiKey.ts）、先頭が ":" ならカスタム絵文字と判定できる
 * （SQL に正規表現を持ち込まないための前方一致）。
 */
const CUSTOM_EMOJI_PREFIX = ":";

/** リアクション由来の集計値（live）。押した瞬間・受け取った瞬間に呼ぶ。 */
export async function collectReactionStats(userId: string): Promise<ReactionStats> {
  const [given, givenCustomEmoji, received] = await prisma.$transaction([
    prisma.reaction.count({ where: { userId } }),
    prisma.reaction.count({ where: { userId, emoji: { startsWith: CUSTOM_EMOJI_PREFIX } } }),
    // favoriteCount は連合キャッシュと Reaction をマージ済みの表示用合計（同期のたびに更新される）。
    // 画面に出ている件数と実績の数え方を一致させるため、これを総和する。
    prisma.image.aggregate({ where: { userId }, _sum: { favoriteCount: true } }),
  ]);

  return {
    given,
    givenCustomEmoji,
    received: received._sum.favoriteCount ?? 0,
  };
}

/**
 * 実績タブのラダー表示用に、各 ladderKey の「今時点の数」を集める（表示専用）。
 * 累計系（投稿数・機能利用・カメラ・都道府県）はそのままの現在値、
 * streak は現在の連続日数、daily は今日（JST）の投稿数。
 */
export async function collectLadderValues(userId: string): Promise<Record<string, number>> {
  const todayStr = toJstDateString(new Date());

  const [dateRows, featureCounts, distinctGroups, reactionStats] = await Promise.all([
    prisma.image.findMany({ where: { userId }, select: { createdAt: true } }),
    prisma.$transaction([
      prisma.image.count({ where: { userId, season: null, arrangement: "neon" } }),
      prisma.image.count({ where: { userId, season: null, arrangement: "stamp" } }),
      prisma.image.count({ where: { userId, season: null, size: "extra-large" } }),
      prisma.image.count({ where: { userId, season: null, position: { in: ["left", "right"] } } }),
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
      prisma.image.groupBy({ by: ["color"], where: { userId, season: null }, orderBy: { color: "asc" } }),
    ]),
    collectReactionStats(userId),
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
    "reaction-custom": reactionStats.givenCustomEmoji,
    "reaction-received": reactionStats.received,
  };
}

/** 「あと少しナビ」の当月皆勤カード用（本人分・永続割当ベース）。 */
export interface CurrentMonthPerfect {
  daysInMonth: number;
  /** JST の今日の日(1-31)。 */
  todayDayNum: number;
  /** 当月に1枚以上投稿した distinct 日数。 */
  distinctDays: number;
  /** 当月の皆勤賞をすでに達成しているか（永続割当ベース）。 */
  achieved: boolean;
  status: CurrentMonthMakeupStatus;
}

/**
 * 当月の皆勤賞の進捗を集める（あと少しナビの常時ピン留めカード用）。
 * 判定・進捗は perfectMonth.ts に集約された純粋関数を呼ぶ（式を再実装しない）。
 * grace は本人の所属インスタンスで決まる値を呼び出し側から渡す。
 */
export async function collectCurrentMonthPerfect(
  userId: string,
  grace: number
): Promise<CurrentMonthPerfect> {
  const todayStr = toJstDateString(new Date());
  const ym = todayStr.slice(0, 7);
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  const daysInMonth = daysInMonthOf(year, month);
  const todayDayNum = Number(todayStr.slice(8, 10));

  const rows = await prisma.image.findMany({
    where: { userId },
    select: { createdAt: true, makeupTargetDay: true },
  });

  // 当月の日(1-31)→投稿数 と、当月の永続穴埋め割当が指す空き日。
  const dayCounts: Record<number, number> = {};
  const filledHoleDays: number[] = [];
  for (const r of rows) {
    const d = toJstDateString(r.createdAt);
    if (!d.startsWith(ym)) continue;
    dayCounts[Number(d.slice(8, 10))] = (dayCounts[Number(d.slice(8, 10))] ?? 0) + 1;
    if (r.makeupTargetDay != null) filledHoleDays.push(r.makeupTargetDay);
  }

  let distinctDays = 0;
  for (let d = 1; d <= daysInMonth; d++) if ((dayCounts[d] ?? 0) >= 1) distinctDays++;

  return {
    daysInMonth,
    todayDayNum,
    distinctDays,
    achieved: isPerfectMonth({ daysInMonth, dayCounts, filledHoleDays, grace }),
    status: currentMonthMakeupStatus({ daysInMonth, todayDayNum, dayCounts, filledHoleDays, grace }),
  };
}
