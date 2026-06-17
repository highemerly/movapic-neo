/**
 * 皆勤賞ロジックの単一ソース（しきい値・判定式・進捗・穴埋め通知ゲートを集約）。
 *
 * 「皆勤賞」は『未投稿を grace 日まで許容し、その分を同月の "後日" に
 * 2枚以上投稿（＝ダブル投稿）して穴埋めできる』制度。穴埋めは「忘れた過去日」を
 * 「それより後の日のダブル投稿」で埋めるもので、ダブル投稿日 D は D より前の未投稿日のみ
 * 埋められる（将来日は埋められない＝月末日を忘れると後日が無く埋まらない）。1日のダブルは
 * 1日分のみ埋める。判定の中核を1箇所に集め、live(stats/engine) / backfill / カレンダーAPI /
 * 穴埋め通知 の4経路がすべてここを呼ぶ。
 *
 * catalog.ts と同じく「サーバー/クライアント両方から import されうる」ため、
 * React・サーバー専用 API を import しないこと（型・純粋関数のみ）。
 */

import { DEFAULT_INSTANCE } from "@/lib/userHandle";

/** 皆勤賞の系列キー（DBの category 列）。動的キーは "perfect-month:YYYY-MM"。 */
export const PERFECT_MONTH_CATEGORY = "perfect-month";

/**
 * 未投稿として許容する日数（穴埋め枠）。これを超える未投稿があるとその月の皆勤賞は不成立。
 * SHAMEZO はホームインスタンス（handon.club）発祥で、その利用促進も兼ねるため、
 * ホームインスタンス所属ユーザーのみ +1 日だけ優遇する（HOME=4 / その他=3）。
 * しきい値は所属インスタンスごとに `perfectMonthGrace(domain)` で解決し、
 * live/backfill/カレンダーAPI のいずれも「投稿者本人の所属インスタンス」基準で判定する。
 */
export const PERFECT_MONTH_GRACE_HOME = 4;
/** ホーム以外のインスタンス所属ユーザーの未投稿許容日数。 */
export const PERFECT_MONTH_GRACE_DEFAULT = 3;

/** インスタンスドメインに応じた未投稿許容日数（穴埋め枠）を返す。 */
export function perfectMonthGrace(instanceDomain: string | null | undefined): number {
  return instanceDomain === DEFAULT_INSTANCE
    ? PERFECT_MONTH_GRACE_HOME
    : PERFECT_MONTH_GRACE_DEFAULT;
}

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

/** 日(1-31) → その日の投稿数。投稿のない日はキー無し（0扱い）でよい。 */
export type DayCounts = Record<number, number> | ReadonlyMap<number, number>;

/** DayCounts を「日→投稿数」の関数に正規化する。 */
function toCountFn(dayCounts: DayCounts): (day: number) => number {
  if (dayCounts instanceof Map) return (d) => dayCounts.get(d) ?? 0;
  const rec = dayCounts as Record<number, number>;
  return (d) => rec[d] ?? 0;
}

/** distinct（1枚以上投稿した日数）を数える。 */
function countDistinct(count: (day: number) => number, daysInMonth: number): number {
  let n = 0;
  for (let d = 1; d <= daysInMonth; d++) if (count(d) >= 1) n++;
  return n;
}

/** 穴埋めの対応（どの空き日が、どの日のダブル投稿で埋まったか）。 */
export interface MakeupMatch {
  /** 埋められた空き日(1-31)。 */
  holeDay: number;
  /** その穴を埋めたダブル投稿の日(1-31)。holeDay より必ず後（filledBy > holeDay）。 */
  filledBy: number;
}

/**
 * ダブル投稿による穴埋めのマッチングを計算（純粋）。
 * 日 1..lastDay を時系列に走査し、未投稿日(=0枚, d<=holeLastDay)を pending hole に積み、
 * ダブル投稿日(>=2枚)で「最も古い pending hole（必ずその日より前）」を1つ消費して対応づける。
 * ＝各ダブルは自分より前の未投稿日を1つだけ埋める（将来日は埋められない）。
 * 最古優先の貪欲法で最大マッチング。返り値は対応の配列（holeDay 昇順）。
 *
 * - 月全体の判定: holeLastDay = lastDay = daysInMonth。
 * - 当月の表示: lastDay = 今日, holeLastDay = 今日-1（今日はまだ穴ではないが、今日のダブルで
 *   過去の穴を埋められるので lastDay には含める）。
 */
export function computeMakeups(args: {
  lastDay: number;
  holeLastDay: number;
  count: (day: number) => number;
}): MakeupMatch[] {
  const { lastDay, holeLastDay, count } = args;
  const pending: number[] = []; // 未割当の穴（古い順）
  const matches: MakeupMatch[] = [];
  for (let d = 1; d <= lastDay; d++) {
    const c = count(d);
    if (c === 0) {
      if (d <= holeLastDay) pending.push(d);
    } else if (c >= 2) {
      const hole = pending.shift();
      if (hole !== undefined) matches.push({ holeDay: hole, filledBy: d });
    }
  }
  return matches;
}

/**
 * 皆勤賞の達成判定（純粋・日付対応）。
 * missing(= daysInMonth - distinctDays) が grace 以内で、かつ全ての未投稿日が
 * 「後日のダブル投稿」で埋まり切っている（穴埋めマッチ数 >= missing）なら達成。
 * missing=0（完全皆勤）は常に成立（従来達成者と後方互換）。
 * 月末日を忘れた場合は埋める後日が無いので不成立になる（新ルールの意図どおり）。
 * grace は投稿者の所属インスタンスで決まる（`perfectMonthGrace`）。
 */
export function isPerfectMonth(args: {
  daysInMonth: number;
  dayCounts: DayCounts;
  grace: number;
}): boolean {
  const { daysInMonth, grace } = args;
  const count = toCountFn(args.dayCounts);
  const distinctDays = countDistinct(count, daysInMonth);
  const missing = daysInMonth - distinctDays;
  if (missing < 0 || missing > grace) return false;
  if (missing === 0) return true;
  const fills = computeMakeups({ lastDay: daysInMonth, holeLastDay: daysInMonth, count }).length;
  return fills >= missing;
}

/** 当月の穴埋め進捗（カレンダーのコールアウト・通知ゲートで共用）。 */
export interface CurrentMonthMakeupStatus {
  /** 今日時点で確定した穴埋め対応（古い穴 ← 後日のダブル）。 */
  matches: MakeupMatch[];
  /** 今日より前の未投稿日数。 */
  skippedSoFar: number;
  /** まだ埋まっていない（対応のつかない）過去の穴の数。 */
  unfilled: number;
  /** 今日すでにダブル投稿しているか（count(today) >= 2 ＝ 今日の穴埋め枠を使用済み）。 */
  todayUsedMakeup: boolean;
  /** まだ皆勤賞に手が届く範囲か（skippedSoFar <= grace）。 */
  stillAchievable: boolean;
}

/**
 * 当月の穴埋め状況を計算（純粋）。todayDayNum は JST の今日の日(1-31)。
 * matches は「今日まで（今日のダブルを含む）」で、穴は「今日より前」だけを対象にする。
 * grace は投稿者の所属インスタンスで決まる（`perfectMonthGrace`）。
 */
export function currentMonthMakeupStatus(args: {
  daysInMonth: number;
  todayDayNum: number;
  dayCounts: DayCounts;
  grace: number;
}): CurrentMonthMakeupStatus {
  const { todayDayNum, grace } = args;
  const count = toCountFn(args.dayCounts);
  const matches = computeMakeups({
    lastDay: todayDayNum,
    holeLastDay: todayDayNum - 1,
    count,
  });
  let skippedSoFar = 0;
  for (let d = 1; d < todayDayNum; d++) if (count(d) === 0) skippedSoFar++;
  return {
    matches,
    skippedSoFar,
    unfilled: skippedSoFar - matches.length,
    todayUsedMakeup: count(todayDayNum) >= 2,
    stillAchievable: skippedSoFar <= grace,
  };
}

/**
 * 穴埋め推奨通知を送るべきか（純粋）。
 * - 1日以上の未投稿がある（skippedSoFar >= 1）
 * - まだ埋まっていない穴がある（unfilled > 0）
 * - 穴が多すぎない（skippedSoFar <= MAKEUP_REMINDER_MAX_SKIPPED）
 * 「今日投稿した」「同月内で未送信」の条件は呼び出し側で担保する。
 */
export function shouldRemindMakeup(skippedSoFar: number, unfilled: number): boolean {
  return skippedSoFar >= 1 && unfilled > 0 && skippedSoFar <= MAKEUP_REMINDER_MAX_SKIPPED;
}
