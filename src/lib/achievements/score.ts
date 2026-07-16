/**
 * 実績のスコア（XP）・レベル・コレクション集計。コレクションメーターの土台。
 *
 * Why: コンプ率（獲得数÷総数）を主役にすると、実績を新規追加したときに自分は何もして
 * いないのに率が下がる＝理不尽な減少感が出る。そこで主役の指標は「単調増加するXP/レベル」
 * にする。実績を追加しても既存の獲得XPは不変（＝稼げる上限が増えるだけ）で、レベルは絶対に
 * 下がらない。コンプ率は副次表示に格下げして心理的痛みを小さくする。
 *
 * catalog.ts と同じくサーバー（順位集計）/クライアント（メーター）両方から読むため、
 * 純粋関数のみ（React・サーバー専用 API を import しない）。
 */

import {
  CATALOG,
  CATALOG_BY_KEY,
  PERFECT_MONTH_CATEGORY,
  SEASON_CATEGORY,
  countRanks,
  resolveAchievement,
} from "./catalog";

/**
 * 実績1件あたりの獲得ポイント（ユーザー確定重み）。
 * 皆勤賞のみ別格で高い（毎日投稿の継続が最も価値が高いという方針）。
 */
export const ACHIEVEMENT_POINTS = { perfectMonth: 100, gold: 80, silver: 40 } as const;

/** 実績キーの獲得ポイント。皆勤賞は100、その他は金80/銀40。 */
export function achievementPoints(key: string, category?: string): number {
  if (category === PERFECT_MONTH_CATEGORY || key.startsWith(`${PERFECT_MONTH_CATEGORY}:`)) {
    return ACHIEVEMENT_POINTS.perfectMonth;
  }
  return resolveAchievement(key, category).rank === "gold"
    ? ACHIEVEMENT_POINTS.gold
    : ACHIEVEMENT_POINTS.silver;
}

/** 獲得済み実績の合計XP（順位付けの基準にもなる単調増加スコア）。 */
export function totalXp(items: { key: string; category: string }[]): number {
  let sum = 0;
  for (const it of items) sum += achievementPoints(it.key, it.category);
  return sum;
}

/**
 * レベルLに到達するのに必要な累計XP（L>=1）。
 * cumulativeXpForLevel(L) = 50 * L * (L-1) ＝ Lv1:0 / Lv2:100 / Lv3:300 / Lv4:600 / Lv5:1000 …
 * 序盤は速く上がり（早い達成感）、上位ほど1レベルが重くなる。
 */
export function cumulativeXpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export interface LevelInfo {
  /** 現在のレベル（1始まり）。 */
  level: number;
  /** 現レベル内で稼いだXP。 */
  intoLevel: number;
  /** 現レベル→次レベルに必要なXP幅（リングの分母）。 */
  span: number;
  /** 次レベルまでの残りXP。 */
  toNext: number;
  /** 丸めた合計XP。 */
  xp: number;
}

/** 合計XPから現在レベルと次レベルまでの進捗を求める。 */
export function levelForXp(xp: number): LevelInfo {
  const safe = Math.max(0, Math.floor(xp));
  let level = 1;
  while (cumulativeXpForLevel(level + 1) <= safe) level++;
  const base = cumulativeXpForLevel(level);
  const next = cumulativeXpForLevel(level + 1);
  return { level, intoLevel: safe - base, span: next - base, toNext: next - safe, xp: safe };
}

/** 図鑑（固定カタログ）の獲得数と総数。皆勤・シーズンは動的なので総数に含めない。 */
export function catalogProgress(items: { key: string }[]): { achieved: number; total: number } {
  let achieved = 0;
  for (const it of items) if (CATALOG_BY_KEY.has(it.key)) achieved++;
  return { achieved, total: CATALOG.length };
}

/** コレクションメーターに出す集計一式（純粋・追加クエリ不要）。 */
export interface CollectionSummary {
  xp: number;
  level: LevelInfo;
  /** 金メダル数（皆勤・シーズンを含む＝ユーザーページの goldCount と同一集計）。 */
  gold: number;
  silver: number;
  /** 皆勤賞を取った月数。 */
  perfectMonths: number;
  /** 参加した期間限定シーズン数。 */
  seasons: number;
  /** 図鑑（固定カタログ）の獲得数／総数。 */
  catalog: { achieved: number; total: number };
}

/** 獲得済み実績リストからコレクション集計を作る。 */
export function collectionSummary(
  items: { key: string; category: string }[]
): CollectionSummary {
  const xp = totalXp(items);
  const { gold, silver } = countRanks(items);
  return {
    xp,
    level: levelForXp(xp),
    gold,
    silver,
    perfectMonths: items.filter((i) => i.category === PERFECT_MONTH_CATEGORY).length,
    seasons: items.filter((i) => i.category === SEASON_CATEGORY).length,
    catalog: catalogProgress(items),
  };
}
