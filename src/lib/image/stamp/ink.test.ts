import { describe, it, expect } from "vitest";
import { createInkMask, averageCut, type InkMaskOptions } from "./ink";
import { mulberry32 } from "./rng";

const BASE: InkMaskOptions = {
  width: 64,
  height: 64,
  frequency: 6,
  octaves: 2,
  strength: 0.3,
  softness: 0.22,
  pressureAngle: 0,
  pressureAmount: 0,
  edgeBoost: 0,
  edgeBandX: 0,
  edgeBandY: 0,
  pinholes: 0,
};

function mask(overrides: Partial<InkMaskOptions> = {}, seed = 1) {
  return createInkMask(mulberry32(seed), { ...BASE, ...overrides });
}

/** 指定行の平均削り量。 */
function rowAverage(data: Uint8ClampedArray, width: number, y: number): number {
  let sum = 0;
  for (let x = 0; x < width; x++) sum += data[(y * width + x) * 4 + 3];
  return sum / width / 255;
}

/** 指定列の平均削り量。 */
function columnAverage(data: Uint8ClampedArray, width: number, height: number, x: number): number {
  let sum = 0;
  for (let y = 0; y < height; y++) sum += data[(y * width + x) * 4 + 3];
  return sum / height / 255;
}

describe("createInkMask", () => {
  it("RGBA で width*height 分のデータを返す", () => {
    const data = mask();
    expect(data.length).toBe(64 * 64 * 4);
  });

  it("削る量はアルファにだけ入る（RGB は 0）", () => {
    const data = mask();
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBe(0);
      expect(data[i + 1]).toBe(0);
      expect(data[i + 2]).toBe(0);
    }
  });

  it("同じ seed なら同じマスク（プレビューと投稿結果が一致する前提）", () => {
    expect(Array.from(mask({}, 42))).toEqual(Array.from(mask({}, 42)));
  });

  it("seed が違えばマスクも違う", () => {
    expect(Array.from(mask({}, 1))).not.toEqual(Array.from(mask({}, 2)));
  });

  it("strength を上げるほど削る量が増える", () => {
    const weak = averageCut(mask({ strength: 0.1 }));
    const mid = averageCut(mask({ strength: 0.35 }));
    const strong = averageCut(mask({ strength: 0.7 }));
    expect(weak).toBeLessThan(mid);
    expect(mid).toBeLessThan(strong);
  });

  it("strength=0 ならほとんど削らない（かすれ無し）", () => {
    expect(averageCut(mask({ strength: 0 }))).toBeLessThan(0.02);
  });

  it("かすれは一部に集中する（全体が薄くなるのではない）", () => {
    const data = mask({ strength: 0.34 });
    let untouched = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] === 0) untouched++;
    // 大半の画素は削られず濃いまま＝「薄い印影」ではなく「かすれた印影」になる。
    expect(untouched / (data.length / 4)).toBeGreaterThan(0.5);
  });

  it("押し圧の傾きで指定方向が薄くなる", () => {
    // angle=0 は +x 方向へ圧が抜ける＝右ほど削られる。
    const data = mask({ pressureAmount: 0.5, pressureAngle: 0 });
    expect(columnAverage(data, 64, 64, 60)).toBeGreaterThan(columnAverage(data, 64, 64, 3));

    // angle=PI/2 は +y 方向。
    const vertical = mask({ pressureAmount: 0.5, pressureAngle: Math.PI / 2 });
    expect(rowAverage(vertical, 64, 60)).toBeGreaterThan(rowAverage(vertical, 64, 3));
  });

  it("edgeBoost で外周のほうが中央より削られる（縁が欠ける）", () => {
    const data = mask({ edgeBoost: 0.4, edgeBandX: 0.15, edgeBandY: 0.15 });
    expect(rowAverage(data, 64, 0)).toBeGreaterThan(rowAverage(data, 64, 32));
    expect(columnAverage(data, 64, 64, 0)).toBeGreaterThan(columnAverage(data, 64, 64, 32));
  });

  it("外周の帯は軸ごとに独立（縦横比が違うマスクでも枠の幅に合わせられる）", () => {
    // 横方向にだけ帯を持たせたら、左右の縁は削られ、上下の縁は帯なしと同じ。
    const onlyX = mask({ edgeBoost: 0.4, edgeBandX: 0.15, edgeBandY: 0 });
    const none = mask({ edgeBoost: 0.4, edgeBandX: 0, edgeBandY: 0 });
    expect(columnAverage(onlyX, 64, 64, 0)).toBeGreaterThan(columnAverage(none, 64, 64, 0));
    // 上端の中央（左右の帯から離れた画素）は帯なしと一致する。
    const centerTop = (0 * 64 + 32) * 4 + 3;
    expect(onlyX[centerTop]).toBe(none[centerTop]);
  });

  it("softness が小さいほど抜けの境界がはっきりする（中間調の画素が減る）", () => {
    const halftones = (data: Uint8ClampedArray) => {
      let count = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 20 && data[i] < 235) count++;
      return count;
    };
    expect(halftones(mask({ softness: 0.05 }))).toBeLessThan(halftones(mask({ softness: 0.4 })));
  });

  it("pinholes は完全に抜ける点を作る", () => {
    const withHoles = mask({ strength: 0.05, pinholes: 6 });
    let full = 0;
    for (let i = 3; i < withHoles.length; i += 4) if (withHoles[i] === 255) full++;
    expect(full).toBeGreaterThan(0);
  });

  it("幅・高さが 1 でもゼロ除算しない", () => {
    expect(() => createInkMask(mulberry32(1), { ...BASE, width: 1, height: 1 })).not.toThrow();
  });
});
