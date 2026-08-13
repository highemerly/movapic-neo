import { describe, it, expect } from "vitest";
import { TILT, tiltScaleForSize, limitTilt, computeStampTilt } from "./tilt";
import { mulberry32 } from "./rng";
import type { StampLayout } from "./layout";

const IMAGE = 1000;

/** 傾きの計算が見るのは枠の位置・大きさだけなので、そこだけ持つ layout を作る。 */
function layoutOf(frameWidth: number, frameHeight: number, margin = 50): StampLayout {
  const border = 10;
  return {
    frameX: margin + border / 2,
    frameY: margin + border / 2,
    frameWidth,
    frameHeight,
    border,
  } as StampLayout;
}

const deg = (rad: number) => (rad * 180) / Math.PI;

describe("tiltScaleForSize", () => {
  it("小さい印はそのまま（倍率1）", () => {
    expect(tiltScaleForSize(layoutOf(200, 120), IMAGE, IMAGE)).toBe(1);
  });

  it("画像いっぱいの印は最小倍率まで縮む", () => {
    expect(tiltScaleForSize(layoutOf(900, 200), IMAGE, IMAGE)).toBeCloseTo(TILT.minScale, 5);
  });

  it("間は単調に小さくなる", () => {
    let prev = Infinity;
    for (let w = 200; w <= 900; w += 100) {
      const scale = tiltScaleForSize(layoutOf(w, 120), IMAGE, IMAGE);
      expect(scale).toBeLessThanOrEqual(prev);
      prev = scale;
    }
  });

  it("基準は長辺（縦に長い印も横に長い印と同じだけ抑えられる）", () => {
    const wide = tiltScaleForSize(layoutOf(800, 120), IMAGE, IMAGE);
    const tall = tiltScaleForSize(layoutOf(120, 800), IMAGE, IMAGE);
    expect(tall).toBeCloseTo(wide, 5);
  });

  it("割合は画像の対応する辺に対して見る（縦長画像で縦長の印は伸びた分だけ緩む）", () => {
    const square = tiltScaleForSize(layoutOf(120, 800), IMAGE, IMAGE);
    const portrait = tiltScaleForSize(layoutOf(120, 800), IMAGE, IMAGE * 2);
    expect(portrait).toBeGreaterThan(square);
  });
});

describe("limitTilt", () => {
  it("余白に収まる角度はそのまま通す", () => {
    expect(limitTilt(-0.01, layoutOf(200, 120), IMAGE, IMAGE)).toBeCloseTo(-0.01, 10);
  });

  it("はみ出す角度は制限される", () => {
    // 画像いっぱいの枠は少ししか倒せない。
    const limited = limitTilt(-0.5, layoutOf(880, 880, 50), IMAGE, IMAGE);
    expect(Math.abs(limited)).toBeLessThan(0.5);
    expect(limited).toBeLessThan(0); // 向きは保つ
  });

  it("余白が無ければ傾けない", () => {
    const flush = { ...layoutOf(1000, 1000, 0), frameX: 0, frameY: 0 } as StampLayout;
    expect(Math.abs(limitTilt(-0.5, flush, IMAGE, IMAGE))).toBe(0);
  });
});

describe("computeStampTilt", () => {
  it("常に右肩上がり（canvas 座標では負）", () => {
    for (let seed = 1; seed <= 50; seed++) {
      expect(computeStampTilt(mulberry32(seed), layoutOf(200, 120), IMAGE, IMAGE)).toBeLessThan(0);
    }
  });

  it("小さい印は下限〜上限の範囲に収まる", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const d = Math.abs(deg(computeStampTilt(mulberry32(seed), layoutOf(200, 120), IMAGE, IMAGE)));
      expect(d).toBeGreaterThanOrEqual(TILT.minDeg - 0.001);
      expect(d).toBeLessThanOrEqual(TILT.maxDeg + 0.001);
    }
  });

  it("必ずいくらか傾く（ほぼ水平が出ない）", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const d = Math.abs(deg(computeStampTilt(mulberry32(seed), layoutOf(200, 120), IMAGE, IMAGE)));
      expect(d).toBeGreaterThan(1);
    }
  });

  it("長い印ほど傾きが小さい", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const small = Math.abs(computeStampTilt(mulberry32(seed), layoutOf(200, 120), IMAGE, IMAGE));
      const long = Math.abs(computeStampTilt(mulberry32(seed), layoutOf(880, 120), IMAGE, IMAGE));
      expect(long).toBeLessThan(small);
    }
  });

  it("大きく傾くほど珍しい（角度は下限側に寄る）", () => {
    const mid = (TILT.minDeg + TILT.maxDeg) / 2;
    let above = 0;
    const N = 300;
    for (let seed = 1; seed <= N; seed++) {
      const d = Math.abs(deg(computeStampTilt(mulberry32(seed), layoutOf(200, 120), IMAGE, IMAGE)));
      if (d > mid) above++;
    }
    expect(above / N).toBeLessThan(0.35);
  });

  it("同じ seed・同じ印面なら同じ角度", () => {
    const a = computeStampTilt(mulberry32(7), layoutOf(200, 120), IMAGE, IMAGE);
    const b = computeStampTilt(mulberry32(7), layoutOf(200, 120), IMAGE, IMAGE);
    expect(a).toBe(b);
  });
});
