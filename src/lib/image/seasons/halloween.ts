/**
 * ハロウィン（halloween）シーズンの装飾背景。decoration: "lantern"。
 * テキスト本体は overlay 側が「かぼちゃ色の横書き（下）」で描く。ここは背景（夕暮れ＋点景）を描く。
 *
 * デザイン（かぼちゃランタンの行列）:
 * - 既存シーズンは全て縦書きなので、ハロウィンだけ横書き（下）にして構図を変えている。
 * - 同じ怖い明朝を使う肝試しと絵が被らないよう、写真は暗転させない。下辺にだけ紫→橙の
 *   夕暮れを敷き、ランタンの灯りが足元から立ち上って見えるようにする（上半分は素の写真のまま）。
 * - 下辺いっぱいにジャック・オー・ランタンを並べ、文字はその上に載せる
 *   （overlay 側が HALLOWEEN_BOTTOM_INSET ぶん文字を持ち上げる）。
 * - 右上の隅にこうもりを数匹。
 * - かぼちゃの大きさ・顔・間隔とこうもりの位置は、文字列と寸法から導出した seed で決める。
 *   Math.random を使う七夕・肝試しと違い、同じ入力ならプレビューと投稿結果が一致する。
 * 数値は決め打ち。微調整はこのファイルで行う。
 */

import { CanvasRenderingContext2D } from "skia-canvas";
import { hashString, mulberry32 } from "../stamp/rng";

/**
 * 文字を持ち上げる量（fontSize 比）。かぼちゃの列（最大径＋ヘタ）と文字の間の空きを足した高さ。
 * overlay 側の文字位置とこのファイルの列の高さを一致させるため、定数として共有する。
 */
export const HALLOWEEN_BOTTOM_INSET_RATIO = 1.45;

/** かぼちゃの半径の上限（fontSize 比）。HALLOWEEN_BOTTOM_INSET_RATIO はこの径が収まる前提。 */
const PUMPKIN_MAX_R = 0.72;

/** 下辺に敷く夕暮れ（上は紫・足元は灯りの橙）。上半分には掛けない。 */
function drawDusk(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  const top = h * 0.45;
  const g = ctx.createLinearGradient(0, top, 0, h);
  g.addColorStop(0, "rgba(58, 22, 92, 0)");
  g.addColorStop(0.55, "rgba(58, 22, 92, 0.32)");
  g.addColorStop(1, "rgba(214, 92, 18, 0.42)");
  ctx.fillStyle = g;
  ctx.fillRect(0, top, w, h - top);
  ctx.restore();
}

/** 顔のくり抜き（半径1の単位座標）。variant で目と口の形を変える。 */
function facePath(ctx: CanvasRenderingContext2D, variant: number): void {
  ctx.beginPath();

  // 目。0=三角 / 1=つり目 / 2=丸。
  for (const side of [-1, 1]) {
    const ex = side * 0.36;
    if (variant === 0) {
      ctx.moveTo(ex, -0.34);
      ctx.lineTo(ex + 0.19, -0.02);
      ctx.lineTo(ex - 0.19, -0.02);
    } else if (variant === 1) {
      // 外側が上がったつり目（内側の角を下げる）。
      ctx.moveTo(ex + side * 0.2, -0.36);
      ctx.lineTo(ex + side * 0.16, -0.06);
      ctx.lineTo(ex - side * 0.2, -0.1);
    } else {
      ctx.moveTo(ex + 0.15, -0.18);
      ctx.arc(ex, -0.18, 0.15, 0, Math.PI * 2);
    }
    ctx.closePath();
  }

  // 鼻（小さな三角）。
  ctx.moveTo(0, -0.02);
  ctx.lineTo(0.08, 0.12);
  ctx.lineTo(-0.08, 0.12);
  ctx.closePath();

  // 口。上辺はゆるい弧、下辺はギザギザの歯。
  const mw = 0.56;
  const my = 0.26;
  ctx.moveTo(-mw, my);
  ctx.quadraticCurveTo(0, my + 0.1, mw, my);
  const teeth = variant === 2 ? 3 : 5;
  const depth = variant === 1 ? 0.34 : 0.26;
  for (let i = 0; i < teeth; i++) {
    const x0 = mw - (i * 2 * mw) / teeth;
    const x1 = mw - ((i + 1) * 2 * mw) / teeth;
    // 中央ほど深く＝口全体が笑った三日月形になる。
    const mid = (x0 + x1) / 2;
    const d = depth * (1 - Math.abs(mid / mw) * 0.55);
    ctx.lineTo(mid, my + d + 0.1);
    ctx.lineTo(x1, my + (i === teeth - 1 ? 0 : d * 0.45) + (i === teeth - 1 ? 0 : 0.08));
  }
  ctx.closePath();
}

/** ジャック・オー・ランタン1個。cx=中心X、baseY=底、r=半径、variant=顔、tilt=傾き(rad)。 */
function drawPumpkin(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  r: number,
  variant: number,
  tilt: number
): void {
  const ry = r * 0.84; // 少し扁平＝かぼちゃらしい横長
  const cy = baseY - ry;

  // 灯りの滲み（かぼちゃの周りに漏れる橙）。文字の背後にも届くが半透明なので可読性は落ちない。
  ctx.save();
  const glow = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 2.1);
  glow.addColorStop(0, "rgba(255, 170, 60, 0.38)");
  glow.addColorStop(1, "rgba(255, 140, 30, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);

  // ヘタ（実の後ろに差す。先に描いて実で根元を隠す）。
  ctx.fillStyle = "rgba(74, 96, 40, 0.95)";
  ctx.beginPath();
  ctx.moveTo(-r * 0.1, -ry * 0.86);
  ctx.quadraticCurveTo(-r * 0.06, -ry * 1.2, r * 0.16, -ry * 1.3);
  ctx.lineTo(r * 0.28, -ry * 1.18);
  ctx.quadraticCurveTo(r * 0.12, -ry * 1.1, r * 0.12, -ry * 0.86);
  ctx.closePath();
  ctx.fill();

  // 実。左右の房→中央の房の順に重ねて、うねのある輪郭を作る。
  const body = ctx.createRadialGradient(-r * 0.3, -ry * 0.4, r * 0.1, 0, 0, r * 1.1);
  body.addColorStop(0, "rgba(255, 158, 44, 0.97)");
  body.addColorStop(1, "rgba(214, 92, 14, 0.97)");
  ctx.fillStyle = body;
  ctx.strokeStyle = "rgba(150, 56, 6, 0.55)";
  ctx.lineWidth = Math.max(1, r * 0.045);
  const lobes: [number, number][] = [
    [-0.5, 0.52],
    [0.5, 0.52],
    [-0.24, 0.5],
    [0.24, 0.5],
    [0, 0.42],
  ];
  for (const [dx, rx] of lobes) {
    ctx.beginPath();
    ctx.ellipse(dx * r, 0, rx * r, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // 顔（中の灯りが透けた黄色）。暗い色でくり抜くと写真の上に黒い穴が乗るだけで
  // ランタンに見えないため、灯っている色で塗る。
  ctx.save();
  ctx.scale(r, ry);
  ctx.shadowColor = "rgba(255, 214, 90, 0.9)";
  ctx.shadowBlur = Math.max(2, r * 0.25);
  facePath(ctx, variant);
  ctx.fillStyle = "rgba(255, 236, 150, 0.98)";
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

/** こうもりのシルエット1匹。span=翼を広げた幅、tilt=傾き(rad)。 */
function drawBat(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  span: number,
  tilt: number
): void {
  const s = span / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  // 暗い写真では濃紫のシルエットが沈んで消えるので、薄紫の光で縁を浮かせる。
  ctx.shadowColor = "rgba(196, 160, 255, 0.55)";
  ctx.shadowBlur = Math.max(2, s * 0.22);
  ctx.fillStyle = "rgba(28, 12, 44, 0.82)";

  for (const side of [-1, 1]) {
    ctx.beginPath();
    // 肩→翼の先（上辺は山なり）。
    ctx.moveTo(0, -s * 0.06);
    ctx.quadraticCurveTo(side * s * 0.45, -s * 0.52, side * s, -s * 0.2);
    // 翼の下辺。3つの弧でえぐって、指骨の間に張った膜に見せる。
    ctx.quadraticCurveTo(side * s * 0.84, s * 0.04, side * s * 0.7, s * 0.24);
    ctx.quadraticCurveTo(side * s * 0.56, s * 0.02, side * s * 0.42, s * 0.22);
    ctx.quadraticCurveTo(side * s * 0.28, s * 0.04, side * s * 0.1, s * 0.2);
    ctx.lineTo(0, s * 0.16);
    ctx.closePath();
    ctx.fill();
  }

  // 胴と頭。
  ctx.beginPath();
  ctx.ellipse(0, s * 0.05, s * 0.11, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // 耳（頭の上の小さな三角2つ）。
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * s * 0.1, -s * 0.08);
    ctx.lineTo(side * s * 0.12, -s * 0.3);
    ctx.lineTo(side * s * 0.01, -s * 0.14);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** ハロウィン：下辺の夕暮れ＋かぼちゃランタンの行列＋こうもり。 */
export function drawHalloween(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  fontSize: number,
  margin: number
): void {
  const f = fontSize;
  const rng = mulberry32(hashString(`halloween:${width}x${height}:${text}`));

  drawDusk(ctx, width, height);

  // こうもり（右上の隅）。写真の主役を横切らないよう、隅に寄せた小さな群れにする。
  // 範囲は画像比でなく文字サイズ比で決める（画像比だと縦長・横長で群れが中央まで広がる）。
  const bats = 2 + Math.floor(rng() * 2); // 2〜3匹
  const zoneW = Math.min(f * 3.0, width * 0.4);
  const zoneH = Math.min(f * 1.8, height * 0.22);
  const placed: { x: number; y: number; span: number }[] = [];
  for (let i = 0; i < bats; i++) {
    const span = f * (0.8 + rng() * 0.7);
    let bx = 0;
    let by = 0;
    // 先に置いた1匹と重なったら数回引き直す（重なると1つの黒い塊に見えてしまう）。
    for (let tries = 0; tries < 8; tries++) {
      // 隅からの余白は文字の margin の半分＝文字より一段外側に置いて隅へ追いやる。
      bx = width - margin * 0.5 - span / 2 - rng() * (zoneW - span);
      by = margin * 0.5 + span * 0.3 + rng() * zoneH;
      const overlaps = placed.some(
        (p) => Math.hypot(p.x - bx, p.y - by) < (p.span + span) * 0.55
      );
      if (!overlaps) break;
    }
    placed.push({ x: bx, y: by, span });
    drawBat(ctx, bx, by, span, (rng() - 0.5) * 0.5);
  }

  // かぼちゃの行列（下辺）。左端から右端まで、大きさと間隔を揺らしながら並べる。
  // 底は margin より下に置く＝地面に据わって見える（文字の下余白とは揃えない）。
  const baseY = height - margin * 0.4;
  let x = margin * 0.4;
  while (x < width) {
    const r = f * (PUMPKIN_MAX_R - rng() * 0.26);
    const cx = x + r;
    // 右端で半分以上はみ出す1個は置かない（切れた顔が残るため）。
    if (cx + r * 0.5 > width) break;
    drawPumpkin(ctx, cx, baseY, r, Math.floor(rng() * 3), (rng() - 0.5) * 0.24);
    x = cx + r + f * (0.12 + rng() * 0.5);
  }
}
