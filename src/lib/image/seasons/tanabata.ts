/**
 * 七夕（tanabata）シーズンの装飾背景。decoration: "tanzaku"。
 * テキスト本体は overlay 側が「右ほど大きい縦書きの黒文字」で描く。ここは背景を描く。
 *
 * デザイン:
 * - 形: 真正面から見た短冊（まっすぐな長方形）。
 * - 枠は無し（透明）、背景は薄い色（マジックで書いた紙のイメージ）。背景色は3色からランダム。
 * - 上部に穴を開け（overlay を打ち抜いて写真が透ける）、太い紐を通す。穴はやや下寄り。
 * - ★は画像の左下にまとめて、縁取りなしで大きめに散らす。
 * 数値は決め打ち。微調整はこのファイルで行う。
 */

import { CanvasRenderingContext2D } from "skia-canvas";
import { starPath, estimateVerticalTextBox } from "./shared";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// 短冊の背景色（薄め・半透明）。七夕の短冊らしく3色から出し分ける。
const TANZAKU_COLORS = [
  "rgba(255, 243, 191, 0.76)", // 薄い黄
  "rgba(255, 214, 224, 0.76)", // 薄い桃
  "rgba(205, 232, 255, 0.76)", // 薄い青
];

/** 七夕：真正面の短冊（長方形）＋穴＋太紐＋左下の星。 */
export function drawTanabata(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  fontSize: number,
  margin: number,
  topInset: number
): void {
  const f = fontSize;
  const box = estimateVerticalTextBox(text, width, height, f, margin, topInset);
  const sidePad = f * 0.5;

  const x = clamp(box.left - sidePad, f * 0.3, width);
  const right = clamp(box.right + sidePad * 1.3, 0, width - f * 0.2);
  const w = right - x;

  // 真正面の短冊（まっすぐな長方形）。上端は穴のための余白を含めて高めに取る。
  const top = clamp(margin * 0.45, f * 0.3, height);
  const bottom = clamp(height - margin + f * 0.45, 0, height - f * 0.1);

  ctx.save();

  // 短冊本体（枠なし・薄い色・3色ランダム）。
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(right, top);
  ctx.lineTo(right, bottom);
  ctx.lineTo(x, bottom);
  ctx.closePath();
  ctx.fillStyle = TANZAKU_COLORS[Math.floor(Math.random() * TANZAKU_COLORS.length)];
  ctx.fill();

  // 穴: やや下寄り（テキスト開始 margin+topInset より上で、紙の中に収める）。
  const holeR = f * 0.3;
  const holeX = x + w * 0.5;
  const holeY = clamp(margin + topInset * 0.45, top + holeR * 1.2, margin + topInset - holeR * 1.1);
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(holeX, holeY, holeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 紐（太め）。穴の上から穴へ通す。
  ctx.beginPath();
  ctx.moveTo(holeX, clamp(holeY - f * 1.5, 1, height));
  ctx.lineTo(holeX, holeY);
  ctx.lineWidth = Math.max(3, f * 0.1);
  ctx.strokeStyle = "rgba(120, 95, 45, 0.9)";
  ctx.lineCap = "round";
  ctx.stroke();

  // ★ を画像の左下にまとめて散らす（縁取りなし・大きめ混在）。
  const cx0 = width * 0.13;
  const cy0 = height * 0.84;
  const stars: [number, number, number][] = [
    [cx0, cy0, f * 0.55],
    [cx0 + f * 1.7, cy0 - f * 1.05, f * 0.34],
    [cx0 - f * 1.15, cy0 + f * 0.95, f * 0.28],
    [cx0 + f * 0.5, cy0 + f * 1.55, f * 0.22],
    [cx0 + f * 2.3, cy0 + f * 0.5, f * 0.42],
    [cx0 - f * 0.25, cy0 - f * 1.65, f * 0.18],
  ];
  ctx.fillStyle = "rgba(255, 209, 102, 0.7)";
  for (const [sx, sy, sr] of stars) {
    const cx = clamp(sx, f * 0.3, width - f * 0.3);
    const cy = clamp(sy, f * 0.3, height - f * 0.3);
    starPath(ctx, cx, cy, sr);
    ctx.fill();
  }

  ctx.restore();
}
