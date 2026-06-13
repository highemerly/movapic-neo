/**
 * 皆勤賞ロジックの単一ソース（しきい値・判定式・進捗・穴埋め通知ゲートを集約）。
 *
 * 「皆勤賞」は『未投稿を PERFECT_MONTH_GRACE 日まで許容し、その分を同月の別日に
 * 2枚以上投稿（＝ダブル投稿）して穴埋めできる』制度。判定の中核を1箇所に集め、
 * live(stats/engine) / backfill / カレンダーAPI / 穴埋め通知 の4経路がすべてここを呼ぶ。
 *
 * catalog.ts と同じく「サーバー/クライアント両方から import されうる」ため、
 * React・サーバー専用 API を import しないこと（型・純粋関数のみ）。
 */

/** 皆勤賞の系列キー（DBの category 列）。動的キーは "perfect-month:YYYY-MM"。 */
export const PERFECT_MONTH_CATEGORY = "perfect-month";

/** 未投稿として許容する日数。これを超える未投稿があるとその月の皆勤賞は不成立。 */
export const PERFECT_MONTH_GRACE = 4;

/** 穴埋め推奨通知を送る／カレンダーで注意を促す「過ぎた未投稿日数」の上限。超えたら出さない。 */
export const MAKEUP_REMINDER_MAX_SKIPPED = 5;

/** "2026-06" → "perfect-month:2026-06" */
export function perfectMonthKey(ym: string): string {
  return `${PERFECT_MONTH_CATEGORY}:${ym}`;
}

/** その年月（month は 1 始まり）の日数。 */
export function daysInMonthOf(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * 日別投稿数の集まり（各日の投稿枚数）→ 集計値。
 * - distinctDays: 1枚以上投稿した日数
 * - doubleDays: 2枚以上投稿した日数（＝穴埋めに使えるストック）
 */
export function summarizeDayCounts(counts: Iterable<number>): {
  distinctDays: number;
  doubleDays: number;
} {
  let distinctDays = 0;
  let doubleDays = 0;
  for (const c of counts) {
    if (c >= 1) distinctDays++;
    if (c >= 2) doubleDays++;
  }
  return { distinctDays, doubleDays };
}

/**
 * 皆勤賞の達成判定（純粋）。
 * missing(= daysInMonth - distinctDays) が GRACE 以内で、かつダブル投稿した日数(doubleDays)が
 * その未投稿日数以上（＝穴を埋め切っている）なら達成。
 * distinctDays === daysInMonth（完全皆勤）なら missing=0 で常に成立（従来達成者と後方互換）。
 */
export function isPerfectMonth(
  daysInMonth: number,
  distinctDays: number,
  doubleDays: number
): boolean {
  const missing = daysInMonth - distinctDays;
  return missing >= 0 && missing <= PERFECT_MONTH_GRACE && doubleDays >= missing;
}

export interface PerfectMonthProgress {
  /** その月の皆勤賞を達成しているか（穴埋め込み）。 */
  achieved: boolean;
  /** 月全体の未投稿日数（達成判定基準。当月は未来日も含む）。 */
  missing: number;
  /** ダブル投稿した日数（＝穴埋めストック）。 */
  makeupBank: number;
  /** 当月のみ: 今日より前の未投稿日数。過去/未来月の判定では null。 */
  skippedSoFar: number | null;
  /** 当月のみ: まだ埋まっていない穴の数 max(0, skippedSoFar - makeupBank)。 */
  shortfall: number | null;
  /** 当月のみ: まだ皆勤賞に手が届く範囲か（skippedSoFar <= GRACE）。 */
  stillAchievable: boolean | null;
}

/**
 * 達成判定＋（当月なら）進捗を返す。カレンダーAPI・通知で共用。
 * 当月の skippedSoFar は postedDayNums と todayDayNum から「今日より前の未投稿」を厳密に数える。
 */
export function perfectMonthProgress(args: {
  daysInMonth: number;
  distinctDays: number;
  doubleDays: number;
  /** 当月のみ指定: 投稿があった「日(1-31)」の集合。 */
  postedDayNums?: Set<number>;
  /** 当月のみ指定: JSTの今日の日(1-31)。指定があると当月扱いで skippedSoFar 等を計算。 */
  todayDayNum?: number;
}): PerfectMonthProgress {
  const { daysInMonth, distinctDays, doubleDays, postedDayNums, todayDayNum } = args;
  const missing = daysInMonth - distinctDays;
  const achieved = isPerfectMonth(daysInMonth, distinctDays, doubleDays);

  let skippedSoFar: number | null = null;
  let shortfall: number | null = null;
  let stillAchievable: boolean | null = null;

  if (todayDayNum != null && postedDayNums) {
    let s = 0;
    for (let d = 1; d < todayDayNum; d++) {
      if (!postedDayNums.has(d)) s++;
    }
    skippedSoFar = s;
    shortfall = Math.max(0, s - doubleDays);
    stillAchievable = s <= PERFECT_MONTH_GRACE;
  }

  return { achieved, missing, makeupBank: doubleDays, skippedSoFar, shortfall, stillAchievable };
}

/**
 * ダブル投稿（穴埋めストック）によって「埋まった空き日」を返す（純粋）。
 * ストック数(doubleDays)ぶんだけ、古い穴（投稿のない日）から順に埋める。
 * 当月は todayDayNum を渡し、今日以降の空き日（まだ穴ではない）は対象外にする。
 * 返り値はカレンダーで「穴埋め済み」表示にする日(1-31)の配列（昇順）。
 */
export function filledHoleDays(args: {
  daysInMonth: number;
  postedDayNums: Set<number>;
  doubleDays: number;
  todayDayNum?: number;
}): number[] {
  const { daysInMonth, postedDayNums, doubleDays, todayDayNum } = args;
  if (doubleDays <= 0) return [];
  const limit = todayDayNum != null ? todayDayNum - 1 : daysInMonth; // 当月は過ぎた日まで
  const holes: number[] = [];
  for (let d = 1; d <= limit; d++) {
    if (!postedDayNums.has(d)) holes.push(d);
  }
  return holes.slice(0, doubleDays);
}

/**
 * 穴埋め推奨通知を送るべきか（純粋）。
 * - 1日以上の未投稿がある（skippedSoFar >= 1）
 * - まだ埋まっていない穴がある（shortfall > 0）
 * - 穴が多すぎない（skippedSoFar <= MAKEUP_REMINDER_MAX_SKIPPED）
 * 「今日投稿した」「同月内で未送信」の条件は呼び出し側で担保する。
 */
export function shouldRemindMakeup(skippedSoFar: number, makeupBank: number): boolean {
  const shortfall = skippedSoFar - makeupBank;
  return skippedSoFar >= 1 && shortfall > 0 && skippedSoFar <= MAKEUP_REMINDER_MAX_SKIPPED;
}
