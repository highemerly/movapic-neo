/**
 * 書記素（grapheme cluster）ユーティリティ。
 *
 * 絵文字は複数のコードポイントで1文字を構成する（ZWJ結合 👨‍👩‍👧 / 肌色修飾 👍🏽 /
 * 国旗 🇯🇵=地域指示子2個 / キーキャップ 1️⃣ など）。`String.prototype.length`（UTF-16）や
 * `Array.from`（コードポイント）で数える・切ると絵文字が分解・崩壊するため、
 * 文字数カウント・バリデーション・描画の文字分割はすべてこのモジュールに集約する。
 *
 * クライアント／サーバー両方から使うため、重い依存（skia-canvas 等）は持たない。
 */

// Intl.Segmenter は Node 18+ / 近年のブラウザで利用可能。
// 万一未対応の環境ではコードポイント単位（Array.from）にフォールバックする。
const segmenter =
  typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/**
 * 文字列を書記素単位に分割する。絵文字は1要素として保持される。
 */
export function splitGraphemes(text: string): string[] {
  if (!segmenter) {
    return Array.from(text);
  }
  const result: string[] = [];
  for (const { segment } of segmenter.segment(text)) {
    result.push(segment);
  }
  return result;
}

/**
 * 書記素ベースの文字数。絵文字1個＝1文字として数える。
 */
export function countGraphemes(text: string): number {
  if (!segmenter) {
    return Array.from(text).length;
  }
  const iterator = segmenter.segment(text)[Symbol.iterator]();
  let count = 0;
  while (!iterator.next().done) {
    count++;
  }
  return count;
}

/**
 * 書記素境界を尊重して先頭から max 文字に切り詰める。
 * （サロゲートペアや結合絵文字を途中で割らない）
 */
export function truncateGraphemes(text: string, max: number): string {
  if (max <= 0) return "";
  const graphemes = splitGraphemes(text);
  if (graphemes.length <= max) return text;
  return graphemes.slice(0, max).join("");
}

// 絵文字判定: Extended_Pictographic に加え、単体ではそれに該当しない
// 地域指示子（国旗）・キーキャップ・ZWJ結合・絵文字異体字selector を含む書記素も拾う。
const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
// 単体では Extended_Pictographic に該当しないが絵文字を構成するコードポイント:
// 地域指示子(国旗) / U+20E3 キーキャップ / U+200D ZWJ / U+FE0F 絵文字異体字selector
const EMOJI_COMPONENT = /[\u{1F1E6}-\u{1F1FF}\u{20E3}\u{200D}\u{FE0F}]/u;

/**
 * 書記素が絵文字かどうか。主に等幅フォントでの幅決定（全角扱い）や
 * 縦書きでの扱い分岐に使う。
 */
export function isEmojiGrapheme(grapheme: string): boolean {
  if (!grapheme) return false;
  return EMOJI_COMPONENT.test(grapheme) || EXTENDED_PICTOGRAPHIC.test(grapheme);
}

/**
 * 文字列に絵文字が1つでも含まれるか。書記素分割は不要（構成コードポイントを直接見る）。
 * 絵文字は本文フォントに関わらず Noto Emoji で描画されるため、その表示判定に使う。
 */
export function hasEmoji(text: string): boolean {
  return EMOJI_COMPONENT.test(text) || EXTENDED_PICTOGRAPHIC.test(text);
}
