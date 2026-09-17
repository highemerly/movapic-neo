/**
 * 穴埋めポイント台帳の読み書き（サーバー専用）。
 *
 * 「その月に穴埋めできる上限（cap）」の解決はここが唯一の場所。2026-09 以前の月は従来どおり
 * 所属インスタンスで決まる固定 grace、2026-10 以降は台帳（MakeupPointGrant）の付与合計。
 * perfectMonth.ts の判定式は grace の出所を問わないので、呼び出し側はここで解決した値を渡すだけでよい。
 *
 * 消費（どの穴を埋めたか）はここでは扱わない。Image.makeupTargetDay から導出する
 * （二重管理すると割当の自動付替・画像削除・退会の各経路で同期漏れが起きるため）。
 */

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import { perfectMonthGrace } from "@/lib/achievements/grace";
import { perfectMonthKey } from "@/lib/achievements/perfectMonth";
import { jstMonthRangeOfYm, shiftYm, toJstYm } from "@/lib/jst";
import {
  MAKEUP_POINT_REASONS,
  hasGrant,
  isPointEra,
  potentialCapOf,
  sumGrants,
  type MakeupPointReason,
} from "./points";
import { MAKEUP_NOTIFICATION_TYPES, type MakeupPointNotificationData } from "./notificationTypes";

/**
 * ユーザー×月で直列化したトランザクションの中で fn を実行する（穴埋め割当の read-modify-write 用）。
 *
 * 割当の書き込み（PATCH）は「月の割当を読む → 上限を検証 → 書く」なので、並行リクエストが両方とも
 * 検証を通ると上限を超えて割り当てられる。従来の上限3日では3多重が必要で実害が無かったが、
 * ポイント制では残り1pt が常態で、ダブルタップ1回で超過し得る。消費を台帳に持たない（導出）設計を
 * 保ったまま整合性を守るため、スキーマ変更の要らない advisory lock で直列化する。
 * ロックはトランザクション終了で自動解放される（xact 版）。
 */
export function withMonthMakeupLock<T>(
  userId: string,
  ym: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // pg_advisory_xact_lock は void を返し、Prisma が void 列を読めずに失敗するため int の1行に包む。
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`makeup:${userId}:${ym}`}, 0))) AS l`;
    return fn(tx);
  });
}

/** 台帳1行（表示用）。 */
export interface MakeupPointGrantRow {
  reason: string;
  amount: number;
  grantedAt: Date;
}

/** その月の付与行（古い順）。 */
export function getMonthGrants(userId: string, ym: string): Promise<MakeupPointGrantRow[]> {
  return prisma.makeupPointGrant.findMany({
    where: { userId, month: ym },
    orderBy: { grantedAt: "asc" },
    select: { reason: true, amount: true, grantedAt: true },
  });
}

/**
 * その月に穴埋めできる上限（cap）。
 * - 2026-09 以前: 所属インスタンスで決まる固定値（perfectMonthGrace）
 * - 2026-10 以降: その月の付与ポイント合計
 */
export async function resolveMakeupCap(args: {
  userId: string;
  instanceDomain: string | null | undefined;
  ym: string;
}): Promise<number> {
  const { userId, instanceDomain, ym } = args;
  if (!isPointEra(ym)) return perfectMonthGrace(instanceDomain);
  const agg = await prisma.makeupPointGrant.aggregate({
    where: { userId, month: ym },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/** その月の上限一式（表示・通知ゲート用）。 */
export interface MakeupLimits {
  /** ポイント制の月か。false なら grants は常に空で、cap は固定 grace。 */
  pointEra: boolean;
  /** 今埋められる上限。割当の可否はこれで決める。 */
  cap: number;
  /** 月内にまだ付与されうる分も含めた上限。「達成可能か」の判定にだけ使う。 */
  potentialCap: number;
  grants: MakeupPointGrantRow[];
}

/**
 * cap に加えて potentialCap と付与行も返す（カレンダー表示・通知ゲート用）。
 *
 * potentialCap の catchup 見込みは「先月の皆勤賞の Achievement 行が無い」で推定する。
 * 1〜10日は先月の穴埋めがまだ可能で、後から先月が皆勤になれば catchup は来ない。つまり
 * 見込みは楽観側にずれうるが、使い道は「まだ達成可能として促すか」だけで、割当の可否には
 * 使わないので実害は「来なかった1pt ぶん促しすぎる」に留まる。
 * 実際の catchup 付与は定期ジョブがデータから再計算して決める（Achievement 行は信用しない）。
 */
export async function resolveMakeupLimits(args: {
  userId: string;
  instanceDomain: string | null | undefined;
  ym: string;
  now: Date;
}): Promise<MakeupLimits> {
  const { userId, instanceDomain, ym, now } = args;
  if (!isPointEra(ym)) {
    const grace = perfectMonthGrace(instanceDomain);
    return { pointEra: false, cap: grace, potentialCap: grace, grants: [] };
  }

  const grants = await getMonthGrants(userId, ym);
  const isCurrentMonth = ym === toJstYm(now);
  let catchupEligible = false;
  if (isCurrentMonth && !hasGrant(grants, MAKEUP_POINT_REASONS.MONTHLY_CATCHUP)) {
    catchupEligible = await isCatchupCandidate(userId, ym);
  }
  return {
    pointEra: true,
    cap: sumGrants(grants),
    potentialCap: potentialCapOf({ grants, isCurrentMonth, catchupEligible }),
    grants,
  };
}

/** 先月中に既にアカウントがあり、先月の皆勤賞行が無いか（potentialCap の見込み用の推定）。 */
async function isCatchupCandidate(userId: string, ym: string): Promise<boolean> {
  const { start } = jstMonthRangeOfYm(ym);
  const [user, lastMonthPerfect] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
    prisma.achievement.findFirst({
      where: { userId, key: perfectMonthKey(shiftYm(ym, -1)) },
      select: { id: true },
    }),
  ]);
  return !!user && user.createdAt < start && !lastMonthPerfect;
}

/**
 * ポイントを付与し、同じトランザクションで付与通知を1件作る。
 * 同じ (user, month, reason) が既にあれば何もしない（@@unique が弾く＝定期ジョブが何度走っても冪等）。
 * 通知は台帳行と同一トランザクションなので、通知だけ重複・欠落することは無い。
 *
 * @returns 新規に付与したら true。amount<=0（行を作らない）や既に付与済みなら false。
 */
export async function grantMakeupPoints(args: {
  userId: string;
  ym: string;
  reason: MakeupPointReason;
  amount: number;
}): Promise<boolean> {
  const { userId, ym, reason, amount } = args;
  // 0pt の行は作らない（「0pt獲得しました」通知が出てしまうため）。
  if (amount <= 0) return false;
  const data: MakeupPointNotificationData = { reason, amount };
  try {
    await prisma.$transaction([
      prisma.makeupPointGrant.create({ data: { userId, month: ym, reason, amount } }),
      prisma.notification.create({
        data: {
          userId,
          type: MAKEUP_NOTIFICATION_TYPES.POINT,
          achievementKey: perfectMonthKey(ym),
          data: { ...data },
        },
      }),
    ]);
    return true;
  } catch (e) {
    if (isUniqueViolation(e)) return false;
    throw e;
  }
}
