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
  evaluateSeason,
  isPostAchievement,
  isProfileAchievement,
  isReactionAchievement,
  PERFECT_MONTH_CATEGORY,
  SEASON_CATEGORY,
  type AchStats,
  type PostFacts,
  type ProfileFacts,
  type ReactionStats,
} from "./catalog";
import {
  currentMonthMakeupStatus,
  daysInMonthOf,
  perfectMonthKey,
  shouldRemindMakeup,
} from "./perfectMonth";
import { perfectMonthGrace } from "./grace";
import { collectReactionStats, collectStats } from "./stats";

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
 * grace は皆勤賞の未投稿許容日数（投稿者の所属インスタンスで決まる）。
 */
export function selectNewlyGranted(
  stats: AchStats,
  post: PostFacts,
  ownedKeys: Set<string>,
  grace: number
): GrantCandidate[] {
  const out: GrantCandidate[] = [];
  for (const def of CATALOG) {
    // 他系統（リアクション・プロフィール）は投稿では確定しない＝それぞれの select 側で評価する
    if (!isPostAchievement(def)) continue;
    if (ownedKeys.has(def.key)) continue;
    if (def.evaluate(stats, post)) {
      out.push({ key: def.key, category: def.category });
    }
  }
  const pm = evaluatePerfectMonth(stats, post, grace);
  if (pm && !ownedKeys.has(pm)) {
    out.push({ key: pm, category: PERFECT_MONTH_CATEGORY });
  }
  // シーズン（期間限定）: この投稿が season を持てば、そのシーズンのバッジを付与。
  const season = evaluateSeason(post);
  if (season && !ownedKeys.has(season)) {
    out.push({ key: season, category: SEASON_CATEGORY });
  }
  return out;
}

/**
 * リアクション起点の実績から新規付与すべきものを選ぶ純粋関数（DBアクセスなし）。
 * 投稿と違い「押した／受け取った瞬間」にしか確定しないため、評価も付与も別経路にする。
 */
export function selectNewlyGrantedReaction(
  stats: ReactionStats,
  ownedKeys: Set<string>
): GrantCandidate[] {
  const out: GrantCandidate[] = [];
  for (const def of CATALOG) {
    if (!isReactionAchievement(def)) continue;
    if (ownedKeys.has(def.key)) continue;
    if (def.evaluate(stats)) {
      out.push({ key: def.key, category: def.category });
    }
  }
  return out;
}

/**
 * プロフィール起点の実績から新規付与すべきものを選ぶ純粋関数（DBアクセスなし）。
 * 自己紹介は投稿・リアクションのどちらでも動かないため、保存した瞬間にだけ評価する。
 */
export function selectNewlyGrantedProfile(
  facts: ProfileFacts,
  ownedKeys: Set<string>
): GrantCandidate[] {
  const out: GrantCandidate[] = [];
  for (const def of CATALOG) {
    if (!isProfileAchievement(def)) continue;
    if (ownedKeys.has(def.key)) continue;
    if (def.evaluate(facts)) {
      out.push({ key: def.key, category: def.category });
    }
  }
  return out;
}

/** 既に付与済みの実績キー。 */
async function ownedKeysOf(userId: string): Promise<Set<string>> {
  const rows = await prisma.achievement.findMany({ where: { userId }, select: { key: true } });
  return new Set(rows.map((a) => a.key));
}

/**
 * 候補を per-key insert し、付与できたぶんだけ通知を1件ずつ作る（実績1件＝通知1件）。
 *
 * 実績の imageId と通知の imageId を分けて受けるのは、リアクション起点の実績が
 * 「その写真を投稿したから獲得した実績」ではないため。画像詳細ページの
 * 「この投稿で獲得した実績」は imageId だけで引くので、リアクション起点の実績には
 * 一切 imageId を残さない（他人の写真に自分の実績が紐づく／自分の写真でも投稿と無関係な
 * 実績が並ぶ）。通知のサムネイル・遷移先としては当該写真でよい。
 */
async function grantAll(
  userId: string,
  candidates: GrantCandidate[],
  images: { achievementImageId: string | null; notificationImageId: string | null }
): Promise<GrantedAchievement[]> {
  const granted: GrantedAchievement[] = [];
  for (const c of candidates) {
    try {
      const row = await prisma.achievement.create({
        data: { userId, key: c.key, category: c.category, imageId: images.achievementImageId },
      });
      granted.push({ key: row.key, category: row.category, grantedAt: row.grantedAt });
    } catch (e) {
      // 並行実行で同じ実績が同時付与された場合は unique 制約で弾かれる → スキップ
      if (!isUniqueViolation(e)) throw e;
    }
  }

  if (granted.length > 0) {
    await prisma.notification.createMany({
      data: granted.map((g) => ({
        userId,
        type: "achievement",
        achievementKey: g.key,
        imageId: images.notificationImageId,
      })),
    });
  }
  return granted;
}

/**
 * live 用: リアクションが動いた後に呼び、新規付与した実績を返す。
 * 呼び出し側（リアクションAPI・お気に入り同期）は reactionTriggers.ts 経由で使う。
 *
 * 実績側の imageId は常に null。リアクション起点の実績は「押した／獲得した」の累計で決まり、
 * どの写真を投稿したかとは無関係なので、画像詳細ページの「この投稿で獲得した実績」に混ぜない。
 */
export async function evaluateAndGrantReaction(opts: {
  userId: string;
  notificationImageId: string | null;
}): Promise<GrantedAchievement[]> {
  const owned = await ownedKeysOf(opts.userId);
  const stats = await collectReactionStats(opts.userId);
  const candidates = selectNewlyGrantedReaction(stats, owned);
  if (candidates.length === 0) return [];
  return grantAll(opts.userId, candidates, {
    achievementImageId: null,
    notificationImageId: opts.notificationImageId,
  });
}

/**
 * live 用: プロフィールを保存した後に呼び、新規付与した実績を返す。
 * 呼び出し側（PATCH /api/v1/me）は profileTriggers.ts 経由で使う。
 *
 * 実績・通知とも imageId は常に null（自己紹介はどの写真とも関係が無い）。
 */
export async function evaluateAndGrantProfile(opts: {
  userId: string;
  bio: string | null;
}): Promise<GrantedAchievement[]> {
  const owned = await ownedKeysOf(opts.userId);
  const candidates = selectNewlyGrantedProfile({ bio: opts.bio }, owned);
  if (candidates.length === 0) return [];
  return grantAll(opts.userId, candidates, {
    achievementImageId: null,
    notificationImageId: null,
  });
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
  /** 投稿者の所属インスタンスドメイン（皆勤賞の穴埋め枠 grace の決定に使う）。 */
  instanceDomain: string;
}): Promise<GrantedAchievement[]> {
  const { userId, post, imageId, instanceDomain } = opts;
  const grace = perfectMonthGrace(instanceDomain);

  const owned = await ownedKeysOf(userId);

  const stats = await collectStats(userId, post);
  const candidates = selectNewlyGranted(stats, post, owned, grace);
  if (candidates.length === 0) return [];

  const granted = await grantAll(userId, candidates, {
    achievementImageId: imageId,
    notificationImageId: imageId,
  });

  // 皆勤賞の穴埋め推奨通知（今日投稿した・穴がある・埋め切っていない人にだけ・月1通）。
  // 投稿フローを止めないため、ここは独立して握りつぶす。
  await maybeNotifyMakeup(userId, post, stats, imageId, grace).catch((e) =>
    console.error("Makeup reminder failed:", e)
  );

  return granted;
}

/**
 * 穴埋め推奨通知。今日投稿した瞬間に評価され、条件を満たせば type="makeup-reminder" を1件作る。
 * - 穴埋めは「忘れた過去日」を「後日のダブル投稿」で埋める制度なので、日付順マッチングで
 *   「まだ埋まっていない過去の穴(unfilled)」を厳密に数える（currentMonthMakeupStatus）。
 * - 重複排除: 同月キー(perfect-month:YYYY-MM)の makeup-reminder が既にあれば送らない（月1通）。
 */
async function maybeNotifyMakeup(
  userId: string,
  post: PostFacts,
  stats: AchStats,
  imageId: string,
  grace: number
): Promise<void> {
  const jstDay = toJstDateString(post.createdAt);
  const todayDayNum = Number(jstDay.slice(8, 10));
  const year = Number(jstDay.slice(0, 4));
  const month = Number(jstDay.slice(5, 7));
  const status = currentMonthMakeupStatus({
    daysInMonth: daysInMonthOf(year, month),
    todayDayNum,
    dayCounts: stats.postMonthDayCounts,
    filledHoleDays: stats.filledHoleDays,
    grace,
  });
  if (!shouldRemindMakeup(status.skippedSoFar, status.unfilled)) return;

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
