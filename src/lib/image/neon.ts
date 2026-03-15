import { CanvasRenderingContext2D } from "skia-canvas";

/**
 * ネオン効果で文字を描画
 * 複数レイヤーの発光効果（揺れなし）
 */
export function drawNeonText(
  ctx: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  fontSize: number,
  textColor: string
): void {
  ctx.save();

  // 外側グロー（大きくぼかし、選択色で発光）
  ctx.shadowColor = textColor;
  ctx.shadowBlur = fontSize * 0.5;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = textColor;
  ctx.fillText(char, x, y);

  // 中間グロー
  ctx.shadowBlur = fontSize * 0.25;
  ctx.fillText(char, x, y);

  // 内側グロー
  ctx.shadowBlur = fontSize * 0.1;
  ctx.fillText(char, x, y);

  // 中心（白く光る芯）
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(char, x, y);

  ctx.restore();
}
