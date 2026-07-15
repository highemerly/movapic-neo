/**
 * 肝試し（kimodameshi）シーズンの装飾背景。decoration: "obake"。
 * テキスト本体は overlay 側が「骨白の縦書き」で描く。ここは背景（夜の空気＋お化け）を描く。
 *
 * デザイン（骨白×人魂）:
 * - 写真全体を夜に沈める暗転＋四隅を落とすヴィネット（昼の写真でも肝試しの空気にする）。
 * - 定番の白いお化けを1体、縦書きテキストの反対側（左の空き）に半透明で浮かべる。
 * - 青緑の人魂を数個ドリフトさせる（発光＝半透明なので上に載るテキストの可読性は保たれる）。
 *   人魂だけは数・位置・大きさをランダムにする（お化け・暗転は決定的）。
 * 数値は決め打ち。微調整はこのファイルで行う。
 */

import { CanvasRenderingContext2D } from "skia-canvas";
import { estimateVerticalTextBox } from "./shared";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 写真全体を夜に沈める暗転＋四隅ヴィネット。 */
function darkenAndVignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  // 全体を青黒に沈める（半透明なので写真がうっすら透ける＝夜景化）。
  ctx.fillStyle = "rgba(8, 10, 22, 0.45)";
  ctx.fillRect(0, 0, w, h);
  // 四隅を落として中心へ視線を集める。
  const cx = w / 2;
  const cy = h / 2;
  const g = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.35, cx, cy, Math.max(w, h) * 0.75);
  g.addColorStop(0, "rgba(0, 0, 8, 0)");
  g.addColorStop(1, "rgba(0, 0, 8, 0.6)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** 青緑に発光する人魂（丸い発光＋上向きの雫状の炎）。 */
function drawHitodama(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.save();
  // 発光（外へ向けて透明に抜けるラジアルグラデ）。
  const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 2.2);
  g.addColorStop(0, "rgba(180, 255, 220, 0.9)");
  g.addColorStop(0.4, "rgba(90, 210, 180, 0.5)");
  g.addColorStop(1, "rgba(40, 120, 110, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
  // 芯の炎（上に尖った雫）。
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 1.6);
  ctx.quadraticCurveTo(cx + r * 0.9, cy - r * 0.2, cx, cy + r);
  ctx.quadraticCurveTo(cx - r * 0.9, cy - r * 0.2, cx, cy - r * 1.6);
  ctx.closePath();
  ctx.fillStyle = "rgba(210, 255, 235, 0.85)";
  ctx.fill();
  ctx.restore();
}

/** 定番の白いお化け（丸い頭＋波打つ裾＋黒い目と口）。 */
function drawGhost(ctx: CanvasRenderingContext2D, cx: number, cy: number, gw: number, gh: number): void {
  const left = cx - gw / 2;
  const right = cx + gw / 2;
  const headR = gw / 2;
  const headCy = cy - gh / 2 + headR; // 頭（上半円）の中心
  const bottomY = cy + gh / 2;

  ctx.save();
  // ふわっとした外側の光（お化けの輪郭をにじませる）。
  ctx.shadowColor = "rgba(230, 240, 255, 0.5)";
  ctx.shadowBlur = Math.max(4, gw * 0.12);

  ctx.beginPath();
  ctx.moveTo(left, bottomY);
  ctx.lineTo(left, headCy);
  // 頭（左→上→右の半円）。canvas は角度が時計回りに増えるので π→2π で上側を通る。
  ctx.arc(cx, headCy, headR, Math.PI, Math.PI * 2, false);
  ctx.lineTo(right, bottomY);
  // 裾を波打たせながら右→左へ戻す。付け根(端点)を交互に持ち上げ、谷の深さも変えて
  // まっすぐな底辺を崩す（風に揺れる裾＝ふわふわ感）。両端(右端/左端)は側面と揃える。
  const bumps = 4;
  const bumpW = gw / bumps;
  for (let i = 0; i < bumps; i++) {
    const x0 = right - i * bumpW;
    const x1 = x0 - bumpW;
    const lift = i === bumps - 1 ? 0 : bumpW * (i % 2 === 0 ? 0.32 : 0.08);
    const dip = bumpW * (i % 2 === 0 ? 0.9 : 0.6);
    ctx.quadraticCurveTo((x0 + x1) / 2, bottomY + dip, x1, bottomY - lift);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(240, 242, 246, 0.82)";
  ctx.fill();
  ctx.restore();

  // 目・口（黒）。影は付けない。
  ctx.save();
  ctx.fillStyle = "rgba(20, 20, 28, 0.9)";
  const eyeY = headCy + headR * 0.05;
  const eyeDx = headR * 0.42;
  const eyeRx = headR * 0.16;
  const eyeRy = headR * 0.26;
  ctx.beginPath();
  ctx.ellipse(cx - eyeDx, eyeY, eyeRx, eyeRy, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + eyeDx, eyeY, eyeRx, eyeRy, 0, 0, Math.PI * 2);
  ctx.fill();
  // 口（小さな楕円）。
  ctx.beginPath();
  ctx.ellipse(cx, eyeY + headR * 0.55, headR * 0.14, headR * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 肝試し：暗転＋ヴィネット＋お化け＋人魂。 */
export function drawObake(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  fontSize: number,
  margin: number,
  topInset: number
): void {
  const f = fontSize;

  darkenAndVignette(ctx, width, height);

  // テキストは縦書き（右）。お化けは左の空きに置く（テキストと重ねない）。
  const box = estimateVerticalTextBox(text, width, height, f, margin, topInset);
  const avail = clamp(box.left, 0, width);

  // お化けの寸法（小さめ）。左の空きに収まるよう必要なら縮める。
  let gh = clamp(Math.min(width, height) * 0.14, f * 1.8, height * 0.3);
  let gw = gh * 0.72;
  if (avail < gw * 1.05) {
    gw = clamp(avail * 0.9, f * 1.4, gw);
    gh = gw / 0.72;
  }
  // 左下の隅に寄せる（端から少し余白。裾の波が枠外に出ない分だけ下も余分に空ける）。
  const pad = Math.min(width, height) * 0.035;
  const gx = clamp(pad + gw / 2, gw / 2, width);
  const gy = height - gh / 2 - Math.max(pad, gw * 0.2);
  drawGhost(ctx, gx, gy, gw, gh);

  // 人魂は数・位置・大きさをランダムに散らす（七夕の短冊色と同様 Math.random を使う）。
  // 投稿ごとに絵が変わるため、プレビューと投稿結果は一致しない（七夕の短冊色と同じ挙動）。
  // テキストの列（右）には重ねず左側の暗がりに置き、お化けの真上は避ける。
  const gLeft = gx - gw / 2;
  const gRight = gx + gw / 2;
  const gTop = gy - gh / 2;
  const gBottom = gy + gh / 2;
  // 人魂はお化けの周囲（少し上寄り＝立ち上る炎のイメージ）に集める。テキスト左端より左に収める。
  const xMax = Math.max(margin + f * 2, avail - f * 0.3);
  const zoneCx = gx + gw * 0.4;
  const zoneCy = gy - gh * 0.7;
  const spreadX = gw * 2.4;
  const spreadY = gh * 1.7;
  const count = 2 + Math.floor(Math.random() * 3); // 2〜4個
  for (let i = 0; i < count; i++) {
    let hx = zoneCx;
    let hy = zoneCy;
    // お化けの体に被ったら数回引き直す（発光が顔に重なると不自然なため）。
    for (let tries = 0; tries < 8; tries++) {
      hx = zoneCx + (Math.random() * 2 - 1) * spreadX;
      hy = zoneCy + (Math.random() * 2 - 1) * spreadY;
      const onGhost =
        hx > gLeft - f * 0.5 && hx < gRight + f * 0.5 && hy > gTop - f * 0.5 && hy < gBottom + f * 0.5;
      if (!onGhost) break;
    }
    const hr = f * (0.22 + Math.random() * 0.3); // f*0.22〜0.52
    drawHitodama(ctx, clamp(hx, margin, xMax), clamp(hy, margin, height - margin), hr);
  }
}
