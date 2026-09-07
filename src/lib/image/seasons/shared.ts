/**
 * シーズン装飾レンダラの共通プリミティブ（複数シーズンで使い回す描画部品）。
 * 各シーズン固有の描画は seasons/<season>.ts 側に置く。
 */

import { CanvasRenderingContext2D } from "skia-canvas";

/** 角丸矩形パス。 */
export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * 5角の星のパスを構築する（fill/stroke は呼び出し側で行う）。
 * 塗りと縁取りの両方をしたい場合は、呼び出し後に fill() → stroke() の順で叩く。
 */
export function starPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
): void {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const outer = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    const inner = outer + Math.PI / 5;
    if (i === 0) ctx.moveTo(cx + r * Math.cos(outer), cy + r * Math.sin(outer));
    else ctx.lineTo(cx + r * Math.cos(outer), cy + r * Math.sin(outer));
    ctx.lineTo(cx + r * 0.45 * Math.cos(inner), cy + r * 0.45 * Math.sin(inner));
  }
  ctx.closePath();
}

/**
 * 縦書きテキストが占める領域を見積もる。列は常に右→左へ伸び、position はその起点
 * （"right"=右端揃え／"left"=最左列を margin に揃える）を決める。
 * overlay.ts の drawVerticalText と同じ幾何（charsPerColumn / columnWidth / startX）を使う。
 * 縦書き系シーズンの背景サイズ・装飾位置の決定に使える共通ヘルパー。
 */
export function estimateVerticalTextBox(
  text: string,
  width: number,
  height: number,
  fontSize: number,
  margin: number,
  topInset = 0,
  position: "left" | "right" = "right"
): { left: number; right: number; top: number; bottom: number } {
  const maxHeight = height - margin * 2 - topInset;
  const lineHeight = fontSize * 1.2;
  const charsPerColumn = Math.max(1, Math.floor(maxHeight / lineHeight));
  const columnWidth = fontSize * 1.5;

  let columns = 0;
  for (const paragraph of text.split("\n")) {
    const len = Array.from(paragraph).length;
    columns += len === 0 ? 1 : Math.ceil(len / charsPerColumn);
  }
  columns = Math.max(1, columns);

  const rightColumnLeft =
    position === "right"
      ? width - margin - fontSize
      : margin + (columns - 1) * columnWidth;
  const right = rightColumnLeft + fontSize;
  const left = rightColumnLeft - (columns - 1) * columnWidth;
  return { left, right, top: margin + topInset, bottom: height - margin };
}
