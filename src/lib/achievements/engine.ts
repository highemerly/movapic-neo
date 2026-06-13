/**
 * 実績評価エンジン。
 *
 * - selectNewlyGranted: 純粋関数。stats/post/取得済みキー から新規付与すべき実績を返す（DBなし）。
 *   live と backfill で同じ述語を共有するための中核。
 * - evaluateAndGrant: live 用。DBから stats を集め、新規付与を per-key insert（P2002スキップ）。
 *
 * 通知専用テーブルは持たない。Achievement 行がそのまま通知になる（実績1件＝通知1件を @@unique が保証）。
 */

import prisma from "@/lib/db";
import { toJstDateString } from "@/lib/streak";
import {
  CATALOG,
  evaluatePerfectMonth,
  PERFECT_MONTH_CATEGORY,
  type AchStats,
  type PostFacts,
} from "./catalog";
import { perfectMonthKey, shouldRemindMakeup } from "./perfectMonth";
import { collectStats } from "./stats";

export interface GrantCandidate {
  key: string;
  category: string;
}

export interface GrantedAchievement {
  key: string;
  category: string;
  grantedAt: Date;
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "P2002"
  );
}

/**
 * 新規付与すべき実績を選ぶ純粋関数（DBアクセスなし）。
 * 既取得キーは ownedKeys で除外する。
 */
export function selectNewlyGranted(
  stats: AchStats,
  post: PostFacts,
  ownedKeys: Set<string>
): GrantCandidate[] {
  const out: GrantCandidate[] = [];
  for (const def of CATALOG) {
    if (ownedKeys.has(def.key)) continue;
    if (def.evaluate(stats, post)) {
      out.push({ key: def.key, category: def.category });
    }
  }
  const pm = evaluatePerfectMonth(stats, post);
  if (pm && !ownedKeys.has(pm)) {
    out.push({ key: pm, category: PERFECT_MONTH_CATEGORY });
  }
  return out;
}

/**
 * live 用: 投稿後に呼び、新規付与した実績を返す。
 * 実績を付与すると同時に通知（type="achievement"）を1件作成する。
 * 投稿処理を絶対に止めないため、呼び出し側で try/catch すること（ここでは throw しうる）。
 *
 * @param imageId この投稿の画像ID（実績のきっかけ写真として記録・通知のサムネイルに使う）
 */
export async function evaluateAndGrant(opts: {
  userId: string;
  post: PostFacts;
  imageId: string;
}): Promise<GrantedAchievement[]> {
  const { userId, post, imageId } = opts;

  const owned = new Set(
    (
      await prisma.achievement.findMany({
        where: { userId },
        select: { key: true },
      })
    ).map((a) => a.key)
  );

  const stats = await collectStats(userId, post);
  const candidates = selectNewlyGranted(stats, post, owned);
  if (candidates.length === 0) return [];

  const granted: GrantedAchievement[] = [];
  for (const c of candidates) {
    try {
      const row = await prisma.achievement.create({
        data: { userId, key: c.key, category: c.category, imageId },
      });
      granted.push({ key: row.key, category: row.category, grantedAt: row.grantedAt });
    } catch (e) {
      // 並行投稿で同じ実績が同時付与された場合は unique 制約で弾かれる → スキップ
      if (!isUniqueViolation(e)) throw e;
    }
  }

  // 実際に付与できた実績ごとに通知を1件作る（実績1件＝通知1件）。
  if (granted.length > 0) {
    await prisma.notification.createMany({
      data: granted.map((g) => ({
        userId,
        type: "achievement",
        achievementKey: g.key,
        imageId,
      })),
    });
  }

  // 皆勤賞の穴埋め推奨通知（今日投稿した・穴がある・埋め切っていない人にだけ・月1通）。
  // 投稿フローを止めないため、ここは独立して握りつぶす。
  await maybeNotifyMakeup(userId, post, stats, imageId).catch((e) =>
    console.error("Makeup reminder failed:", e)
  );

  return granted;
}

/**
 * 穴埋め推奨通知。今日投稿した瞬間に評価され、条件を満たせば type="makeup-reminder" を1件作る。
 * - skippedSoFar = 今日より前の未投稿日数。今日は投稿済み(=stats に反映済み)なので
 *   「今月の経過日 - 投稿があった distinct 日数」で求まる。
 * - 重複排除: 同月キー(perfect-month:YYYY-MM)の makeup-reminder が既にあれば送らない（月1通）。
 */
async function maybeNotifyMakeup(
  userId: string,
  post: PostFacts,
  stats: AchStats,
  imageId: string
): Promise<void> {
  const jstDay = toJstDateString(post.createdAt);
  const elapsedDay = Number(jstDay.slice(8, 10));
  const skippedSoFar = elapsedDay - stats.distinctDaysInPostMonth;
  if (!shouldRemindMakeup(skippedSoFar, stats.doubleDaysInPostMonth)) return;

  const key = perfectMonthKey(jstDay.slice(0, 7));
  const existing = await prisma.notification.findFirst({
    where: { userId, type: "makeup-reminder", achievementKey: key },
    select: { id: true },
  });
  if (existing) return;

  await prisma.notification.create({
    data: { userId, type: "makeup-reminder", achievementKey: key, imageId },
  });
}
