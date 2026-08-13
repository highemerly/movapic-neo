/**
 * 透明な余白を切り落とす（プレビュー画像生成用）。
 *
 * セグメントコントロールのプレビューは高さ指定（h-5）で表示するため、キャンバスに透明な余白が
 * あるとそのぶん字が小さくなる。加えて余白ごと横幅を占めるので、狭い端末ではボタン幅を
 * はみ出してしまう。生成時に外接矩形へ詰めておけば、同じ表示高さでも字が大きく収まりも良い。
 */

import { Canvas } from "skia-canvas";

/** アンチエイリアスの薄い縁を余白と誤判定しないためのしきい値。 */
const ALPHA_THRESHOLD = 4;

export function trimTransparent(source: Canvas, padding = 1): Canvas {
  const sourceCtx = source.getContext("2d");
  const { data } = sourceCtx.getImageData(0, 0, source.width, source.height);

  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      if (data[(y * source.width + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) throw new Error("描画された画素が無い");

  const width = maxX - minX + 1 + padding * 2;
  const height = maxY - minY + 1 + padding * 2;
  const trimmed = new Canvas(width, height);
  trimmed.getContext("2d").drawImage(source, padding - minX, padding - minY);
  return trimmed;
}
