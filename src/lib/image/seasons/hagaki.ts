/**
 * 残暑見舞い（zansho）シーズンの装飾背景。decoration: "hagaki"。
 * ここは写真の上に載せる装飾（白フチ・切手・消印・花火）だけを描く。
 *
 * デザイン（絵はがき風）:
 * - 写真の四辺に白フチ＝写真プリントの絵はがきに見せる。
 * - 左上に夕暮れモチーフの切手。目打ち（ミシン目）は destination-out で打ち抜き写真を透かす。
 *   切手だけ僅かに傾け、消印は水平（手で貼った切手に機械の消印が乗るイメージ）。
 * - 切手の下側に「SHAMEZO局」の赤い丸型消印。
 * - 左下に花火（夏の終わりのアクセント）。
 * テキスト本体は overlay 側が通常どおり（白文字＋黒縁取りの縦書き）で描く。専用背景は敷かない。
 * 数値は決め打ち。微調整はこのファイルで行う。ランダム要素なし（プレビュー＝投稿結果が一致）。
 */

import { CanvasRenderingContext2D } from "skia-canvas";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// 消印の文字用。overlay.ts の CANVAS_FONT_NAMES["hui-font"] と同じ内部フォント名。
// overlay.ts から import すると overlay → seasons → hagaki → overlay の循環になるため直接持つ。
const POSTMARK_FONT = "HuiFont";

const POSTMARK_RED = "rgba(196, 40, 36, 0.9)"; // 消印の赤インク（濃いめ＝暗い切手絵の上でも読める）

/** はがきの白フチ。フチ幅を返す（切手の位置決めに使う）。 */
function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  // margin（min*0.05）より細くして、テキストがフチに触れないようにする。
  const bw = Math.max(6, Math.min(w, h) * 0.028);
  ctx.save();
  ctx.fillStyle = "rgba(255, 252, 246, 0.96)";
  ctx.fillRect(0, 0, w, bw);
  ctx.fillRect(0, h - bw, w, bw);
  ctx.fillRect(0, 0, bw, h);
  ctx.fillRect(w - bw, 0, bw, h);
  ctx.restore();
  return bw;
}

/**
 * 打ち上げ花火（菊型）。放射状の光条＋二重の光点＋中心の閃光。
 * r=開いた半径。colors=[光条色, 光点色]。半透明で昼の写真にも馴染ませる。
 */
function drawFirework(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  spokeColor: string,
  dotColor: string
): void {
  const spokes = 12;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = spokeColor;
  ctx.lineWidth = Math.max(1.5, r * 0.035);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    // 光条（中心の少し外から先端へ）。
    ctx.beginPath();
    ctx.moveTo(cx + dx * r * 0.22, cy + dy * r * 0.22);
    ctx.lineTo(cx + dx * r, cy + dy * r);
    ctx.stroke();
  }
  // 先端と中間の光点（二重菊）。
  ctx.fillStyle = dotColor;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    ctx.beginPath();
    ctx.arc(cx + dx * r, cy + dy * r, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + dx * r * 0.62, cy + dy * r * 0.62, r * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
  // 中心の閃光。
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 切手の縁の目打ち（ミシン目）。縁に沿って小円を destination-out で打ち抜く。 */
function punchPerforation(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const r = w * 0.045;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  const punch = (cx: number, cy: number) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // 角にも穴が乗るよう、辺ごとに等分して配置する。
  const nx = Math.max(2, Math.round(w / (r * 2.4)));
  const ny = Math.max(2, Math.round(h / (r * 2.4)));
  for (let i = 0; i <= nx; i++) {
    punch(x + (w * i) / nx, y);
    punch(x + (w * i) / nx, y + h);
  }
  for (let i = 1; i < ny; i++) {
    punch(x, y + (h * i) / ny);
    punch(x + w, y + (h * i) / ny);
  }
  ctx.restore();
}

/** 切手の中の絵（夕暮れの空＋夕日＋山の稜線＋小さな花火＋内枠線）。 */
function drawStampArt(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  sw: number,
  sh: number
): void {
  const si = sw * 0.09; // 台紙の白を残す内側余白
  const ix = sx + si;
  const iy = sy + si;
  const iw = sw - si * 2;
  const ih = sh - si * 2;
  ctx.save();
  // 空（夕暮れグラデ）。
  const g = ctx.createLinearGradient(0, iy, 0, iy + ih);
  g.addColorStop(0, "#ffe6ae");
  g.addColorStop(0.65, "#ffb26b");
  g.addColorStop(1, "#ff9350");
  ctx.fillStyle = g;
  ctx.fillRect(ix, iy, iw, ih);
  // 夕日。
  ctx.fillStyle = "#ff6b3d";
  ctx.beginPath();
  ctx.arc(ix + iw * 0.5, iy + ih * 0.62, iw * 0.2, 0, Math.PI * 2);
  ctx.fill();
  // 山の稜線シルエット。
  ctx.fillStyle = "rgba(93, 58, 82, 0.9)";
  ctx.beginPath();
  ctx.moveTo(ix, iy + ih);
  ctx.lineTo(ix, iy + ih * 0.8);
  ctx.quadraticCurveTo(ix + iw * 0.3, iy + ih * 0.6, ix + iw * 0.55, iy + ih * 0.82);
  ctx.quadraticCurveTo(ix + iw * 0.75, iy + ih * 0.95, ix + iw, iy + ih * 0.76);
  ctx.lineTo(ix + iw, iy + ih);
  ctx.closePath();
  ctx.fill();
  // 夕景の空に小さな花火1つ（白抜き＝暮れ空に映える）。
  ctx.clip(); // 切手の内枠からはみ出さないよう内側絵にクリップ。
  drawFirework(
    ctx,
    ix + iw * 0.66,
    iy + ih * 0.3,
    iw * 0.22,
    "rgba(255, 248, 220, 0.95)",
    "rgba(255, 255, 245, 0.95)"
  );
  ctx.restore();
  // 内枠線。
  ctx.save();
  ctx.strokeStyle = "rgba(160, 90, 60, 0.85)";
  ctx.lineWidth = Math.max(1, sw * 0.015);
  ctx.strokeRect(ix, iy, iw, ih);
  ctx.restore();
}

/** 赤い丸型消印（外円の縁＋上下の弦＋中央「SHAMEZO局」）。波線なし。angle=傾き（ラジアン）。 */
function drawPostmark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  angle: number
): void {
  ctx.save();
  // 手で押した消印らしく少し傾ける（弦・文字ごと回す）。
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.translate(-cx, -cy);
  ctx.strokeStyle = POSTMARK_RED;
  ctx.fillStyle = POSTMARK_RED;
  // 外円（縁）。
  ctx.lineWidth = Math.max(2, r * 0.08);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // 上下の弦（局名帯を挟む実物の丸型印の区切り線）。
  const dy = r * 0.42;
  const half = Math.sqrt(r * r - dy * dy) * 0.94;
  ctx.lineWidth = Math.max(1.5, r * 0.05);
  ctx.beginPath();
  ctx.moveTo(cx - half, cy - dy);
  ctx.lineTo(cx + half, cy - dy);
  ctx.moveTo(cx - half, cy + dy);
  ctx.lineTo(cx + half, cy + dy);
  ctx.stroke();
  // 中央の「SHAMEZO局」。弦の間に収まるよう、実測幅で横スケールして詰める。
  ctx.font = `${Math.max(7, Math.round(r * 0.34))}px "${POSTMARK_FONT}"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = "SHAMEZO局";
  const avail = half * 2 * 0.86;
  const w = ctx.measureText(label).width;
  const sx = w > 0 ? Math.min(1, avail / w) : 1;
  ctx.translate(cx, cy);
  ctx.scale(sx, 1);
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

/**
 * 残暑見舞い：白フチ＋切手＋消印＋花火（文字の専用背景は無し）。
 * text/margin/topInset は使わない（装飾はテキストと重ならない固定位置に置くだけ）ため受けない。
 */
export function drawHagaki(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  fontSize: number
): void {
  const f = fontSize;
  const bw = drawFrame(ctx, width, height);

  // 花火（左下のアクセント）。暖色・寒色を混ぜて夏の夜空の名残に。
  drawFirework(ctx, width * 0.13, height * 0.79, f * 1.5, "rgba(224, 74, 62, 0.72)", "rgba(255, 214, 120, 0.85)");
  drawFirework(ctx, width * 0.25, height * 0.87, f * 0.95, "rgba(90, 170, 200, 0.7)", "rgba(210, 245, 255, 0.85)");

  // 切手（左上。縦書きテキストは右なので重ならない）。僅かに傾けて手貼り感を出す。
  const sMin = Math.min(width, height);
  const sh = clamp(sMin * 0.17, f * 2.0, height * 0.3);
  const sw = sh * 0.8;
  const sx = bw + sMin * 0.03;
  const sy = bw + sMin * 0.03;
  ctx.save();
  ctx.translate(sx + sw / 2, sy + sh / 2);
  ctx.rotate((-2.5 * Math.PI) / 180);
  ctx.translate(-(sx + sw / 2), -(sy + sh / 2));
  ctx.fillStyle = "rgba(252, 250, 242, 0.96)";
  ctx.fillRect(sx, sy, sw, sh);
  punchPerforation(ctx, sx, sy, sw, sh);
  drawStampArt(ctx, sx, sy, sw, sh);
  ctx.restore();

  // 消印（切手の下辺にまたがせる。中央の局名帯が切手の外に出て読めるよう深く下げる）。
  // 少し傾けて手押し感を出す（切手は右肩上がりに貼ってあるので消印は逆向きに傾ける）。
  drawPostmark(ctx, sx + sw * 0.5, sy + sh * 1.15, sw * 0.38, (9 * Math.PI) / 180);
}
