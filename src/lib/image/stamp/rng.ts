/**
 * ハンコ描画用の決定的な擬似乱数。
 *
 * Math.random() を直に使うと同じ入力でも押すたび印影が変わり、ゴールデンテストに載せられない
 * （旧実装はこれで stamp だけテスト対象外だった）。入力（文字列・寸法・色など）から seed を導出し、
 * 「入力が同じなら同じ印影／入力が違えば別の印影」にする。
 */

/** FNV-1a (32bit)。文字列から seed を作る。 */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    // FNV prime (16777619) の乗算。32bit に収めるため Math.imul を使う。
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32。周期・分布ともにこの用途には十分で、実装が短く移植性がある。 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 三角分布（0中心・±1）。一様乱数より 0 付近に寄るので、傾きなど「基本はまっすぐ」の揺らぎ向き。 */
export function triangular(rng: () => number): number {
  return rng() + rng() - 1;
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/** Hermite 補間。ノイズの格子間を滑らかにつなぐ（線形だと格子が縞として見える）。 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
