/**
 * 「直近の皆勤賞」判定（ユーザーアイコンの王冠表示用）。
 * 皆勤賞は Achievement 行（key="perfect-month:YYYY-MM"）として確定保存されるため、
 * 該当月の YYYY-MM のキーが存在するかだけで判定できる（再集計は不要）。
 *
 * 月末最終日には当月分の皆勤賞が確定し得るため、先月分・今月分の
 * どちらかが取れていれば王冠を表示する。
 */

import prisma from "@/lib/db";
import { perfectMonthKey } from "./perfectMonth";
import { toJstDateString } from "@/lib/streak";

/** JST基準の今月の YYYY-MM。 */
export function thisMonthYm(now: Date = new Date()): string {
  return toJstDateString(now).slice(0, 7);
}

/** JST基準の先月の YYYY-MM。 */
export function lastMonthYm(now: Date = new Date()): string {
  const [y, m] = toJstDateString(now).split("-").map(Number);
  const year = m === 1 ? y - 1 : y;
  const month = m === 1 ? 12 : m - 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * 指定ユーザーが直近（先月または今月）の皆勤賞を獲得しているか。
 * 月末最終日に当月分が確定するケースを取りこぼさないよう両月を見る。
 */
export async function hasRecentPerfectAttendance(userId: string): Promise<boolean> {
  const keys = [perfectMonthKey(lastMonthYm()), perfectMonthKey(thisMonthYm())];
  const row = await prisma.achievement.findFirst({
    where: { userId, key: { in: keys } },
    select: { id: true },
  });
  return row !== null;
}
