/**
 * 実績バックフィルスクリプト（冪等）
 *
 * 1. 既存ユーザーの過去投稿を時系列でリプレイし、条件を満たした実績を付与する。
 *    各実績の grantedAt / imageId は「達成した投稿（閾値を超えた1枚）」の値を使う（真の獲得日）。
 * 2. 通知が無い実績に対して通知(type="achievement")を生成する。
 *    通知の createdAt は実績の grantedAt（過去日）にするため、フィードには履歴が並ぶが
 *    ベルの赤ドットは初回アクセス時の now 基準なので光らない。
 *
 * 評価ロジックは live と同じ CATALOG / evaluatePerfectMonth を共有する。
 * 違いは stats の作り方だけ（live はDBクエリ、backfill はメモリ上のリプレイ）。
 *
 * 使用方法:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/backfill-achievements.ts
 *
 * 再実行可能: 実績は createMany({ skipDuplicates })、通知は「既に通知がある実績」を除外して挿入する。
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { toJstDateString } from "@/lib/streak";
import {
  CATALOG,
  evaluatePerfectMonth,
  evaluateSeason,
  PERFECT_MONTH_CATEGORY,
  SEASON_CATEGORY,
  type AchStats,
  type PostFacts,
} from "@/lib/achievements/catalog";
import { perfectMonthGrace, summarizeDayCounts } from "@/lib/achievements/perfectMonth";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// JST日付文字列の前日
function prevDay(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// daySet を使って day で終わる連続日数を求める
function streakEndingAt(daySet: Set<string>, day: string): number {
  let n = 0;
  let cur = day;
  while (daySet.has(cur)) {
    n++;
    cur = prevDay(cur);
  }
  return n;
}

interface ReplayImage {
  id: string;
  createdAt: Date;
  overlayText: string;
  position: string;
  font: string;
  color: string;
  size: string;
  arrangement: string;
  season: string | null;
  source: string;
  cameraModel: string | null;
  locationPrefecture: string | null;
  postUrl: string | null;
  postId: string | null;
  makeupTargetDay: number | null;
}

interface GrantRow {
  userId: string;
  key: string;
  category: string;
  imageId: string;
  grantedAt: Date;
}

function replayUser(userId: string, images: ReplayImage[], grace: number): GrantRow[] {
  const grants: GrantRow[] = [];
  const grantedKeys = new Set<string>();

  // running 集計
  let totalPosts = 0;
  const allDays = new Set<string>();
  const dayCounts = new Map<string, number>();
  // JST日 -> その日に使った source の集合（ハットトリック判定）
  const daySources = new Map<string, Set<string>>();
  // ym -> (JST日 -> その日の投稿数)。distinct日数 / 皆勤賞判定をここから出す。
  const monthDayCounts = new Map<string, Map<string, number>>();
  // ym -> その月で永続化された穴埋め割当（makeupTargetDay）が指す空き日。皆勤賞判定の単一ソース。
  // live=collectStats（DBから当月分を読む）と同形式。backfill は時系列リプレイで running に積む。
  const monthFilledHoles = new Map<string, number[]>();
  const featureCounts = { neon: 0, stamp: 0, xlarge: 0, vertical: 0 };
  const fonts = new Set<string>();
  const colors = new Set<string>();
  const cameras = new Set<string>();
  const prefectures = new Set<string>();
  let hasEmailPost = false;
  let hasMentionPost = false;

  for (const img of images) {
    const day = toJstDateString(img.createdAt);
    const ym = day.slice(0, 7);

    totalPosts += 1;
    allDays.add(day);
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    if (!daySources.has(day)) daySources.set(day, new Set());
    daySources.get(day)!.add(img.source);
    if (!monthDayCounts.has(ym)) monthDayCounts.set(ym, new Map());
    const mdc = monthDayCounts.get(ym)!;
    mdc.set(day, (mdc.get(day) ?? 0) + 1);

    // この投稿(donor)が永続的な穴埋め割当を持つなら、その月の filledHoleDays に積む。
    // donor は穴より後の日に投稿されるためリプレイ順で正しいタイミングに加算される
    //（＝穴が埋まり切った donor 投稿の瞬間に皆勤賞が確定する）。
    if (img.makeupTargetDay != null) {
      if (!monthFilledHoles.has(ym)) monthFilledHoles.set(ym, []);
      monthFilledHoles.get(ym)!.push(img.makeupTargetDay);
    }

    // 案B（完全隔離）: season 投稿はスタイル列が中立デフォルトなので、スタイル系の集計から除外する
    // （live=stats.ts の season:null フィルタと同期）。投稿数/連続/source/カメラ・位置情報は実値なので数える。
    if (!img.season) {
      if (img.arrangement === "neon") featureCounts.neon += 1;
      if (img.arrangement === "stamp") featureCounts.stamp += 1;
      if (img.size === "extra-large") featureCounts.xlarge += 1;
      if (img.position === "left" || img.position === "right") featureCounts.vertical += 1;
      fonts.add(img.font);
      colors.add(img.color);
    }
    if (img.cameraModel) cameras.add(img.cameraModel);
    if (img.locationPrefecture) prefectures.add(img.locationPrefecture);
    if (img.source === "email") hasEmailPost = true;
    if (img.source === "mention") hasMentionPost = true;

    const monthSummary = summarizeDayCounts(mdc.values());
    // 日(1-31)→投稿数（穴埋めの日付順マッチング用。live=stats.ts と同一形式）
    const postMonthDayCounts: Record<number, number> = {};
    for (const [dayStr, c] of mdc) {
      postMonthDayCounts[Number(dayStr.slice(8, 10))] = c;
    }
    const stats: AchStats = {
      totalPosts,
      currentStreak: streakEndingAt(allDays, day),
      todayPosts: dayCounts.get(day) ?? 0,
      distinctDaysInPostMonth: monthSummary.distinctDays,
      postMonthDayCounts,
      filledHoleDays: monthFilledHoles.get(ym) ?? [],
      featureCounts: { ...featureCounts },
      distinctFonts: fonts.size,
      distinctColors: colors.size,
      distinctCameraModels: cameras.size,
      distinctPrefectures: prefectures.size,
      hasEmailPost,
      hasMentionPost,
      distinctSourcesToday: daySources.get(day)?.size ?? 0,
    };
    const post: PostFacts = {
      overlayText: img.overlayText,
      position: img.position,
      font: img.font,
      color: img.color,
      size: img.size,
      arrangement: img.arrangement,
      season: img.season,
      source: img.source,
      cameraModel: img.cameraModel,
      locationPrefecture: img.locationPrefecture,
      // visibility は Image に保存されていないため近似: Fediverse未投稿(postUrl/postId なし)=local
      visibility: img.postUrl == null && img.postId == null ? "local" : "public",
      createdAt: img.createdAt,
    };

    // 固定実績
    for (const def of CATALOG) {
      if (grantedKeys.has(def.key)) continue;
      if (def.evaluate(stats, post)) {
        grantedKeys.add(def.key);
        grants.push({
          userId,
          key: def.key,
          category: def.category,
          imageId: img.id,
          grantedAt: img.createdAt,
        });
      }
    }
    // 皆勤賞（動的）
    const pm = evaluatePerfectMonth(stats, post, grace);
    if (pm && !grantedKeys.has(pm)) {
      grantedKeys.add(pm);
      grants.push({
        userId,
        key: pm,
        category: PERFECT_MONTH_CATEGORY,
        imageId: img.id,
        grantedAt: img.createdAt,
      });
    }
    // シーズン（期間限定・動的）
    const season = evaluateSeason(post);
    if (season && !grantedKeys.has(season)) {
      grantedKeys.add(season);
      grants.push({
        userId,
        key: season,
        category: SEASON_CATEGORY,
        imageId: img.id,
        grantedAt: img.createdAt,
      });
    }
  }

  return grants;
}

// アーリーアダプター配布の締め: この時刻より前に登録したユーザーに一度きりで配る（2026-06-14 JST まで）。
// 固定値なので再実行しても、締め後に登録した新規ユーザーには付与されない。
const EARLY_ADOPTER_CUTOFF = new Date("2026-06-15T00:00:00+09:00");

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      createdAt: true,
      instance: { select: { domain: true } },
    },
  });
  console.log(`対象ユーザー: ${users.length}人`);

  let totalGranted = 0;
  let totalNotified = 0;
  for (const user of users) {
    let grantedCount = 0;

    // 0. アーリーアダプター（投稿不要・登録日ベース。grantedAt=登録日）。
    if (user.createdAt < EARLY_ADOPTER_CUTOFF) {
      const res = await prisma.achievement.createMany({
        data: [
          {
            userId: user.id,
            key: "early-adopter",
            category: "early-adopter",
            grantedAt: user.createdAt,
          },
        ],
        skipDuplicates: true,
      });
      grantedCount += res.count;
      totalGranted += res.count;
    }

    const images = await prisma.image.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        overlayText: true,
        position: true,
        font: true,
        color: true,
        size: true,
        arrangement: true,
        season: true,
        source: true,
        cameraModel: true,
        locationPrefecture: true,
        postUrl: true,
        postId: true,
        makeupTargetDay: true,
      },
    });

    // 1. 投稿ベースの実績付与
    if (images.length > 0) {
      const grants = replayUser(user.id, images, perfectMonthGrace(user.instance.domain));
      if (grants.length > 0) {
        const result = await prisma.achievement.createMany({ data: grants, skipDuplicates: true });
        grantedCount += result.count;
        totalGranted += result.count;
      }
    }

    // 2. 通知の補填: まだ通知が無い実績に対して通知を作る（createdAt=grantedAt）。
    //    既存ユーザー（実績はあるが通知が無い）も、再実行時の重複も、ここで吸収する。
    const achievements = await prisma.achievement.findMany({
      where: { userId: user.id },
      select: { key: true, imageId: true, grantedAt: true },
    });
    const notifiedKeys = new Set(
      (
        await prisma.notification.findMany({
          where: { userId: user.id, type: "achievement" },
          select: { achievementKey: true },
        })
      ).map((n) => n.achievementKey)
    );
    const toNotify = achievements.filter((a) => !notifiedKeys.has(a.key));
    if (toNotify.length > 0) {
      await prisma.notification.createMany({
        data: toNotify.map((a) => ({
          userId: user.id,
          type: "achievement",
          achievementKey: a.key,
          imageId: a.imageId,
          createdAt: a.grantedAt,
        })),
      });
      totalNotified += toNotify.length;
    }

    if (grantedCount > 0 || toNotify.length > 0) {
      console.log(
        `  @${user.username}: 新規付与${grantedCount}件 / 通知補填${toNotify.length}件`
      );
    }
  }

  console.log(`完了: 新規付与 合計 ${totalGranted}件 / 通知補填 合計 ${totalNotified}件`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
