/**
 * 「直近の皆勤賞」判定（ユーザーアイコンの王冠表示用）。
 * 皆勤賞は Achievement 行（key="perfect-month:YYYY-MM"）として確定保存されるため、
 * 該当月の YYYY-MM のキーが存在するかだけで判定できる（再集計は不要）。
 *
 * 月末最終日には当月分の皆勤賞が確定し得るため、先月分・今月分の
 * どちらかが取れていれば王冠を表示する。
 */

import prisma from "@/lib/db";
import { shiftYm } from "@/lib/jst";
import { ymOf, type PostDate } from "@/lib/dayClock";
import { loadToday } from "@/lib/dayClock.server";
import { perfectMonthKey } from "./perfectMonth";

/** 今月の YYYY-MM。today は持ち主の今日（記録日）。 */
export function thisMonthYm(today: PostDate): string {
  return ymOf(today);
}

/** 先月の YYYY-MM。today は持ち主の今日（記録日）。 */
export function lastMonthYm(today: PostDate): string {
  return shiftYm(ymOf(today), -1);
}

/**
 * 指定ユーザーが直近（先月または今月）の皆勤賞を獲得しているか。
 * 月末最終日に当月分が確定するケースを取りこぼさないよう両月を見る。
 * 今月・先月は持ち主の今日で決める（閲覧者の区切りではない）。
 */
export async function hasRecentPerfectAttendance(userId: string): Promise<boolean> {
  const today = await loadToday(userId, new Date());
  const keys = [perfectMonthKey(lastMonthYm(today)), perfectMonthKey(thisMonthYm(today))];
  const row = await prisma.achievement.findFirst({
    where: { userId, key: { in: keys } },
    select: { id: true },
  });
  return row !== null;
}
