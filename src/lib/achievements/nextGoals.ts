/**
 * 「もうすぐ獲れる」（あと少しナビ）の算出。純粋関数（catalog の静的定義のみ参照）。
 *
 * 未獲得ラダーそれぞれの「次の段」と現在値の差から達成率を出し、率が高い順に並べる。
 * 当月の皆勤賞は別枠で常時ピン留めするため、ここではラダー系のみ扱う。
 */

import { CATALOG, LADDER_META, type AchievementDef } from "./catalog";

export interface NextGoal {
  ladderKey: string;
  /** 目指している段の称号（次に獲れる段のタイトル）。 */
  title: string;
  icon: string;
  /** その段のキー（詳細モーダルへの ?a= ディープリンク用）。 */
  achievementKey: string;
  /** 現在値。 */
  current: number;
  /** 次の段のしきい値。 */
  target: number;
  /** あと何で届くか（>=1）。 */
  remaining: number;
  /** 単位（"投稿" 等）。 */
  unit: string;
  /** 達成率 current/target（0〜1、並び替えに使う）。 */
  ratio: number;
}

/** ladderKey ごとの段（tier 昇順）。 */
function tiersOf(ladderKey: string): AchievementDef[] {
  return CATALOG.filter((d) => d.ladderKey === ladderKey).sort(
    (a, b) => (a.tier ?? 0) - (b.tier ?? 0)
  );
}

/**
 * 未獲得ラダーの「あと少し」ゴールを達成率の高い順に返す。
 * - 次の段 = まだ獲っていない最も下の段。全段獲得済みのラダーは対象外。
 * - current は表示用ラダー値（collectLadderValues）。無いラダーは 0 扱い。
 */
export function ladderNextGoals(
  grantedKeys: Set<string>,
  ladderValues: Record<string, number>
): NextGoal[] {
  const goals: NextGoal[] = [];
  for (const ladderKey of Object.keys(LADDER_META)) {
    const tiers = tiersOf(ladderKey);
    const next = tiers.find((d) => !grantedKeys.has(d.key));
    if (!next || next.tier == null) continue; // 全段達成済み
    const target = next.tier;
    const current = Math.max(0, ladderValues[ladderKey] ?? 0);
    goals.push({
      ladderKey,
      title: next.title,
      icon: next.icon,
      achievementKey: next.key,
      current,
      target,
      remaining: Math.max(1, target - current),
      unit: LADDER_META[ladderKey]?.unit ?? "",
      ratio: target > 0 ? Math.min(1, current / target) : 0,
    });
  }
  return goals.sort((a, b) => b.ratio - a.ratio);
}
