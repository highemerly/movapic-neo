/**
 * 月間投稿日数の実績（その月に10日・20日投稿）の単一ソース（キー・しきい値・次の目標）。
 *
 * Why: 月ごとにリセットされる目標が皆勤賞（0か100か）しか無いと、皆勤賞が不可能になった瞬間に
 * その月の目標が消え、残りの日に投稿する理由が無くなる（＝「皆勤賞を取れないなら使わない」）。
 * 皆勤賞の手前に着地点を置き、外した後も「あと◯日で◯日投稿」と次の目標を出せるようにする。
 *
 * 数えるのは「その月に実際に投稿した日数」だけで、穴埋め（Image.makeupTargetDay）は数えない。
 * - 穴埋めは皆勤賞のための救済で、穴埋めポイントもそのために配っている
 * - 穴埋めは編集モード（PATCH）で後から付け外しされるため、数えると投稿以外の評価経路が要る
 * 投稿した日数は投稿の瞬間にしか増えないので、評価は投稿起点（publishImage）だけで閉じる。
 *
 * 皆勤賞と同じ動的キー方式（`month-days:YYYY-MM:N`）。ランクは銀固定（皆勤賞👑との格差を保つ）。
 * 実績ptの付与（その月に実績を獲得したら+1pt）の対象外（engine.grantAll）: 月10日投稿する人は
 * 毎月ほぼ確実に届くため、対象にすると実質的に全員の穴埋め枠が毎月+1されてポイント制の設計が変わる。
 *
 * **同じ月の上位に吸収する**（absorbedMonthDaysKeys）: 皆勤賞の月は10日・20日とも、20日の月は10日を、
 * 表示・金銀の数・XP・/stats の取得人数から外す。その月の到達点1つだけを見せるため。
 * 10日・20日は投稿の瞬間に付与され、皆勤賞は月末（締切）まで確定しないので、付与の時点では避けられない。
 * Achievement 行は消さない（実績は永続・剥奪しない＝付与済みの通知や「この投稿で獲得した実績」と整合する）。
 *
 * catalog.ts と同じくクライアントからも import されるため、React・サーバー専用 API を import しない。
 */

import { PERFECT_MONTH_CATEGORY } from "./perfectMonth";

/** 系列キー（DBの category 列）。 */
export const MONTH_DAYS_CATEGORY = "month-days";

/** しきい値（投稿した日数・昇順）。 */
export const MONTH_DAYS_TIERS: readonly number[] = [10, 20];

const KEY_RE = /^month-days:(\d{4}-\d{2}):(\d+)$/;

/** ("2026-10", 10) → "month-days:2026-10:10" */
export function monthDaysKey(ym: string, tier: number): string {
  return `${MONTH_DAYS_CATEGORY}:${ym}:${tier}`;
}

/** "month-days:2026-10:10" → { ym: "2026-10", tier: 10 }。形式外は null。 */
export function parseMonthDaysKey(key: string): { ym: string; tier: number } | null {
  const m = KEY_RE.exec(key);
  return m ? { ym: m[1], tier: Number(m[2]) } : null;
}

/**
 * 同じ月の上位に吸収された月間投稿日数のキー。**1ユーザーぶんの獲得キーをすべて**渡すこと
 * （一部だけ渡すと上位の有無を見落として吸収できない）。
 * 吸収は「上位の段ほどXPが小さくならない（20日 >= 10日・皆勤賞 >= 20日）」前提で、XPの単調増加を保つ。
 */
export function absorbedMonthDaysKeys(keys: Iterable<string>): Set<string> {
  const all = [...keys];
  const perfectYms = new Set<string>();
  const topTier = new Map<string, number>();
  for (const key of all) {
    if (key.startsWith(`${PERFECT_MONTH_CATEGORY}:`)) {
      perfectYms.add(key.slice(PERFECT_MONTH_CATEGORY.length + 1));
    }
    const md = parseMonthDaysKey(key);
    if (md) topTier.set(md.ym, Math.max(topTier.get(md.ym) ?? 0, md.tier));
  }
  const absorbed = new Set<string>();
  for (const key of all) {
    const md = parseMonthDaysKey(key);
    if (md && (perfectYms.has(md.ym) || md.tier < (topTier.get(md.ym) ?? 0))) absorbed.add(key);
  }
  return absorbed;
}

/** 1ユーザーぶんの獲得実績から、上位に吸収された月間投稿日数を除く（表示・集計の入口で通す）。 */
export function withoutAbsorbedMonthDays<T extends { key: string }>(items: T[]): T[] {
  const absorbed = absorbedMonthDaysKeys(items.map((i) => i.key));
  return absorbed.size === 0 ? items : items.filter((i) => !absorbed.has(i.key));
}

/** その月に投稿した日数で到達している段のキー（しきい値の昇順）。 */
export function reachedMonthDaysKeys(ym: string, postedDays: number): string[] {
  return MONTH_DAYS_TIERS.filter((t) => postedDays >= t).map((t) => monthDaysKey(ym, t));
}

/**
 * 月間投稿日数の「次の目標」。
 * - next:    まだ届いていない段のうち、月内に届く最も下の段（reached はすでに届いた最上段）
 * - reached: これ以上届く段が無い（最上段に到達済み、または次の段は月内に届かない）
 * - none:    1段も届いておらず、月内にも届かない
 */
export type MonthDaysGoal =
  | { kind: "next"; tier: number; remaining: number; reached: number | null }
  | { kind: "reached"; tier: number }
  | { kind: "none" };

/**
 * 次の目標を決める（純粋）。
 * @param postedDays その月に1枚以上投稿した日数
 * @param daysLeft   まだ投稿を足せる日数（daysLeftToPost。過去月は0）
 */
export function monthDaysGoal(args: { postedDays: number; daysLeft: number }): MonthDaysGoal {
  const { postedDays, daysLeft } = args;
  const reached = [...MONTH_DAYS_TIERS].reverse().find((t) => postedDays >= t) ?? null;
  const next = MONTH_DAYS_TIERS.find((t) => postedDays < t && postedDays + daysLeft >= t);
  if (next != null) return { kind: "next", tier: next, remaining: next - postedDays, reached };
  if (reached != null) return { kind: "reached", tier: reached };
  return { kind: "none" };
}

/**
 * 当月にまだ投稿を足せる日数＝今日から月末までの日数。今日すでに投稿していれば今日は数えない
 * （同じ日に何枚投稿しても投稿した日数は増えないため）。
 */
export function daysLeftToPost(args: {
  daysInMonth: number;
  todayDayNum: number;
  postedToday: boolean;
}): number {
  const { daysInMonth, todayDayNum, postedToday } = args;
  return Math.max(0, daysInMonth - todayDayNum + (postedToday ? 0 : 1));
}
