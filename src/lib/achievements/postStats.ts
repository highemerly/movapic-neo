/**
 * 投稿時の実績評価で使う「日」にまつわる集計（純粋・DB 非依存）。live の collectStats（stats.ts）が
 * DB から読んだ行をここに渡す。日・月は投稿の記録日（Image.postDate）で数え、基準は評価した時点の
 * 「今日」ではなく、その投稿の記録日（評価は Fediverse への投稿の後に走るので、今日を使うと
 * 23:59:59 の投稿が翌日扱いになりうる）。時間帯だけは時計の時刻で数える。
 * 仕様は docs/features.md「日付の区切り」。
 */

import { calculateStreak, toJstHour } from "@/lib/streak";
import { dayOfMonth, ymOf, type PostDate } from "@/lib/dayClock";
import { filledHoleOf } from "@/lib/makeup/donor";
import type { AchStats } from "./catalog";
import { summarizeDayCounts } from "./perfectMonth";

/** 集計に要る画像行（本人の全投稿）。 */
export interface PostDayRow {
  createdAt: Date;
  postDate: PostDate;
  source: string;
  makeupTargetDay: number | null;
  makeupTargetMonthDelta: number;
}

export type PostDayStats = Pick<
  AchStats,
  | "totalPosts"
  | "currentStreak"
  | "todayPosts"
  | "distinctDaysInPostMonth"
  | "postMonthDayCounts"
  | "filledHoleDays"
  | "distinctPostMonths"
  | "distinctPostHours"
  | "distinctSourcesToday"
>;

/** 本人の全投稿（評価中の投稿を含む）から、記録日 postDay の投稿を評価するための集計を作る。 */
export function summarizePostDays(rows: ReadonlyArray<PostDayRow>, postDay: PostDate): PostDayStats {
  const postYm = ymOf(postDay);
  const postDates = rows.map((r) => r.postDate);

  // 投稿月の日別投稿数 → distinct日数 / 日付順マッチング（皆勤賞の穴埋め判定に使用）
  const monthDayCounts = new Map<PostDate, number>();
  for (const d of postDates) {
    if (ymOf(d) === postYm) monthDayCounts.set(d, (monthDayCounts.get(d) ?? 0) + 1);
  }
  // 日(1-31)→投稿数（穴埋めの日付順マッチング用）
  const postMonthDayCounts: Record<number, number> = {};
  for (const [d, c] of monthDayCounts) postMonthDayCounts[dayOfMonth(d)] = c;

  // 投稿月の穴を埋めている永続割当が指す空き日。皆勤賞判定の単一ソース。
  // donor は翌月1〜10日の投稿でもよい（filledHoleOf が月を解決する）ので、投稿月の行だけ見てはいけない。
  const filledHoleDays: number[] = [];
  for (const r of rows) {
    const hole = filledHoleOf(r, postYm);
    if (hole != null) filledHoleDays.push(hole);
  }

  return {
    totalPosts: rows.length,
    currentStreak: calculateStreak(postDates, postDay),
    todayPosts: postDates.filter((d) => d === postDay).length,
    distinctDaysInPostMonth: summarizeDayCounts(monthDayCounts.values()).distinctDays,
    postMonthDayCounts,
    filledHoleDays,
    // 通算で投稿した月（記録日の YYYY-MM）と時間帯（時計の 0-23時）の種類数。
    distinctPostMonths: new Set(postDates.map(ymOf)).size,
    distinctPostHours: new Set(rows.map((r) => toJstHour(r.createdAt))).size,
    // 投稿の記録日に使った source の種類数（ハットトリック判定）
    distinctSourcesToday: new Set(rows.filter((r) => r.postDate === postDay).map((r) => r.source)).size,
  };
}
