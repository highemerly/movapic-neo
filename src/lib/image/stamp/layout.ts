/**
 * 印面（枠と文字）の寸法・位置を決める純粋計算。
 *
 * skia は型としてしか使わないので単体テストできる（描画は render.ts）。
 *
 * 実物のハンコに寄せるための方針:
 * - 枠は「行送りの箱」ではなく実際のグリフに寄せる。fontSize は em の高さで、和文グリフは
 *   その 0.85 前後しか占めないため、行送りをそのまま枠にすると文字の周りが間延びして
 *   印章に見えない。最初と最後の行は送りではなくグリフ高さで詰める。
 * - 極端に細長い印面は存在しないので縦横比に上下限を設ける。広げるのは枠だけで文字は縮めない。
 * - 補正で空いた分は字送り・行送りを伸ばして埋める（篆刻の字割り）。上限を超えた分は余白。
 */

import type { CanvasRenderingContext2D } from "skia-canvas";
import type { Position, FontFamily } from "@/types";
import {
  PROPORTIONAL_FONTS,
  splitTextIntoLines,
  splitTextIntoColumns,
  measureGrapheme,
  type VerticalCharInfo,
} from "../text";
import { isEmojiGrapheme, splitGraphemes } from "@/lib/text/grapheme";
import { clamp } from "./rng";

/**
 * 印面に並べるときの1書記素の送り幅。
 *
 * 等幅フォントでも絵文字だけは実測する。絵文字の送り幅は fontSize の 1.27 倍ほどあり、
 * 等幅セル（＝fontSize）前提で幅を決めると印面が足りず、枠を突き抜ける。
 * 枠の無い通常描画では画像内に収まれば済むのでセル中央寄せ（emojiCellOffsetX）で足りるが、
 * ハンコは枠があるので送り幅そのものを合わせる必要がある。
 */
export function stampAdvance(
  ctx: CanvasRenderingContext2D,
  grapheme: string,
  fontSize: number,
  fontName: string,
  useProportional: boolean
): number {
  if (useProportional || isEmojiGrapheme(grapheme)) {
    return measureGrapheme(ctx, grapheme, fontSize, fontName);
  }
  return fontSize;
}

export const STAMP_GEOM = {
  /** 枠線の太さ（fontSize 比）。印章の枠は文字の線より太い。 */
  border: 0.11,
  /** 文字と枠内側の間隔。詰めるほど印章らしい。 */
  padding: 0.2,
  /** 和文グリフが em に対して占めるおおよその割合（枠を字に寄せるための見積り）。 */
  glyphHeight: 0.86,
  glyphWidth: 0.92,
  /** 横書きの行送り。 */
  horizontalLineHeight: 1.2,
  /** 縦書きの字送り。 */
  verticalLineHeight: 1.1,
  /** 縦書きの列送り。 */
  verticalColumnWidth: 1.18,
  /**
   * 印面の縦横比（幅/高さ）の許容範囲。外れたら短い側に余白を足して枠を広げる。
   * 正方形に寄せすぎると余白だらけの「枠だけ大きいハンコ」になるので、
   * 「極端に細長い印面は存在しない」を満たす程度に留める。
   */
  minAspect: 0.28,
  maxAspect: 4.0,
  /**
   * 縦横比の補正で短辺を広げられる倍率の上限。
   * 比だけで決めると、1行20文字のような入力で短辺が数倍に膨らみ「枠だけ大きく中身は余白」
   * になってしまう。細長い一行印・落款印は実在するので、ずんぐりさせるのは少しでよい。
   */
  maxAspectGrowth: 1.6,
  /** 字送り・行送りを伸ばせる上限。超えると字がバラけて印章に見えなくなる。 */
  maxAdvanceStretch: 1.35,
  maxLineStretch: 1.25,
} as const;

export interface StampLayout {
  /** 枠線の中心線がなす矩形。外形は各辺 border/2 ぶん外側。 */
  frameX: number;
  frameY: number;
  frameWidth: number;
  frameHeight: number;
  border: number;
  isVertical: boolean;
  /** 横書きの行（縦書きのときは空）。 */
  lines: string[];
  /** 縦書きの列（横書きのときは空）。右の列から順に並ぶ。 */
  columns: VerticalCharInfo[][];
  /** 文字ブロックの左上（枠の中央に置いた位置）。 */
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
  /** グリフの見積りサイズ。描画側が1文字目の中心を出すのに使う（絵文字があれば広がる）。 */
  glyphWidth: number;
  glyphHeight: number;
  lineHeight: number;
  columnWidth: number;
  /** 横書きの字送りの倍率（枠に合わせて字を割り付けるための伸長）。 */
  advanceScale: number;
  useProportional: boolean;
}

export interface StampLayoutInput {
  text: string;
  position: Position;
  width: number;
  height: number;
  fontSize: number;
  margin: number;
  fontName: string;
  fontFamily: FontFamily;
}

/**
 * n 個を送り advance で並べたときの全長。
 * 両端はグリフの実寸で終わる（行送りの余りを外に残さない）。
 */
function span(count: number, advance: number, glyph: number): number {
  if (count <= 0) return 0;
  return (count - 1) * advance + glyph;
}

/** 全長を avail まで伸ばすのに必要な送りの倍率（上限 cap、縮小はしない）。 */
function stretchScale(
  count: number,
  advance: number,
  glyph: number,
  avail: number,
  cap: number
): number {
  if (count <= 1 || advance <= 0) return 1;
  return clamp((avail - glyph) / (count - 1) / advance, 1, cap);
}

export function computeStampLayout(
  ctx: CanvasRenderingContext2D,
  input: StampLayoutInput
): StampLayout {
  const { text, position, width, height, fontSize, margin, fontName, fontFamily } = input;

  const isVertical = position === "left" || position === "right";
  const useProportional = !isVertical && PROPORTIONAL_FONTS.has(fontFamily);

  const advanceOf = (grapheme: string) =>
    stampAdvance(ctx, grapheme, fontSize, fontName, useProportional);

  const border = fontSize * STAMP_GEOM.border;
  const padding = fontSize * STAMP_GEOM.padding;
  const glyphHeight = fontSize * STAMP_GEOM.glyphHeight;
  let glyphWidth = fontSize * STAMP_GEOM.glyphWidth;
  let lineHeight =
    fontSize * (isVertical ? STAMP_GEOM.verticalLineHeight : STAMP_GEOM.horizontalLineHeight);
  let columnWidth = fontSize * STAMP_GEOM.verticalColumnWidth;

  // 枠の外形が画像の margin に収まる範囲。
  const maxFrameWidth = Math.max(fontSize, width - margin * 2 - border);
  const maxFrameHeight = Math.max(fontSize, height - margin * 2 - border);
  const maxContentWidth = Math.max(fontSize, maxFrameWidth - padding * 2);
  const maxContentHeight = Math.max(fontSize, maxFrameHeight - padding * 2);

  let lines: string[] = [];
  let columns: VerticalCharInfo[][] = [];
  let contentWidth: number;
  let contentHeight: number;
  let rows: number;

  if (isVertical) {
    const charsPerColumn = Math.max(
      1,
      Math.floor((maxContentHeight - glyphHeight) / lineHeight) + 1
    );
    // 改行は列の区切り（通常の縦書きと同じ規則。splitTextIntoColumns が段落ごとに列を割る）。
    // 等幅セルに寄せるので半角判定は使わない。
    columns = splitTextIntoColumns(text, charsPerColumn, false);
    if (columns.length === 0) columns = [[]];
    rows = Math.max(0, ...columns.map((column) => column.length));
    // 絵文字は全角セルより広いので、字面の幅と列送りを実測ぶんだけ押し広げる。
    glyphWidth = Math.max(
      glyphWidth,
      ...columns.flat().map((info) => (isEmojiGrapheme(info.char) ? advanceOf(info.char) : 0))
    );
    columnWidth = Math.max(columnWidth, glyphWidth);
    contentWidth = span(columns.length, columnWidth, glyphWidth);
    contentHeight = span(rows, lineHeight, glyphHeight);
  } else {
    lines = splitTextIntoLines(
      ctx,
      text,
      maxContentWidth,
      useProportional,
      fontSize,
      fontName,
      false,
      advanceOf
    );
    contentWidth = Math.max(
      0,
      ...lines.map((line) =>
        splitGraphemes(line).reduce((width, grapheme) => width + advanceOf(grapheme), 0)
      )
    );
    rows = lines.length;
    contentHeight = span(rows, lineHeight, glyphHeight);
  }

  contentWidth = Math.min(contentWidth, maxContentWidth);
  contentHeight = Math.min(contentHeight, maxContentHeight);

  let frameWidth = contentWidth + padding * 2;
  let frameHeight = contentHeight + padding * 2;

  // 縦横比の補正（短い側の枠を広げるだけ＝文字は縮めない）。
  const aspect = frameWidth / frameHeight;
  if (aspect > STAMP_GEOM.maxAspect) {
    frameHeight = Math.min(
      frameWidth / STAMP_GEOM.maxAspect,
      frameHeight * STAMP_GEOM.maxAspectGrowth
    );
  } else if (aspect < STAMP_GEOM.minAspect) {
    frameWidth = Math.min(
      frameHeight * STAMP_GEOM.minAspect,
      frameWidth * STAMP_GEOM.maxAspectGrowth
    );
  }

  frameWidth = Math.min(frameWidth, maxFrameWidth);
  frameHeight = Math.min(frameHeight, maxFrameHeight);

  // 空いた余白ぶんだけ送りを伸ばす。縦書きは横が列送り・縦が字送りなので上限の対応が入れ替わる。
  const availWidth = frameWidth - padding * 2;
  const availHeight = frameHeight - padding * 2;
  let advanceScale = 1;

  if (isVertical) {
    columnWidth *=
      stretchScale(
        columns.length,
        columnWidth,
        glyphWidth,
        availWidth,
        STAMP_GEOM.maxLineStretch
      );
    lineHeight *=
      stretchScale(rows, lineHeight, glyphHeight, availHeight, STAMP_GEOM.maxAdvanceStretch);
    contentWidth = span(columns.length, columnWidth, glyphWidth);
    contentHeight = span(rows, lineHeight, glyphHeight);
  } else {
    advanceScale =
      contentWidth > 0 ? clamp(availWidth / contentWidth, 1, STAMP_GEOM.maxAdvanceStretch) : 1;
    lineHeight *= stretchScale(rows, lineHeight, glyphHeight, availHeight, STAMP_GEOM.maxLineStretch);
    contentWidth *= advanceScale;
    contentHeight = span(rows, lineHeight, glyphHeight);
  }

  const frameX =
    position === "right" ? width - margin - border / 2 - frameWidth : margin + border / 2;
  const frameY =
    position === "bottom" ? height - margin - border / 2 - frameHeight : margin + border / 2;

  return {
    frameX,
    frameY,
    frameWidth,
    frameHeight,
    border,
    isVertical,
    lines,
    columns,
    contentX: frameX + (frameWidth - contentWidth) / 2,
    contentY: frameY + (frameHeight - contentHeight) / 2,
    contentWidth,
    contentHeight,
    glyphWidth,
    glyphHeight,
    lineHeight,
    columnWidth,
    advanceScale,
    useProportional,
  };
}
