/**
 * 紅葉狩り（momiji）シーズンの装飾背景。decoration: "momiji"。
 * テキスト本体は overlay 側が「横書き（下）」で描く。ここは背景（紅葉の天蓋＋散り紅葉）を描く。
 *
 * デザイン（見上げた紅葉の天蓋）:
 * - 上辺の両隅から枝を差し込み、垂れ下がる紅葉で天蓋を作る。文字は下辺に置き、天蓋と離す
 *   （文字を天蓋の真下に置くと、上に装飾と文字が固まって写真の下半分が間延びして見えた）。
 * - 直前のハロウィンと橙で色が被らないよう、葉は深い紅〜朱を主役にし、橙・黄は少しだけ混ぜる。
 *   写真への色かぶりも上辺の天蓋の陰（暗い紅）だけにとどめ、写真の主役には掛けない。
 * - 天蓋はモミジだけ。天蓋と文字の間（中ほど）の左右にだけ、舞ってきたモミジとイチョウを
 *   数枚散らす（中央は空けて写真の主役を隠し、下辺の文字にも掛けない）。
 * - 枝の反り・葉の大きさ・向き・色は、文字列と寸法から導出した seed で決める。
 *   ハロウィンと同じく、同じ入力ならプレビューと投稿結果が一致する。
 * 数値は決め打ち。微調整はこのファイルで行う。
 */

import { CanvasRenderingContext2D } from "skia-canvas";
import { hashString, mulberry32 } from "../stamp/rng";

/** 天蓋（枝＋垂れた葉）の深さ。上の余白 margin からの fontSize 比。 */
const CANOPY_DEPTH_RATIO = 1.43;

type Rgb = [number, number, number];

/**
 * 天蓋の葉の色（重み付き）。深い紅・紅・朱が主役で、橙・黄葉は差し色。
 * 重みの合計に対する比が出現率になる。
 */
const CANOPY_PALETTE: { rgb: Rgb; weight: number }[] = [
  { rgb: [160, 16, 30], weight: 3 }, // 深紅
  { rgb: [200, 30, 28], weight: 4 }, // 紅
  { rgb: [222, 70, 30], weight: 2 }, // 朱
  { rgb: [230, 120, 36], weight: 1 }, // 橙（差し色）
  { rgb: [226, 170, 40], weight: 1 }, // 黄葉（差し色）
];

/** イチョウの黄（散り葉だけに使う）。 */
const GINKGO_RGB: Rgb = [236, 186, 42];

function pickColor(rng: () => number): Rgb {
  const total = CANOPY_PALETTE.reduce((s, c) => s + c.weight, 0);
  let x = rng() * total;
  for (const c of CANOPY_PALETTE) {
    x -= c.weight;
    if (x < 0) return c.rgb;
  }
  return CANOPY_PALETTE[0].rgb;
}

function rgba([r, g, b]: Rgb, a: number, k = 1): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgba(${c(r)}, ${c(g)}, ${c(b)}, ${a})`;
}

/**
 * 葉の中心寄りの明るい色（葉脈の付け根に光が透けた感じ）。
 * 緑を大きく足すと紅が橙に転び、天蓋全体が橙っぽくなる（＝ハロウィンと被る）ので控えめにする。
 */
function lighter([r, g, b]: Rgb): Rgb {
  return [Math.min(255, r + 28), Math.min(255, g + 22), Math.min(255, b + 12)];
}

/**
 * イロハモミジの葉の輪郭（半径1の単位座標・葉先が上・葉柄が下）。
 * 7つの裂片を深く切れ込ませ、縁に細かい鋸歯を付ける。
 * 角度は canvas の向き（y 下向き。270°=真上）。裂片は付け根から外側ほど短い。
 */
const MAPLE_LOBES: [number, number][] = [
  [130, 0.42],
  [172, 0.72],
  [222, 0.92],
  [270, 1.0],
  [318, 0.92],
  [368, 0.72],
  [410, 0.42],
];
/** 裂片の間の切れ込みの深さ（中心からの半径）。小さいほど深く裂ける。 */
const MAPLE_VALLEY_R = 0.34;
/** 葉柄の付け根（下側の、裂片の無い切れ込み）。 */
const MAPLE_STEM_VALLEY_R = 0.16;
/**
 * 裂片の「肩」（いちばん幅の広いところ）。軸に沿った位置と、軸から横への張り出し（ともに裂片の長さ比）。
 * 切れ込みから葉先へ直線で結ぶだけだと裂片が細い三角になり、星やトゲに見えてモミジに見えない。
 */
const MAPLE_SHOULDER_AT = 0.52;
const MAPLE_SHOULDER_W = 0.17;

function polar(deg: number, r: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

function lerp(p: [number, number], q: [number, number], t: number): [number, number] {
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
}

function maplePath(ctx: CanvasRenderingContext2D): void {
  const stemValley = polar(450, MAPLE_STEM_VALLEY_R); // 真下（90°）
  ctx.beginPath();
  ctx.moveTo(stemValley[0], stemValley[1]);
  for (let i = 0; i < MAPLE_LOBES.length; i++) {
    const [deg, len] = MAPLE_LOBES[i];
    const prev = i === 0 ? stemValley : polar((MAPLE_LOBES[i - 1][0] + deg) / 2, MAPLE_VALLEY_R);
    const next =
      i === MAPLE_LOBES.length - 1
        ? stemValley
        : polar((deg + MAPLE_LOBES[i + 1][0]) / 2, MAPLE_VALLEY_R);
    const tip = polar(deg, len);
    const axis = polar(deg, len * MAPLE_SHOULDER_AT);
    // 角度は時計回りに増える（y 下向き）ので、前の切れ込み側の横方向は deg-90。
    const sideP = polar(deg - 90, len * MAPLE_SHOULDER_W);
    const sideN = polar(deg + 90, len * MAPLE_SHOULDER_W);
    const shoulderP: [number, number] = [axis[0] + sideP[0], axis[1] + sideP[1]];
    const shoulderN: [number, number] = [axis[0] + sideN[0], axis[1] + sideN[1]];
    const teeth = (from: [number, number], to: [number, number], out: [number, number]) => {
      // 肩→葉先に鋸歯を3つ刻む（付け根側は滑らかなまま）。
      const k = 0.06 / MAPLE_SHOULDER_W; // 張り出しベクトル out を鋸歯の高さに縮める係数
      for (const t of [0.2, 0.45, 0.7]) {
        const tp = lerp(from, to, t + 0.1);
        ctx.lineTo(tp[0] + out[0] * k, tp[1] + out[1] * k);
        const b = lerp(from, to, t + 0.2);
        ctx.lineTo(b[0], b[1]);
      }
    };
    ctx.quadraticCurveTo(
      (prev[0] + shoulderP[0]) / 2 + sideP[0] * 0.3,
      (prev[1] + shoulderP[1]) / 2 + sideP[1] * 0.3,
      shoulderP[0],
      shoulderP[1]
    );
    teeth(shoulderP, tip, sideP);
    ctx.lineTo(tip[0], tip[1]);
    ctx.lineTo(...lerp(shoulderN, tip, 0.9));
    teeth(lerp(shoulderN, tip, 0.9), shoulderN, sideN);
    ctx.lineTo(shoulderN[0], shoulderN[1]);
    ctx.quadraticCurveTo(
      (next[0] + shoulderN[0]) / 2 + sideN[0] * 0.3,
      (next[1] + shoulderN[1]) / 2 + sideN[1] * 0.3,
      next[0],
      next[1]
    );
  }
  ctx.closePath();
}

/**
 * モミジ1枚。cx,cy=葉の中心、r=中心から葉先まで、rot=回転(rad。0=葉先が上)。
 * dim<1 で暗くする（枝の奥側の葉）。
 */
function drawMaple(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  rot: number,
  color: Rgb,
  dim = 1
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(r, r);

  // 葉柄（実の後ろ。先に描いて付け根を葉で隠す）。
  ctx.strokeStyle = rgba([110, 30, 20], 0.9, dim);
  ctx.lineWidth = 0.05;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0.1);
  ctx.quadraticCurveTo(0.02, 0.4, 0.1, 0.66);
  ctx.stroke();

  // 実。写真の上で浮いて見えるよう、暗い紅の淡い影を落とす（影は変換の影響を受けない＝px指定）。
  ctx.shadowColor = "rgba(40, 6, 4, 0.35)";
  ctx.shadowBlur = Math.max(1.5, r * 0.22);
  ctx.shadowOffsetY = Math.max(1, r * 0.06);
  const g = ctx.createRadialGradient(0, -0.05, 0.05, 0, 0, 1);
  g.addColorStop(0, rgba(lighter(color), 0.96, dim));
  g.addColorStop(1, rgba(color, 0.96, dim));
  ctx.fillStyle = g;
  maplePath(ctx);
  ctx.fill();
  ctx.shadowColor = "rgba(0, 0, 0, 0)";

  // 葉脈（付け根から各裂片の先へ）。
  ctx.strokeStyle = rgba([110, 14, 12], 0.32, dim);
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  for (const [deg, len] of MAPLE_LOBES) {
    const tip = polar(deg, len * 0.8);
    ctx.moveTo(0, 0.08);
    ctx.lineTo(tip[0], tip[1]);
  }
  ctx.stroke();

  ctx.restore();
}

/** イチョウ1枚（扇形・中央に切れ込み）。引数は drawMaple と同じ。 */
function drawGinkgo(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  rot: number
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(r, r);

  // 扇の要（葉柄の付け根）を (0, 0.5) に置き、半径1の扇を上へ開く＝全体が中心から半径1に収まる。
  const by = 0.5;
  const R = 1.0;
  const a0 = (-90 - 58) * (Math.PI / 180);
  const a1 = (-90 + 58) * (Math.PI / 180);
  const notchL = (-90 - 5) * (Math.PI / 180);
  const notchR = (-90 + 5) * (Math.PI / 180);

  ctx.strokeStyle = rgba([150, 110, 30], 0.9);
  ctx.lineWidth = 0.05;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, by);
  ctx.quadraticCurveTo(0.03, by + 0.25, 0.1, by + 0.45);
  ctx.stroke();

  ctx.shadowColor = "rgba(60, 40, 4, 0.35)";
  ctx.shadowBlur = Math.max(1.5, r * 0.22);
  ctx.shadowOffsetY = Math.max(1, r * 0.06);
  const g = ctx.createRadialGradient(0, by, 0.1, 0, by, R);
  g.addColorStop(0, rgba([250, 220, 110], 0.96));
  g.addColorStop(1, rgba(GINKGO_RGB, 0.96));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, by);
  ctx.arc(0, by, R, a0, notchL);
  ctx.lineTo(0, by - R * 0.62);
  ctx.arc(0, by, R, notchR, a1);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = "rgba(0, 0, 0, 0)";

  // 扇の筋。
  ctx.strokeStyle = rgba([170, 120, 20], 0.3);
  ctx.lineWidth = 0.025;
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const a = a0 + ((a1 - a0) * i) / 8;
    ctx.moveTo(0, by);
    ctx.lineTo(Math.cos(a) * R * 0.92, by + Math.sin(a) * R * 0.92);
  }
  ctx.stroke();

  ctx.restore();
}

type Pt = [number, number];

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const s = 1 - t;
  const a = s * s * s;
  const b = 3 * s * s * t;
  const c = 3 * s * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

/** 3次ベジェに沿って、根元 w0 から先 w1 へ細る枝を塗る。 */
function drawBranch(ctx: CanvasRenderingContext2D, pts: [Pt, Pt, Pt, Pt], w0: number, w1: number): void {
  const N = 32;
  const center: Pt[] = [];
  for (let i = 0; i <= N; i++) center.push(cubic(...pts, i / N));
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const a = center[Math.max(0, i - 1)];
    const b = center[Math.min(N, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const n = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * (i / N)) / 2;
    left.push([center[i][0] - (dy / n) * w, center[i][1] + (dx / n) * w]);
    right.push([center[i][0] + (dy / n) * w, center[i][1] - (dx / n) * w]);
  }
  ctx.save();
  ctx.fillStyle = "rgba(62, 36, 24, 0.92)";
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (const p of left.slice(1)) ctx.lineTo(p[0], p[1]);
  for (const p of right.reverse()) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

interface LeafSpec {
  x: number;
  y: number;
  r: number;
  rot: number;
  color: Rgb;
  back: boolean;
}

/** 紅葉狩り：上辺の天蓋の陰＋両隅から差す枝と垂れた紅葉＋中ほどの左右に散り葉。 */
export function drawMomiji(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  fontSize: number,
  margin: number
): void {
  const f = fontSize;
  const rng = mulberry32(hashString(`momiji:${width}x${height}:${text}`));
  // 天蓋の下端。枝・葉はすべてこの線より上に収める。
  const band = margin + f * CANOPY_DEPTH_RATIO;

  // 天蓋の陰。葉の色を浮かせつつ、写真の主役（中央より下）には掛けない。
  // 濃くすると青空の上で濁った藤色になるので薄く留める。
  ctx.save();
  const shade = ctx.createLinearGradient(0, 0, 0, band * 1.5);
  shade.addColorStop(0, "rgba(90, 20, 10, 0.26)");
  shade.addColorStop(1, "rgba(90, 20, 10, 0)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, band * 1.5);
  ctx.restore();

  // 枝。左右の隅の外から差し込み、たわみながら中央へ伸ばす。左右で届く長さと反りを変え、
  // 中央で両方の葉が重なる＝横長の写真でも天蓋が途切れない。
  const branches: [Pt, Pt, Pt, Pt][] = [];
  for (const side of [-1, 1]) {
    const reach = width * (0.52 + rng() * 0.12);
    const sx = side < 0 ? -f * 0.4 : width + f * 0.4;
    const ex = side < 0 ? reach : width - reach;
    const dir = -side; // 伸びる向き（左の枝は右へ）
    branches.push([
      [sx, band * (0.08 + rng() * 0.1)],
      [sx + dir * reach * 0.35, band * (0.0 + rng() * 0.1)],
      [sx + dir * reach * 0.7, band * (0.4 + rng() * 0.15)],
      [ex, band * (0.3 + rng() * 0.15)],
    ]);
  }

  const leaves: LeafSpec[] = [];
  const addLeaf = (px: number, py: number, spreadX: number, sizeK = 1) => {
    const r = f * (0.42 + rng() * 0.3) * sizeK;
    const x = px + (rng() - 0.5) * spreadX;
    // 枝から垂れる＝基本は枝より下。天蓋の下端（band）まで垂らして厚みを出す。
    // 上辺で葉が切れるのは自然なので上方向は制限しない。
    const y = Math.min(py + f * (-0.1 + rng() * 1.1), band - r * 0.95);
    if (x < -r || x > width + r) return;
    leaves.push({
      x,
      y,
      r,
      // π=葉先が下（葉柄が上＝枝からぶら下がる向き）。揺らぎを大きめにして揃いすぎを避ける。
      rot: Math.PI + (rng() - 0.5) * 1.3,
      color: pickColor(rng),
      back: rng() < 0.35,
    });
  };

  for (const b of branches) {
    // 弧長を粗く測り、葉の間隔が画像サイズによらず文字サイズ比で一定になるよう t の刻みを決める。
    let len = 0;
    let prev = b[0];
    for (let i = 1; i <= 16; i++) {
      const p = cubic(...b, i / 16);
      len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      prev = p;
    }
    const step = Math.max(0.02, (f * 0.5) / len);
    for (let t = 0.06; t <= 1; t += step) {
      const [px, py] = cubic(...b, t);
      const n = rng() < 0.5 ? 1 : 2;
      for (let k = 0; k < n; k++) addLeaf(px, py, f * 0.6);
    }
    // 枝先は房にして、枝がぷつりと終わって見えないようにする。
    const tip = b[3];
    for (let k = 0; k < 3; k++) addLeaf(tip[0], tip[1], f * 0.9, 0.9);
  }

  // 奥の葉 → 枝 → 手前の葉 の順に重ねて、枝が葉の間をくぐって見えるようにする。
  for (const l of leaves) if (l.back) drawMaple(ctx, l.x, l.y, l.r, l.rot, l.color, 0.78);
  for (const b of branches) drawBranch(ctx, b, f * 0.3, f * 0.06);
  for (const l of leaves) if (!l.back) drawMaple(ctx, l.x, l.y, l.r, l.rot, l.color);

  // 散り葉（天蓋と文字の間＝中ほどの左右の端だけ）。中央は空けて写真の主役を隠さない。
  // 下限を高さの6割で切るのは、下辺の文字（3行ほどまで）に掛けないため。
  // 横幅は画像比でなく文字サイズ比で決める（画像比だと横長の写真で中央まで広がる）。
  const count = 3 + Math.floor(rng() * 3); // 3〜5枚
  const zoneW = Math.min(f * 3.2, width * 0.3);
  const top = band + f * 0.4;
  const bottom = Math.max(top, height * 0.6);
  const placed: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < count; i++) {
    const r = f * (0.3 + rng() * 0.18);
    const leftSide = i % 2 === 0;
    let x = 0;
    let y = 0;
    // 先に置いた葉と重なったら数回引き直す（重なると1つの塊に見える）。
    for (let tries = 0; tries < 8; tries++) {
      const off = margin * 0.5 + r + rng() * Math.max(0, zoneW - r * 2);
      x = leftSide ? off : width - off;
      y = top + rng() * (bottom - top);
      const overlaps = placed.some((p) => Math.hypot(p.x - x, p.y - y) < (p.r + r) * 1.1);
      if (!overlaps) break;
    }
    placed.push({ x, y, r });
    const rot = rng() * Math.PI * 2;
    if (rng() < 0.35) drawGinkgo(ctx, x, y, r, rot);
    else drawMaple(ctx, x, y, r, rot, pickColor(rng));
  }
}
