/**
 * 月の満ち欠け（月相）の算出。お月見シーズンの月を、生成した日の実際の形で描くために使う。
 *
 * 平均朔望月による近似（誤差は数時間程度で、満ち欠けの見た目には出ない）。「その日の月の形で
 * 残る」ことが目的で暦の厳密さは要らないため、外部依存を足さずこの近似で足りる。
 *
 * JST への変換はしない。月相は絶対時刻で決まる量であって暦日の判定ではないため
 * （「今日/今月」を JST で判定するルールはここには当たらない）。
 *
 * このファイルは skia / DB に依存しない純粋ロジック（worker-front からも安全に呼べる）。
 */

/** 平均朔望月（日）。 */
const SYNODIC_MONTH = 29.530588853;

/** 基準となる新月の瞬間（2000-01-06 18:14 UTC）。 */
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14);

const MS_PER_DAY = 86_400_000;

/**
 * 欠けを圧縮する係数。実際の輝面比をそのまま描くと新月前後がほぼ見えず「お月見」の絵に
 * ならないので満月寄りに丸める。0=常に満月、1=実際どおり。
 * お月見シーズン（新月の前〜満月の翌日）では、新月の日でも輝面比 65% の太った月になり、
 * 中秋の名月から満月にかけて真円へ満ちる。
 */
const FULLNESS_BIAS = 0.35;

/** 基準新月からの月齢（0以上 SYNODIC_MONTH 未満。0=新月・約14.8=満月）。 */
export function moonAge(now: Date): number {
  const age = ((now.getTime() - NEW_MOON_EPOCH) / MS_PER_DAY) % SYNODIC_MONTH;
  // 基準より前の日時では剰余が負になるので回り込ませる。
  return age < 0 ? age + SYNODIC_MONTH : age;
}

/** 輝面比（0=新月・1=満月）。 */
export function illuminatedFraction(now: Date): number {
  return (1 - Math.cos((2 * Math.PI * moonAge(now)) / SYNODIC_MONTH)) / 2;
}

export interface MoonAppearance {
  /**
   * 明暗境界線（ターミネーター）を表す楕円の横半径比（0〜1）。
   * 1=真円＝満月、0=直線＝半月。描画側はこの比の楕円で光っている側を切り出す。
   */
  terminatorRatio: number;
  /** 欠けている側の縁。北半球では上弦（満ちていく月）は右が光り左が欠ける。 */
  darkLimb: "left" | "right";
}

/** 描画用の見た目（満月寄りに丸めた欠け具合と、欠ける向き）。 */
export function moonAppearance(now: Date): MoonAppearance {
  const lit = 1 - (1 - illuminatedFraction(now)) * FULLNESS_BIAS;
  return {
    terminatorRatio: Math.max(0, Math.min(1, lit * 2 - 1)),
    darkLimb: moonAge(now) < SYNODIC_MONTH / 2 ? "left" : "right",
  };
}
