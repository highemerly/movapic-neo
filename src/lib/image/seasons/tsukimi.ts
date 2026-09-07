/**
 * お月見（tsukimi）シーズンの装飾背景。decoration: "tsukimi"。
 * テキスト本体は overlay 側が「月光色の縦書き（左）」で描く。ここは背景（宵の空気＋点景）を描く。
 *
 * デザイン（名月と月見団子）:
 * - 既存シーズンは全て縦書き右なので、お月見だけ文字を左に置いて構図を反転させている。
 *   よって装飾は右半分〜下辺に置き、テキストの矩形とは重ねない。
 * - 写真全体を宵に沈める弱い青の色被り＋上辺だけ濃く落として夜空に見せる（肝試しより弱い＝
 *   写真の被写体は残したまま「夜」の空気だけ足す）。
 * - 右上に満月（暈＋餅つきうさぎの模様）。薄雲を月にかける。
 * - 右下にすすき、下辺に三方＋月見団子のシルエット。
 * - 月の満ち欠けは生成時刻から算出する（moonPhase.ts）。時刻由来＝決定的なので、同じ日なら
 *   プレビューと投稿結果が一致する（七夕の短冊色・肝試しの人魂のようなランダムは使わない）。
 * 数値は決め打ち。微調整はこのファイルで行う。
 */

import { CanvasRenderingContext2D } from "skia-canvas";
import { moonAppearance } from "@/lib/seasons/moonPhase";
import { estimateVerticalTextBox } from "./shared";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 写真を宵に沈める弱い青の色被り＋上辺を落とす夜空グラデ。 */
function drawNightTint(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(16, 24, 56, 0.20)";
  ctx.fillRect(0, 0, w, h);
  // 上辺だけ濃く＝空にあたる部分が暮れて見える。
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.5);
  g.addColorStop(0, "rgba(8, 14, 42, 0.30)");
  g.addColorStop(1, "rgba(8, 14, 42, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h * 0.5);
  ctx.restore();
}

/**
 * 光っている側（満月なら全体）のパスを作る。
 * 明暗境界線は「横半径 ratio*r の楕円の半分」として現れるので、円弧（明るい側の縁）と
 * 楕円弧（境界線）をつないだ図形になる。ratio=1 で楕円が円と一致＝真円の満月。
 */
function litMoonPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  ratio: number,
  darkLimb: "left" | "right"
): void {
  const rx = r * ratio;
  ctx.beginPath();
  if (darkLimb === "left") {
    ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false); // 上→右→下（光っている縁）
    ctx.ellipse(cx, cy, rx, r, 0, Math.PI / 2, -Math.PI / 2, false); // 下→左へ膨らむ境界線→上
  } else {
    ctx.arc(cx, cy, r, Math.PI / 2, (Math.PI * 3) / 2, false); // 下→左→上（光っている縁）
    ctx.ellipse(cx, cy, rx, r, 0, -Math.PI / 2, Math.PI / 2, false); // 上→右へ膨らむ境界線→下
  }
  ctx.closePath();
}

/**
 * 月面の餅つきうさぎ（海＝暗い模様に見立てる）。半径1の単位座標で組み、呼び出し側で
 * 月の中心へ translate＋scale(r) する。ごく薄く置くだけで「月」の記号性が跳ね上がる。
 */
function drawRabbit(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(186, 176, 142, 0.5)";

  // 臼（左下）。上が広い台形＋くびれた台。
  ctx.beginPath();
  ctx.moveTo(-0.58, 0.12);
  ctx.lineTo(-0.1, 0.12);
  ctx.lineTo(-0.18, 0.46);
  ctx.lineTo(-0.5, 0.46);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.54, 0.46);
  ctx.lineTo(-0.14, 0.46);
  ctx.lineTo(-0.14, 0.56);
  ctx.lineTo(-0.54, 0.56);
  ctx.closePath();
  ctx.fill();

  // うさぎの胴（右・臼に向かって前傾）。
  ctx.beginPath();
  ctx.ellipse(0.24, 0.16, 0.19, 0.28, -0.18, 0, Math.PI * 2);
  ctx.fill();

  // 頭。
  ctx.beginPath();
  ctx.ellipse(0.08, -0.2, 0.15, 0.13, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // 耳（後ろへ長く2本）。
  ctx.beginPath();
  ctx.ellipse(0.2, -0.45, 0.055, 0.21, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.34, -0.36, 0.05, 0.18, 0.55, 0, Math.PI * 2);
  ctx.fill();

  // 杵（胸元から臼の上へ振り下ろす1本の棒）。
  ctx.save();
  ctx.strokeStyle = "rgba(186, 176, 142, 0.5)";
  ctx.lineCap = "round";
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(0.1, 0.02);
  ctx.lineTo(-0.3, 0.06);
  ctx.stroke();
  // 杵の頭（臼側が太い）。
  ctx.lineWidth = 0.16;
  ctx.beginPath();
  ctx.moveTo(-0.34, 0.06);
  ctx.lineTo(-0.24, 0.06);
  ctx.stroke();
  ctx.restore();
}

/** 満月（暈＋月面＋うさぎ）。ratio/darkLimb は月相。 */
function drawMoon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  ratio: number,
  darkLimb: "left" | "right"
): void {
  ctx.save();

  // 暈（かさ）。月のまわりのにじんだ光。月相で切り抜くと境界線がそのまま光の縁として
  // くっきり出てしまうため、真円のまま弱く敷く（欠けた側は月本体が無いぶん自然に暗く見える）。
  const haloR = r * 2.2;
  const halo = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, haloR);
  halo.addColorStop(0, "rgba(255, 246, 214, 0.3)");
  halo.addColorStop(0.45, "rgba(255, 240, 200, 0.1)");
  halo.addColorStop(1, "rgba(255, 236, 190, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
  ctx.fill();

  // 月そのものは「光っている形」で切り抜いてから描く。欠けた側を暗い色で塗ってしまうと
  // 写真の上に黒い三日月が乗ってしまうため（overlay は写真に alpha 合成される）。
  ctx.save();
  litMoonPath(ctx, cx, cy, r, ratio, darkLimb);
  ctx.clip();

  const disk = ctx.createRadialGradient(
    cx - r * 0.3,
    cy - r * 0.3,
    r * 0.1,
    cx,
    cy,
    r * 1.05
  );
  disk.addColorStop(0, "rgba(255, 253, 240, 0.97)");
  disk.addColorStop(1, "rgba(244, 232, 198, 0.95)");
  ctx.fillStyle = disk;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(cx, cy);
  ctx.scale(r, r);
  // 欠けている日は模様が影に隠れて読めなくなるので、光っている側へ寄せる（満月では 0）。
  ctx.translate((darkLimb === "left" ? 1 : -1) * (1 - ratio) * 0.5, 0);
  drawRabbit(ctx);
  ctx.restore();

  ctx.restore();
}

/** 月にかかる薄雲。中心から四方へ透明に抜ける筋（輪郭が出ないよう楕円は円をスケールで潰す）。 */
function drawCloud(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  alpha: number
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, h / w);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
  g.addColorStop(0, `rgba(226, 232, 248, ${alpha})`);
  g.addColorStop(0.5, `rgba(226, 232, 248, ${alpha * 0.5})`);
  g.addColorStop(1, "rgba(226, 232, 248, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, w, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 2次ベジェ曲線上の点（すすきの穂を茎に沿って並べるのに使う）。 */
function quadPoint(
  p0: number,
  c: number,
  p1: number,
  t: number
): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * c + t * t * p1;
}

/**
 * すすき1本（弓なりの茎＋先が垂れる穂）。
 * x0,y0=株元、len=丈、lean=先端の左への倒れ幅。
 */
function drawSusuki(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  len: number,
  lean: number
): void {
  const tipX = x0 - lean;
  const tipY = y0 - len;
  const ctrlX = x0 - lean * 0.15;
  const ctrlY = y0 - len * 0.55;

  ctx.save();
  ctx.strokeStyle = "rgba(30, 34, 54, 0.6)";
  ctx.lineCap = "round";

  // 茎（風に押されて弓なり）。
  ctx.lineWidth = Math.max(1.5, len * 0.012);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
  ctx.stroke();

  // 穂。茎の上端 4 割に沿って、左右交互に斜め上へ出て先が垂れる細い房を並べる。
  // 左右の付け根を半ピッチずらす（真横に揃えるとはしごの桟のように見えてしまう）。
  const tufts = 34;
  ctx.lineWidth = Math.max(1, len * 0.005);
  for (let i = 0; i < tufts; i++) {
    const t = i / (tufts - 1);
    const side = i % 2 === 0 ? 1 : -1;
    const s = 1 - (t + (side > 0 ? 0 : 0.5 / tufts)) * 0.38; // 先端(1)から根元方向へ
    const bx = quadPoint(x0, ctrlX, tipX, s);
    const by = quadPoint(y0, ctrlY, tipY, s);
    // 先端ほど短く＝穂全体が細い紡錘形になる。
    const size = len * 0.07 * (0.3 + t * 0.7);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    // 茎から鋭角（上向き）に出て先が外へ開く。真横に出すとシダの葉や魚の骨に見えてしまう。
    ctx.quadraticCurveTo(
      bx + side * size * 0.15,
      by - size * 0.7,
      bx + side * size * 0.62,
      by - size * 0.95
    );
    ctx.stroke();
  }
  ctx.restore();
}

/** 三方に積んだ月見団子（正面から見た三角の山＝実物の15個積みの見え方）。 */
function drawDango(ctx: CanvasRenderingContext2D, cx: number, baseY: number, u: number): void {
  ctx.save();

  // 三方（台）。天板＋くびれた胴＋台座。
  ctx.fillStyle = "rgba(232, 224, 206, 0.85)";
  const topW = u * 3.4;
  ctx.fillRect(cx - topW / 2, baseY - u * 1.5, topW, u * 0.42);
  ctx.beginPath();
  ctx.moveTo(cx - u * 1.1, baseY - u * 1.08);
  ctx.lineTo(cx + u * 1.1, baseY - u * 1.08);
  ctx.lineTo(cx + u * 1.35, baseY - u * 0.2);
  ctx.lineTo(cx - u * 1.35, baseY - u * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(cx - topW / 2, baseY - u * 0.2, topW, u * 0.34);
  // 三方の正面の穴（宝珠形は省き丸で示す）。
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx, baseY - u * 0.62, u * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 団子（下段3・中段2・上段1）。三方の天板の上に積む。
  const rad = u * 0.52;
  const rows: [number, number][] = [
    [3, baseY - u * 1.5 - rad],
    [2, baseY - u * 1.5 - rad * 2.75],
    [1, baseY - u * 1.5 - rad * 4.5],
  ];
  for (const [count, y] of rows) {
    for (let i = 0; i < count; i++) {
      const x = cx + (i - (count - 1) / 2) * rad * 2.05;
      // 月あかりを受けた側（左上）を明るく＝白丸の羅列ではなく団子の粒に見せる。
      const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad);
      g.addColorStop(0, "rgba(253, 251, 244, 0.95)");
      g.addColorStop(1, "rgba(226, 220, 204, 0.92)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** お月見：宵の色被り＋名月（月相つき）＋薄雲＋すすき＋月見団子。 */
export function drawTsukimi(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  fontSize: number,
  margin: number,
  topInset: number,
  // 既定で「今」の月相。テストや将来の再現生成のために差し替えられるようにしておく。
  now: Date = new Date()
): void {
  const f = fontSize;

  drawNightTint(ctx, width, height);

  // テキストは縦書き左。装飾はその右側の空きに置く。
  const box = estimateVerticalTextBox(text, width, height, f, margin, topInset, "left");
  const freeLeft = box.right + f * 0.4;

  // 月（右上）。テキストが長くて右へ伸びたぶんだけ小さくして重なりを避ける。
  // 空きが下限を割るほど文字で埋まっている場合は下限（f*0.6）が優先され、文字と重なる。
  // 月だけは「お月見」の核なので、その場合も背景として必ず出す（描画順で文字の下に沈む）。
  const avail = Math.max(f, width - freeLeft);
  const r = clamp(Math.min(width, height) * 0.115, f * 0.6, avail / 2.2);
  // 右の余白が margin と揃うところに置く（テキストの左余白と対になる）。
  const cx = width - margin - r;
  const cy = margin + r * 1.35;
  const { terminatorRatio, darkLimb } = moonAppearance(now);
  drawMoon(ctx, cx, cy, r, terminatorRatio, darkLimb);

  // 薄雲（月の下側を横切る1本と、少し離れた細い1本）。
  drawCloud(ctx, cx - r * 0.5, cy + r * 0.75, r * 2.1, r * 0.2, 0.26);
  drawCloud(ctx, cx - r * 1.4, cy + r * 1.7, r * 1.5, r * 0.13, 0.16);

  // 下辺の点景（すすき・団子）は右側の空きに置く。テキストが長くて空きが足りないときは
  // 描かない（無理に押し込むと文字に重なって、装飾も文字も読めなくなる）。
  const u = Math.min(width, height) * 0.029;
  const rootX = width - margin * 0.8;
  if (rootX - freeLeft < u * 7) return;

  // すすき（右下から、月へ向かって左に倒れる3本）。株元は画面外＝地面から生えて見せる。
  const baseY = height + f * 0.2;
  // 一番丈の高い1本は月にかかるところまで伸ばす（月とすすきを1つの絵として結びつける）。
  const stems: [number, number, number][] = [
    [rootX, height * 0.42, height * 0.15],
    [rootX - f * 1.1, height * 0.31, height * 0.085],
    [rootX - f * 2.2, height * 0.22, height * 0.038],
  ];
  for (const [x0, len, lean] of stems) {
    drawSusuki(ctx, clamp(x0, freeLeft, rootX), baseY, len, lean);
  }

  // 団子（右下）。すすきの株元のすぐ左に据えて、すすきと団子を一組の点景にする
  // （テキスト側に寄せると文字数で左右に動き、画面の途中に浮いて見えてしまう）。
  drawDango(ctx, rootX - u * 3.2, height - margin * 0.6, u);
}
