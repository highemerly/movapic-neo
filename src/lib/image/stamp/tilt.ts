/**
 * 印影の傾きの決定（純粋計算）。
 *
 * - 手で押した印はまず真っ直ぐにならないので下限を設ける。0 を中心にした分布のままだと
 *   「ほぼ水平」ばかりが出て、傾けている意味が無い。
 * - 向きは常に右肩上がり。左右ランダムにすると右肩下がりが混じって「傾け損ない」に見える。
 * - 目に入るのは角度そのものではなく端の持ち上がり量（長辺 / 2 × sin角度）。同じ角度でも
 *   大きい印は端が大きく持ち上がって「歪んで押した」ように見え、小さい印は数pxしか動かず
 *   傾けた効果が出ない。そこで印面の長辺が画像に占める割合で角度の帯ごと縮める。
 *   基準を横幅ではなく長辺にするのは、縦書きの細長い印が「幅が細いから大きく傾けてよい」と
 *   判定されると下端が横に大きくずれて同じ問題が起きるため。
 */

import type { StampLayout } from "./layout";
import { clamp, triangular } from "./rng";

export const TILT = {
  minDeg: 1.5,
  maxDeg: 5.5,
  /** この割合（長辺 / 画像の対応する辺）以下なら角度をそのまま使う。 */
  scaleFrom: 0.3,
  /** この割合以上なら minScale まで縮める。間は線形補間。 */
  scaleTo: 0.9,
  minScale: 0.4,
} as const;

/** 印面の外形（枠線の太さを含む）。 */
function outerSize(layout: StampLayout): { width: number; height: number } {
  return {
    width: layout.frameWidth + layout.border,
    height: layout.frameHeight + layout.border,
  };
}

/** 印面の大きさによる傾きの倍率（1 = そのまま、minScale = 最も控えめ）。 */
export function tiltScaleForSize(
  layout: StampLayout,
  imageWidth: number,
  imageHeight: number
): number {
  const outer = outerSize(layout);
  const ratio = Math.max(outer.width / imageWidth, outer.height / imageHeight);
  const t = clamp((ratio - TILT.scaleFrom) / (TILT.scaleTo - TILT.scaleFrom), 0, 1);
  return 1 + (TILT.minScale - 1) * t;
}

/**
 * 画像からはみ出さない範囲に傾きを制限する。
 * 回転で広がるぶん（長辺 × sinθ / 2）が余白に収まる角度までしか倒さない。
 */
export function limitTilt(
  desired: number,
  layout: StampLayout,
  imageWidth: number,
  imageHeight: number
): number {
  const outer = outerSize(layout);
  const left = layout.frameX - layout.border / 2;
  const top = layout.frameY - layout.border / 2;
  const slackX = Math.max(0, Math.min(left, imageWidth - (left + outer.width)));
  const slackY = Math.max(0, Math.min(top, imageHeight - (top + outer.height)));
  const limit = Math.asin(
    clamp(Math.min((2 * slackX) / outer.height, (2 * slackY) / outer.width), 0, 1)
  );
  return clamp(desired, -limit, limit);
}

/** 印影の傾き（ラジアン・負＝右肩上がり）。 */
export function computeStampTilt(
  rng: () => number,
  layout: StampLayout,
  imageWidth: number,
  imageHeight: number
): number {
  // 大きく傾くほど珍しくなるよう、下限から最大までの振幅を三角分布で決める。
  const deg =
    (TILT.minDeg + Math.abs(triangular(rng)) * (TILT.maxDeg - TILT.minDeg)) *
    tiltScaleForSize(layout, imageWidth, imageHeight);
  // canvas の回転は正が時計回り＝右肩下がりなので、右肩上がりにするため符号は常に負。
  return limitTilt(-deg * (Math.PI / 180), layout, imageWidth, imageHeight);
}
