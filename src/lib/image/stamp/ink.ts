/**
 * かすれ（インクの乗りムラ）マスクの生成。
 *
 * 旧実装は「文字ごとにアルファを変える」かすれだったが、実物のかすれは文字の区切りと無関係な
 * 面のムラなので、字ごとに濃さが違うと「薄い字」にしか見えなかった。ここでは印影全体を覆う
 * ノイズを作り、描画側が destination-out で削る（＝インクが乗らなかった部分を抜く）。
 *
 * 返す RGBA の A が「削る量」。skia を使わない純粋計算なので単体テストできる。
 */

import { clamp, smoothstep } from "./rng";

export interface InkMaskOptions {
  /** マスクの解像度（印影の実サイズより小さくてよい。拡大時の補間がにじみとして働く）。 */
  width: number;
  height: number;
  /** ノイズの格子数（大きいほど細かい粒）。 */
  frequency: number;
  /** 重ねるオクターブ数。 */
  octaves: number;
  /** かすれの量。0 でかすれ無し、1 で大きく抜ける。 */
  strength: number;
  /**
   * 抜けの境界のなだらかさ。大きいほど「じわっと薄くなる」、小さいほど輪郭がはっきり抜ける。
   * 大きすぎると1箇所あたりの滲みが広がりすぎて印影全体がぼやける。
   */
  softness: number;
  /** 押し圧の傾き方向（ラジアン）。この向きの先ほどインクが薄くなる。 */
  pressureAngle: number;
  /** 押し圧の偏りの強さ。 */
  pressureAmount: number;
  /** 外周（枠線が来る帯）で余分に削る量。当たりの弱い縁が欠ける再現。 */
  edgeBoost: number;
  /** 外周とみなす帯の幅（0..0.5 の正規化値）。マスクが正方形とは限らないので軸ごとに持つ。 */
  edgeBandX: number;
  edgeBandY: number;
  /** 紙の凹みで完全に抜ける点の数。 */
  pinholes: number;
}

/** 格子点の乱数テーブル。 */
function makeLattice(rng: () => number, cells: number): Float32Array {
  const size = (cells + 1) * (cells + 1);
  const lattice = new Float32Array(size);
  for (let i = 0; i < size; i++) lattice[i] = rng();
  return lattice;
}

/** 2D value noise。u,v は 0..1。 */
function sampleLattice(lattice: Float32Array, cells: number, u: number, v: number): number {
  const x = u * cells;
  const y = v * cells;
  const x0 = Math.min(Math.floor(x), cells - 1);
  const y0 = Math.min(Math.floor(y), cells - 1);
  const tx = smoothstep(0, 1, x - x0);
  const ty = smoothstep(0, 1, y - y0);
  const stride = cells + 1;
  const v00 = lattice[y0 * stride + x0];
  const v10 = lattice[y0 * stride + x0 + 1];
  const v01 = lattice[(y0 + 1) * stride + x0];
  const v11 = lattice[(y0 + 1) * stride + x0 + 1];
  return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
}

interface Pinhole {
  x: number;
  y: number;
  r: number;
}

/**
 * かすれマスクを作る。返り値は width*height*4 の RGBA（RGB=0・A=削る量）。
 */
export function createInkMask(rng: () => number, opts: InkMaskOptions): Uint8ClampedArray {
  const { width, height, octaves, strength, pressureAngle, pressureAmount, edgeBoost } = opts;
  const { edgeBandX, edgeBandY, softness } = opts;

  // オクターブごとに独立した格子を持つ（同じ格子を周波数だけ変えて使うと相関が出て縞になる）。
  const lattices: { lattice: Float32Array; cells: number; amp: number }[] = [];
  let cells = Math.max(2, Math.round(opts.frequency));
  let amp = 1;
  let ampSum = 0;
  for (let o = 0; o < octaves; o++) {
    lattices.push({ lattice: makeLattice(rng, cells), cells, amp });
    ampSum += amp;
    cells = Math.round(cells * 2.2);
    amp *= 0.55;
  }

  const pinholes: Pinhole[] = [];
  for (let i = 0; i < opts.pinholes; i++) {
    pinholes.push({ x: rng(), y: rng(), r: 0.01 + rng() * 0.025 });
  }

  const dirX = Math.cos(pressureAngle);
  const dirY = Math.sin(pressureAngle);

  // かすれは連続的なグラデーションではなく「乗る／乗らない」に近い。閾値を切って
  // 大半は削らず一部だけ強く抜くことで、薄い字ではなくかすれに見せる。
  const threshold = 1 - strength;

  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const v = height === 1 ? 0.5 : y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = width === 1 ? 0.5 : x / (width - 1);

      let noise = 0;
      for (const octave of lattices) {
        noise += octave.amp * sampleLattice(octave.lattice, octave.cells, u, v);
      }
      noise /= ampSum;

      // 押し圧: 傾いた面で押すと片側だけインクが薄くなる。
      const pressure = (dirX * (u - 0.5) + dirY * (v - 0.5) + 0.5) * pressureAmount;

      // 外周の帯（枠線が乗る位置）は当たりが弱く欠けやすい。
      const edgeX = edgeBandX > 0 ? 1 - smoothstep(0, edgeBandX, Math.min(u, 1 - u)) : 0;
      const edgeY = edgeBandY > 0 ? 1 - smoothstep(0, edgeBandY, Math.min(v, 1 - v)) : 0;
      const edge = Math.max(edgeX, edgeY) * edgeBoost;

      let cut = smoothstep(threshold, threshold + softness, 1 - noise + pressure + edge);

      for (const hole of pinholes) {
        const d = Math.hypot(u - hole.x, v - hole.y);
        if (d < hole.r) cut = Math.max(cut, 1 - smoothstep(hole.r * 0.4, hole.r, d));
      }

      data[(y * width + x) * 4 + 3] = Math.round(clamp(cut, 0, 1) * 255);
    }
  }
  return data;
}

/** マスクの平均削り量（0..1）。テストと調整用。 */
export function averageCut(mask: Uint8ClampedArray): number {
  let sum = 0;
  const count = mask.length / 4;
  for (let i = 3; i < mask.length; i += 4) sum += mask[i];
  return sum / count / 255;
}
