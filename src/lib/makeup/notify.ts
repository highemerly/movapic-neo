/**
 * 穴埋めポイント制の「穴埋めを促す」通知（サーバー専用）。
 *
 * - makeup-need-second: 今日1枚目を投稿した・残高がある・穴がある → 「今日2枚目を投稿しよう」
 * - makeup-ready:       今日2枚目を投稿した（または付与で残高ができた）・今すぐ割り当てられる組がある
 *                       → 「今すぐ穴埋めしよう」
 * どちらも 1日1通（受信者×type で、その人の今日（記録日）が始まって以降に既にあれば送らない）。
 * 「今日」「今月」は持ち主の記録日（日付の区切り）で決める。
 * 付与通知（makeup-point）は ledger.grantMakeupPoints が台帳と同一トランザクションで作る。
 *
 * 2026-09 以前の月（旧ルール・締切済み）では何もしない（旧通知 makeup-reminder の作成は撤去済み）。
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
import { parseYm } from "@/lib/jst";
import { dayOfMonth, dayStart, todayOf, ymOf, type PostDate } from "@/lib/dayClock";
import { loadSchedule, postDateBetween, withPostDate } from "@/lib/dayClock.server";
import { isMakeupEditable, isPointEra } from "./points";
import { resolveMakeupLimits } from "./ledger";
import { buildMonthMakeupState, donorRange, type MonthMakeupState } from "./donor";
import { MAKEUP_NOTIFICATION_TYPES, type MakeupNotificationType } from "./notificationTypes";

/**
 * 対象月の割当状況を読む。範囲は donorRange＝対象月の1日から締切（翌月10日）まで。
 * 翌月1〜10日の投稿も前月の donor になれるので、月の範囲だけ読むと穴埋め済みを見落とす。
 */
async function loadMonthMakeupState(userId: string, ym: string): Promise<MonthMakeupState> {
  const { from, to } = donorRange(ym);
  const rows = await prisma.image.findMany({
    where: { userId, postDate: postDateBetween(from, to) },
    select: { postDate: true, makeupTargetDay: true, makeupTargetMonthDelta: true },
  });
  return buildMonthMakeupState(withPostDate(rows), ym);
}

/** 同じ type の通知がその人の今日すでにあれば作らない（1日1通）。dayStartAt は今日が始まった時刻。 */
async function createOncePerDay(args: {
  userId: string;
  type: MakeupNotificationType;
  ym: string;
  dayStartAt: Date;
  imageId: string | null;
}): Promise<boolean> {
  const { userId, type, ym, dayStartAt, imageId } = args;
  const existing = await prisma.notification.findFirst({
    where: { userId, type, createdAt: { gte: dayStartAt } },
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
  /** 投稿の記録日。「今日」はこれ（評価は投稿の後に走るので、評価時点の今日だと日をまたぎうる）。 */
  postDate: PostDate;
}): Promise<void> {
  const { userId, imageId, postDate } = args;
  const ym = ymOf(postDate);
  if (!isPointEra(ym) || !isMakeupEditable(ym, postDate)) return;

  const [limits, state, schedule] = await Promise.all([
    // ポイント制の月は台帳だけで cap が決まり、所属ドメインは使わない。
    resolveMakeupLimits({ userId, instanceDomain: null, ym, today: postDate }),
    loadMonthMakeupState(userId, ym),
    loadSchedule(userId),
  ]);
  const { year, month } = parseYm(ym);
  const todayDayNum = dayOfMonth(postDate);
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

  await createOncePerDay({ userId, type, ym, dayStartAt: dayStart(schedule, postDate), imageId });
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
  const schedule = await loadSchedule(userId);
  const today = todayOf(schedule, now);
  // 付与は当月分にしか起きない。過去月・未来月・締切後には促さない。
  if (ym !== ymOf(today) || !isPointEra(ym) || !isMakeupEditable(ym, today)) return;

  const [limits, state] = await Promise.all([
    // ポイント制の月は台帳だけで cap が決まり、所属ドメインは使わない。
    resolveMakeupLimits({ userId, instanceDomain: null, ym, today }),
    loadMonthMakeupState(userId, ym),
  ]);

  const { year, month } = parseYm(ym);
  const daysInMonth = daysInMonthOf(year, month);
  const status = currentMonthMakeupStatus({
    daysInMonth,
    todayDayNum: dayOfMonth(today),
    dayCounts: state.dayCounts,
    filledHoleDays: state.filledHoleDays,
    todayHasDonor: state.donorDays.includes(dayOfMonth(today)),
    grace: limits.cap,
    potentialGrace: limits.potentialCap,
  });
  if (!canPromptMakeup(status)) return;
  if (!hasAssignableMakeup({ daysInMonth, ...state })) return;

  await createOncePerDay({
    userId,
    type: MAKEUP_NOTIFICATION_TYPES.READY,
    ym,
    dayStartAt: dayStart(schedule, today),
    imageId: null,
  });
}
