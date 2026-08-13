import { describe, it, expect } from "vitest";
import { hashString, mulberry32, triangular, clamp, smoothstep } from "./rng";

describe("hashString", () => {
  it("同じ文字列は同じ値（＝同じ入力なら同じ印影）", () => {
    expect(hashString("こんにちは")).toBe(hashString("こんにちは"));
  });

  it("1文字違えば別の値になる", () => {
    expect(hashString("こんにちは")).not.toBe(hashString("こんにちわ"));
  });

  it("32bit 符号なしの範囲に収まる", () => {
    for (const s of ["", "a", "画像文字入れ", "x".repeat(500)]) {
      const h = hashString(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe("mulberry32", () => {
  it("同じ seed なら同じ列を返す", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    expect(Array.from({ length: 10 }, () => a())).toEqual(
      Array.from({ length: 10 }, () => b())
    );
  });

  it("seed が違えば列も違う", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it("値は 0 以上 1 未満", () => {
    const rng = mulberry32(hashString("ハンコ"));
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("triangular", () => {
  it("±1 の範囲で 0 に寄る（一様分布より外側が薄い）", () => {
    const rng = mulberry32(7);
    let outer = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) {
      const v = triangular(rng);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
      if (Math.abs(v) > 0.5) outer++;
    }
    // 一様分布なら 50% が |v|>0.5。三角分布では 25%。
    expect(outer / N).toBeLessThan(0.35);
  });
});

describe("clamp", () => {
  it("範囲内はそのまま・範囲外は端に丸める", () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(-3, 0, 1)).toBe(0);
    expect(clamp(9, 0, 1)).toBe(1);
  });
});

describe("smoothstep", () => {
  it("端は 0/1・中央は 0.5", () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 10);
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });

  it("単調増加", () => {
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const v = smoothstep(0.2, 0.8, i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("edge0 === edge1 のときは階段になる（ゼロ除算しない）", () => {
    expect(smoothstep(0.5, 0.5, 0.4)).toBe(0);
    expect(smoothstep(0.5, 0.5, 0.6)).toBe(1);
  });
});
