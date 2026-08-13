import { describe, it, expect } from "vitest";
import { toInkColor, toHaloColor } from "./color";
import { COLORS, type Color } from "@/types";

/** HEX → HSL（検証用。実装とは別経路で計算する）。 */
function hsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)!;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

describe("toInkColor", () => {
  it("無彩色（白）はそのまま（選んだ色と出力を食い違わせない）", () => {
    expect(toInkColor("#FFFFFF")).toBe("#FFFFFF");
    expect(toInkColor("#000000")).toBe("#000000");
  });

  it("色相は保つ", () => {
    for (const key of ["red", "blue", "green", "yellow", "brown", "pink", "orange"] as Color[]) {
      const before = hsl(COLORS[key]);
      const after = hsl(toInkColor(COLORS[key]));
      expect(after.h).toBeCloseTo(before.h, 2);
    }
  });

  it("有彩色はどれも印肉として成立する彩度・明度に収まる", () => {
    // 8bit への量子化で 1/255 ぶん外れうるので、その分だけ許容する。
    const q = 1 / 255;
    for (const key of (Object.keys(COLORS) as Color[]).filter((k) => hsl(COLORS[k]).s > 0)) {
      const { s, l } = hsl(toInkColor(COLORS[key]));
      expect(s).toBeGreaterThanOrEqual(0.8 - q);
      expect(l).toBeGreaterThanOrEqual(0.33 - q);
      expect(l).toBeLessThanOrEqual(0.45 + q);
    }
  });

  it("明るすぎる色（黄・桃）は暗く落とされる", () => {
    expect(hsl(toInkColor(COLORS.yellow)).l).toBeLessThan(hsl(COLORS.yellow).l);
    expect(hsl(toInkColor(COLORS.pink)).l).toBeLessThan(hsl(COLORS.pink).l);
  });

  it("暗すぎる色（茶）は持ち上げられる", () => {
    expect(hsl(toInkColor(COLORS.brown)).l).toBeGreaterThan(hsl(COLORS.brown).l);
  });

  it("不正な HEX は朱肉色にフォールバック", () => {
    expect(toInkColor("rgb(1,2,3)")).toBe("#C8102E");
    expect(toInkColor("#FFF")).toBe("#C8102E");
  });

  it("同じ入力なら同じ出力", () => {
    expect(toInkColor(COLORS.green)).toBe(toInkColor(COLORS.green));
  });
});

describe("toHaloColor", () => {
  it("明るいインクには黒・暗いインクには白", () => {
    expect(toHaloColor("#FFFFFF")).toBe("#000000");
    expect(toHaloColor("#000000")).toBe("#FFFFFF");
  });

  it("判定は色名ではなく実際の輝度で行う", () => {
    // 印肉化しても黄・緑・橙は輝度が高いまま＝黒のハロー。
    for (const key of ["yellow", "green", "orange"] as Color[]) {
      expect(toHaloColor(toInkColor(COLORS[key]))).toBe("#000000");
    }
    // 赤・青・茶・桃は暗い＝白のハロー。
    for (const key of ["red", "blue", "brown", "pink"] as Color[]) {
      expect(toHaloColor(toInkColor(COLORS[key]))).toBe("#FFFFFF");
    }
  });

  it("全色でインクとハローの輝度差が十分にある", () => {
    for (const key of Object.keys(COLORS) as Color[]) {
      const ink = toInkColor(COLORS[key]);
      const halo = toHaloColor(ink);
      const l = (hex: string) => {
        const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)!;
        const c = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255);
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      expect(Math.abs(l(ink) - l(halo))).toBeGreaterThan(0.3);
    }
  });

  it("不正な HEX でも色を返す", () => {
    expect(toHaloColor("not-a-color")).toBe("#000000");
  });
});
