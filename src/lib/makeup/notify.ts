/**
 * 穴埋めポイント制の「穴埋めを促す」通知（サーバー専用）。
 *
 * - makeup-need-second: 今日1枚目を投稿した・残高がある・穴がある → 「今日2枚目を投稿しよう」
 * - makeup-ready:       今日2枚目を投稿した（または付与で残高ができた）・今すぐ割り当てられる組がある
 *                       → 「今すぐ穴埋めしよう」
 * どちらも 1日1通（受信者×type で JST の今日 00:00 以降に既にあれば送らない）。
 * 付与通知（makeup-point）は ledger.grantMakeupPoints が台帳と同一トランザクションで作る。
 *
 * 2026-09 以前の月は従来の makeup-reminder（engine.maybeNotifyMakeup）の担当で、ここは何もしない。
 * 集計対象は「全投稿」（collectStats と同一。isPublic/isDisabled で絞らない＝実績の判定と揃える）。
 */

import prisma from "@/lib/db";
import {
  canPromptMakeup,
  currentMonthMakeupStatus,
  daysInMonthOf,
  hasAssignableMakeup,
  perfectMonthKey,
} from "@/lib/achievements/perfectMonth";
import { jstDayOf, jstDayStart, parseYm, toJstYm } from "@/lib/jst";
import { isMakeupEditable, isPointEra } from "./points";
import { resolveMakeupLimits } from "./ledger";
import { buildMonthMakeupState, donorRange, type MonthMakeupState } from "./donor";
import { MAKEUP_NOTIFICATION_TYPES, type MakeupNotificationType } from "./notificationTypes";

/**
 * 対象月の割当状況を読む。範囲は donorRange＝対象月の1日から締切（翌月10日）まで。
 * 翌月1〜10日の投稿も前月の donor になれるので、月の範囲だけ読むと穴埋め済みを見落とす。
 */
async function loadMonthMakeupState(userId: string, ym: string): Promise<MonthMakeupState> {
  const { start, end } = donorRange(ym);
  const rows = await prisma.image.findMany({
    where: { userId, createdAt: { gte: start, lt: end } },
    select: { createdAt: true, makeupTargetDay: true, makeupTargetMonthDelta: true },
  });
  return buildMonthMakeupState(rows, ym);
}

/** 同じ type の通知が JST の今日すでにあれば作らない（1日1通）。 */
async function createOncePerDay(args: {
  userId: string;
  type: MakeupNotificationType;
  ym: string;
  now: Date;
  imageId: string | null;
}): Promise<boolean> {
  const { userId, type, ym, now, imageId } = args;
  const existing = await prisma.notification.findFirst({
    where: { userId, type, createdAt: { gte: jstDayStart(now) } },
    select: { id: true },
  });
  if (existing) return false;
  await prisma.notification.create({
    // achievementKey は対象月（通知から対象月のカレンダーへ飛ぶため）。日付は詰めない。
    data: { userId, type, achievementKey: perfectMonthKey(ym), imageId },
  });
  return true;
}

/**
 * 投稿した瞬間の促し（makeup-need-second / makeup-ready）。engine.evaluateAndGrant から、実績評価の後に呼ぶ。
 * 投稿フローを止めないため呼び出し側で .catch すること。
 *
 * 割当状況は AchStats から受け取らず、ここで当月分を読む。donor の有無を AchStats に足すと
 * backfill のリプレイ側にも同形式の集計が要る（live と backfill の同期不変条件）が、
 * これはポイント制の当月だけの関心事で、backfill には無関係なため。
 */
export async function notifyMakeupProgressOnPost(args: {
  userId: string;
  imageId: string;
  now: Date;
}): Promise<void> {
  const { userId, imageId, now } = args;
  const ym = toJstYm(now);
  if (!isPointEra(ym) || !isMakeupEditable(ym, now)) return;

  const [limits, state] = await Promise.all([
    // ポイント制の月は台帳だけで cap が決まり、所属ドメインは使わない。
    resolveMakeupLimits({ userId, instanceDomain: null, ym, now }),
    loadMonthMakeupState(userId, ym),
  ]);
  const { year, month } = parseYm(ym);
  const todayDayNum = jstDayOf(now);
  const status = currentMonthMakeupStatus({
    daysInMonth: daysInMonthOf(year, month),
    todayDayNum,
    dayCounts: state.dayCounts,
    filledHoleDays: state.filledHoleDays,
    todayHasDonor: state.donorDays.includes(todayDayNum),
    grace: limits.cap,
    potentialGrace: limits.potentialCap,
  });
  if (!canPromptMakeup(status)) return;

  let type: MakeupNotificationType | null = null;
  if (status.todayPosts === 1) type = MAKEUP_NOTIFICATION_TYPES.NEED_SECOND;
  else if (status.todayPosts >= 2 && !status.todayHasDonor) type = MAKEUP_NOTIFICATION_TYPES.READY;
  if (!type) return;

  await createOncePerDay({ userId, type, ym, now, imageId });
}

/**
 * ポイントを付与した直後に、その場で穴埋めできる状態なら「今すぐ穴埋めしよう」も送る。
 * 付与通知だけだと「で、何をすればいいの？」で終わり、穴を埋める行動に繋がらないため。
 * 1日1通の制限は投稿時の makeup-ready と共通（同じ日に2通は来ない）。
 * 付与処理（ログイン・定期ジョブ・実績付与）を止めないため呼び出し側で .catch すること。
 */
export async function notifyMakeupReadyAfterGrant(args: {
  userId: string;
  ym: string;
  now: Date;
}): Promise<void> {
  const { userId, ym, now } = args;
  // 付与は当月分にしか起きない。過去月・未来月・締切後には促さない。
  if (ym !== toJstYm(now) || !isPointEra(ym) || !isMakeupEditable(ym, now)) return;

  const [limits, state] = await Promise.all([
    // ポイント制の月は台帳だけで cap が決まり、所属ドメインは使わない。
    resolveMakeupLimits({ userId, instanceDomain: null, ym, now }),
    loadMonthMakeupState(userId, ym),
  ]);

  const { year, month } = parseYm(ym);
  const daysInMonth = daysInMonthOf(year, month);
  const status = currentMonthMakeupStatus({
    daysInMonth,
    todayDayNum: jstDayOf(now),
    dayCounts: state.dayCounts,
    filledHoleDays: state.filledHoleDays,
    todayHasDonor: state.donorDays.includes(jstDayOf(now)),
    grace: limits.cap,
    potentialGrace: limits.potentialCap,
  });
  if (!canPromptMakeup(status)) return;
  if (!hasAssignableMakeup({ daysInMonth, ...state })) return;

  await createOncePerDay({
    userId,
    type: MAKEUP_NOTIFICATION_TYPES.READY,
    ym,
    now,
    imageId: null,
  });
}
