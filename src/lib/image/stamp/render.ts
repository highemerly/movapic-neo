/**
 * ハンコ（朱文＝枠と文字だけを印肉色で描き、地は透明）の描画。
 *
 * 設計の要点（旧実装からの作り直しの理由）:
 * - 印章は彫ってあるので文字は動かない。旧実装の「字ごとに位置と角度をランダムにずらす」は
 *   手書きの記号であってハンコには見えなかったため廃止し、完全に整列させる。
 * - 不均一さはベクター（字の座標・枠の頂点）ではなくインクの乗り方＝ピクセル側にしかない。
 *   そこで印影をいったんオフスクリーンに完全な形で描き、destination-out のノイズマスクで
 *   削る。枠は直線のまま縁だけが自然に欠ける。
 * - 地（背景）は枠と別パスの矩形塗りだったため必ずはみ出していた。朱文では地を塗らない。
 * - 傾きは固定 -7.5° で大きすぎたので tilt.ts で印面の大きさに応じて決める。
 *
 * 乱数はすべて seed 由来（rng.ts）。同じ入力なら同じ印影になる＝ゴールデンテストに載せられる。
 */

import { Canvas } from "skia-canvas";
import type { CanvasRenderingContext2D } from "skia-canvas";
import type { Position, FontFamily } from "@/types";
import { fontStack, withGraphemeFont, hexToRgb } from "../text";
import { splitGraphemes } from "@/lib/text/grapheme";
import { computeStampLayout, stampAdvance, type StampLayout } from "./layout";
import { createInkMask } from "./ink";
import { hashString, mulberry32, clamp, smoothstep } from "./rng";
import { computeStampTilt } from "./tilt";
import { toInkColor, toHaloColor } from "./color";

const RENDER = {
  /** 印影の周囲に取るにじみ用の余白（fontSize 比）。 */
  bleed: 0.5,
  /**
   * 朱肉のにじみ（ぼかした同色を薄く下に敷く）。
   * にじみは紙の繊維で決まる物理量なので印面の大きさには比例しない。fontSize 比のままだと
   * 特大サイズで印影全体がぼやけるため上限を設ける。
   *
   * 下限は置かない。小さい印（フォントサイズ下限14px）では絶対値の下限が fontSize 比で
   * 数倍に効いてしまい、小さい印だけ不釣り合いに太く・ぼやけて見えるため。
   */
  bleedBlur: 0.02,
  maxBleedBlur: 3,
  bleedAlpha: 0.32,
  /**
   * 可読性のためのハロー（反対色を輪郭の外へ薄く広げる）。にじみより一段広くぼかす。
   * ハンコには縁取りも影も無いので、これが無いと写真と同系色のとき印影が沈む。
   */
  haloRadius: 0.035,
  maxHaloRadius: 12,
  haloBlur: 0.022,
  maxHaloBlur: 5,
  haloAlpha: 0.5,
  /** 写真の上のインクとして馴染ませるための最終不透明度。 */
  inkAlpha: 0.93,
  /** 文字の線を太らせる量（印章の線幅は均一で太い）。 */
  charStroke: 0.05,
  /** 枠の角丸半径。石に彫った角の僅かな丸み。 */
  cornerRadius: 0.06,
  /** 枠の辺のゆらぎ幅（低周波のみ＝手彫りの微妙な不均一）。 */
  frameWobble: 0.016,
} as const;

/** 周期的な 1D value noise。枠の一周でつながるよう端をラップする。 */
function makeCyclicNoise(rng: () => number, points: number): (t: number) => number {
  const values = Array.from({ length: points }, () => rng() * 2 - 1);
  return (t: number) => {
    const x = ((t % 1) + 1) % 1;
    const scaled = x * points;
    const i = Math.floor(scaled);
    const frac = smoothstep(0, 1, scaled - i);
    const a = values[i % points];
    const b = values[(i + 1) % points];
    return a * (1 - frac) + b * frac;
  };
}

/** 枠のパス。辺は直線を保ちつつ法線方向へ低周波のゆらぎだけを与える。 */
function traceFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  wobble: (t: number) => number,
  amplitude: number
): void {
  const r = Math.min(radius, w / 2, h / 2);
  const straightW = Math.max(0, w - r * 2);
  const straightH = Math.max(0, h - r * 2);
  const perimeter = (straightW + straightH) * 2 || 1;

  // 辺ごとの [始点, 終点, 法線]。t は一周の進み具合。
  const edges = [
    { x0: x + r, y0: y, x1: x + w - r, y1: y, nx: 0, ny: -1, len: straightW },
    { x0: x + w, y0: y + r, x1: x + w, y1: y + h - r, nx: 1, ny: 0, len: straightH },
    { x0: x + w - r, y0: y + h, x1: x + r, y1: y + h, nx: 0, ny: 1, len: straightW },
    { x0: x, y0: y + h - r, x1: x, y1: y + r, nx: -1, ny: 0, len: straightH },
  ];

  const SEGMENTS = 12;
  let traveled = 0;
  ctx.beginPath();

  edges.forEach((edge, index) => {
    for (let i = 0; i <= SEGMENTS; i++) {
      const s = i / SEGMENTS;
      const t = (traveled + edge.len * s) / perimeter;
      const d = wobble(t) * amplitude;
      const px = edge.x0 + (edge.x1 - edge.x0) * s + edge.nx * d;
      const py = edge.y0 + (edge.y1 - edge.y0) * s + edge.ny * d;
      if (index === 0 && i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    traveled += edge.len;

    // 角: 実際の矩形頂点を制御点にして次の辺の始点へ丸める。
    const next = edges[(index + 1) % edges.length];
    const cornerX = edge.nx !== 0 ? edge.x1 : next.x0;
    const cornerY = edge.nx !== 0 ? next.y0 : edge.y1;
    const dn = wobble(traveled / perimeter) * amplitude;
    ctx.quadraticCurveTo(
      cornerX + (edge.nx + next.nx) * dn * 0.7,
      cornerY + (edge.ny + next.ny) * dn * 0.7,
      next.x0 + next.nx * dn,
      next.y0 + next.ny * dn
    );
  });

  ctx.closePath();
}

function drawChars(
  ctx: CanvasRenderingContext2D,
  layout: StampLayout,
  originX: number,
  originY: number,
  fontSize: number,
  fontName: string
): void {
  ctx.font = fontStack(fontSize, fontName);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  ctx.lineWidth = fontSize * RENDER.charStroke;

  // textBaseline="middle" は欧文の中心なので、和文の字面は枠の中で下寄りに出る。
  // 代表字の実寸から視覚的な中心とのズレを測り、行位置をそのぶん引き上げる。
  const metrics = ctx.measureText("国");
  const centerOffset = (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;

  const paint = (char: string, x: number, y: number, rotate: boolean) => {
    withGraphemeFont(ctx, char, fontSize, fontName, () => {
      ctx.save();
      ctx.translate(x, y + centerOffset);
      if (rotate) ctx.rotate(Math.PI / 2);
      // fill だけだと細い書体で印章に見えないため、同色の stroke で線を太らせる。
      ctx.strokeText(char, 0, 0);
      ctx.fillText(char, 0, 0);
      ctx.restore();
    });
  };

  // 1文字目の中心は「送りの半分」ではなくグリフの半分（レイアウトが両端をグリフで詰めているため）。
  if (layout.isVertical) {
    const firstColumnCenterX = originX + layout.contentWidth - layout.glyphWidth / 2;
    layout.columns.forEach((column, colIndex) => {
      column.forEach((info, charIndex) => {
        paint(
          info.char,
          firstColumnCenterX - colIndex * layout.columnWidth,
          originY + layout.glyphHeight / 2 + charIndex * layout.lineHeight,
          info.shouldRotate
        );
      });
    });
    return;
  }

  layout.lines.forEach((line, lineIndex) => {
    const y = originY + layout.glyphHeight / 2 + lineIndex * layout.lineHeight;

    // 横書きは左揃え（上/下の通常描画と同じ規則。中央寄せにすると折り返した2行目以降がずれる）。
    // 字送りだけを伸ばす（グリフの大きさは変えない）ので、送り幅に倍率を掛ける。
    let cursor = originX;
    splitGraphemes(line).forEach((char) => {
      const advance =
        stampAdvance(ctx, char, fontSize, fontName, layout.useProportional) * layout.advanceScale;
      paint(char, cursor + advance / 2, y, false);
      cursor += advance;
    });
  });
}

/** かすれマスクを destination-out で印影から削る。 */
function applyInkMask(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  destX: number,
  destY: number,
  destWidth: number,
  destHeight: number,
  border: number
): void {
  // 枠線の帯を外周とみなす（縁が欠けるのは当たりの弱い枠線から）。
  const edgeBandX = clamp((border * 1.6) / destWidth, 0.01, 0.2);
  const edgeBandY = clamp((border * 1.6) / destHeight, 0.01, 0.2);

  // マスクは印面と同じ縦横比で作る。正方形のまま長方形へ引き伸ばすと、かすれの粒が
  // 横長に潰れて「拡大されたノイズ」に見える。
  const resolution = (density: number, lo: number, hi: number) => ({
    width: Math.round(clamp(destWidth / density, lo, hi)),
    height: Math.round(clamp(destHeight / density, lo, hi)),
  });

  // 2層とも同じ画素を削るので、各層の strength は控えめにする（強くすると印影が読めなくなる）。
  const layers = [
    // 大きなインクのムラ＋押し圧の偏り。低解像度なので拡大時の補間が滑らかな濃淡になる。
    {
      ...resolution(18, 8, 64),
      frequency: 4,
      octaves: 2,
      strength: 0.2,
      softness: 0.14,
      pressureAngle: rng() * Math.PI * 2,
      pressureAmount: 0.24,
      edgeBoost: 0.07,
      edgeBandX,
      edgeBandY,
      pinholes: 0,
    },
    // 細かいかすれと紙の凹みによる抜け。箇所は多めに、1箇所の広がりは小さく。
    {
      ...resolution(1.4, 72, 360),
      frequency: 16,
      octaves: 3,
      strength: 0.24,
      softness: 0.09,
      pressureAngle: 0,
      pressureAmount: 0,
      edgeBoost: 0.1,
      edgeBandX,
      edgeBandY,
      pinholes: 5,
    },
  ];

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  for (const layer of layers) {
    const mask = createInkMask(rng, layer);
    const maskCanvas = new Canvas(layer.width, layer.height);
    const maskCtx = maskCanvas.getContext("2d");
    const image = maskCtx.createImageData(layer.width, layer.height);
    image.data.set(mask);
    maskCtx.putImageData(image, 0, 0);
    ctx.drawImage(maskCanvas, destX, destY, destWidth, destHeight);
  }
  ctx.restore();
}

/**
 * 印影と同じ形（かすれの抜けも含む）の単色シルエットを作る。
 * ハローは印影を塗り直したものでなければならない（別に描くとかすれと形がずれる）。
 */
function silhouette(source: Canvas, color: string): Canvas {
  const canvas = new Canvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, source.width, source.height);
  return canvas;
}

/**
 * ハロー層（印影を全方向へ radius だけ広げた反対色のシルエット）。
 *
 * ぼかすだけでは効かない。印影は細い線の集まりなので、ぼかしたシルエットは大半が
 * インクの下に隠れてしまい、外へ出るのはごく僅かになる。実際に外へ広げる必要がある。
 */
function haloLayer(source: Canvas, color: string, radius: number): Canvas {
  const stamped = silhouette(source, color);
  const canvas = new Canvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  const STEPS = 8;
  for (let i = 0; i < STEPS; i++) {
    const angle = (i / STEPS) * Math.PI * 2;
    ctx.drawImage(stamped, Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  return canvas;
}

export interface StampOptions {
  /**
   * 傾けるか（既定 true）。UI のアレンジ選択に出すプレビュー画像のように、
   * 「その都度変わる傾き」ではなく印影の質感だけを見せたい場合に false。
   */
  tilt?: boolean;
}

/**
 * ハンコ効果で文字を描画する。
 */
export function drawStampText(
  ctx: CanvasRenderingContext2D,
  text: string,
  position: Position,
  width: number,
  height: number,
  fontSize: number,
  margin: number,
  textColor: string,
  fontName: string,
  fontFamily: FontFamily,
  options: StampOptions = {}
): void {
  const layout = computeStampLayout(ctx, {
    text,
    position,
    width,
    height,
    fontSize,
    margin,
    fontName,
    fontFamily,
  });

  const rng = mulberry32(
    hashString(`${text}|${position}|${fontFamily}|${textColor}|${fontSize}|${width}x${height}`)
  );

  const inkHex = toInkColor(textColor);
  const ink = hexToRgb(inkHex);
  const inkStyle = `rgb(${ink.r}, ${ink.g}, ${ink.b})`;

  const bleed = fontSize * RENDER.bleed;
  const outerW = layout.frameWidth + layout.border;
  const outerH = layout.frameHeight + layout.border;
  const canvas = new Canvas(Math.ceil(outerW + bleed * 2), Math.ceil(outerH + bleed * 2));
  const off = canvas.getContext("2d");

  // オフスクリーン内での枠（中心線）の左上。
  const fx = bleed + layout.border / 2;
  const fy = bleed + layout.border / 2;

  off.strokeStyle = inkStyle;
  off.fillStyle = inkStyle;
  off.lineWidth = layout.border;
  off.lineJoin = "miter";
  off.lineCap = "butt";
  traceFrame(
    off,
    fx,
    fy,
    layout.frameWidth,
    layout.frameHeight,
    fontSize * RENDER.cornerRadius,
    makeCyclicNoise(rng, 8),
    fontSize * RENDER.frameWobble
  );
  off.stroke();

  drawChars(
    off,
    layout,
    fx + (layout.contentX - layout.frameX),
    fy + (layout.contentY - layout.frameY),
    fontSize,
    fontName
  );

  applyInkMask(off, rng, bleed, bleed, outerW, outerH, layout.border);

  const centerX = layout.frameX + layout.frameWidth / 2;
  const centerY = layout.frameY + layout.frameHeight / 2;
  // 傾けない場合も角度は計算しておく（乱数の消費順を変えないため。同じ入力なら
  // 傾きの有無にかかわらずかすれが一致する）。
  const tilt = computeStampTilt(rng, layout, width, height);
  const appliedTilt = options.tilt === false ? 0 : tilt;

  const destX = layout.frameX - layout.border / 2 - bleed;
  const destY = layout.frameY - layout.border / 2 - bleed;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(appliedTilt);
  ctx.translate(-centerX, -centerY);

  // 可読性のためのハロー（反対色）。最下層に敷く。
  ctx.globalAlpha = RENDER.haloAlpha;
  ctx.filter = `blur(${Math.min(fontSize * RENDER.haloBlur, RENDER.maxHaloBlur)}px)`;
  ctx.drawImage(
    haloLayer(
      canvas,
      toHaloColor(inkHex),
      Math.min(fontSize * RENDER.haloRadius, RENDER.maxHaloRadius)
    ),
    destX,
    destY
  );

  // 朱肉のにじみ（輪郭の外へ薄く広がる）。
  ctx.globalAlpha = RENDER.bleedAlpha;
  ctx.filter = `blur(${Math.min(fontSize * RENDER.bleedBlur, RENDER.maxBleedBlur)}px)`;
  ctx.drawImage(canvas, destX, destY);
  ctx.filter = "none";

  ctx.globalAlpha = RENDER.inkAlpha;
  ctx.drawImage(canvas, destX, destY);
  ctx.restore();
}
