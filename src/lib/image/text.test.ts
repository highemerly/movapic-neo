import { describe, it, expect } from "vitest";
import type { CanvasRenderingContext2D } from "skia-canvas";
import {
  calculateFontSize,
  isHalfWidthChar,
  hexToRgb,
  fontStack,
  getMonospaceCharWidth,
  splitTextIntoLines,
  splitTextIntoColumns,
} from "./text";
import { STROKE_COLORS, SIZE_MULTIPLIERS } from "@/types";

/**
 * splitTextIntoLines / getMonospaceCharWidth は ctx.measureText しか使わないため、
 * 幅を決め打ちできる偽 ctx を渡せば skia-canvas 無しで折り返しロジックを検証できる。
 */
function fakeCtx(measure: (char: string) => number): CanvasRenderingContext2D {
  return {
    measureText: (char: string) => ({ width: measure(char) }),
  } as unknown as CanvasRenderingContext2D;
}

describe("calculateFontSize", () => {
  it("短辺 / 14 * 係数（medium=1.0）を基準にする", () => {
    // min(1400,1400)/14 = 100
    expect(calculateFontSize(1400, 1400, "top", "medium")).toBe(100);
    expect(calculateFontSize(1400, 1400, "top", "small")).toBe(75); // floor(100*0.75)
    expect(calculateFontSize(1400, 1400, "top", "large")).toBe(140); // floor(100*1.4)
    expect(calculateFontSize(1400, 1400, "top", "extra-large")).toBe(235); // floor(100*2.35)
  });

  it("長辺ではなく短辺基準（横長でも縦の短辺で決まる）", () => {
    // min(2000,140)=140 → base floor(140/14)=10 → medium=10 → 下限14
    expect(calculateFontSize(2000, 140, "top", "medium")).toBe(14);
    // 縦横入れ替えても同じ
    expect(calculateFontSize(140, 2000, "top", "medium")).toBe(14);
  });

  it("下限14pxでクランプ（極小画像）", () => {
    // min(100,100)/14 = 7 → small floor(7*0.75)=5 → 14
    expect(calculateFontSize(100, 100, "top", "small")).toBe(14);
  });

  it("上限500pxでクランプ（極大画像）", () => {
    // min(10000,10000)/14 = 714 → extra-large floor(714*2.35)=1677 → 500
    expect(calculateFontSize(10000, 10000, "top", "extra-large")).toBe(500);
  });

  it("position は結果に影響しない（横書き/縦書きで同一）", () => {
    for (const size of ["small", "medium", "large", "extra-large"] as const) {
      const top = calculateFontSize(1200, 900, "top", size);
      expect(calculateFontSize(1200, 900, "bottom", size)).toBe(top);
      expect(calculateFontSize(1200, 900, "left", size)).toBe(top);
      expect(calculateFontSize(1200, 900, "right", size)).toBe(top);
    }
  });

  it("SIZE_MULTIPLIERS の係数（小0.75/中1.0/大1.4/特大2.35）を反映する", () => {
    expect(SIZE_MULTIPLIERS).toEqual({
      small: 0.75,
      medium: 1.0,
      large: 1.4,
      "extra-large": 2.35,
    });
  });
});

describe("isHalfWidthChar", () => {
  it("ASCII（英数字・記号）は半角", () => {
    for (const c of ["A", "z", "0", "9", "!", "~", " "]) {
      expect(isHalfWidthChar(c)).toBe(true);
    }
  });

  it("半角カタカナは半角", () => {
    expect(isHalfWidthChar("ｱ")).toBe(true); // U+FF71
    expect(isHalfWidthChar("ﾝ")).toBe(true); // U+FF9D
  });

  it("全角（かな・漢字・全角英数・全角記号）は半角ではない", () => {
    for (const c of ["あ", "漢", "Ａ", "１", "（", "。", "😀"]) {
      expect(isHalfWidthChar(c)).toBe(false);
    }
  });
});

describe("hexToRgb", () => {
  it("#付き6桁を変換する", () => {
    expect(hexToRgb("#FF0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb("#00FF00")).toEqual({ r: 0, g: 255, b: 0 });
  });

  it("#無し・小文字も許容する", () => {
    expect(hexToRgb("0000ff")).toEqual({ r: 0, g: 0, b: 255 });
  });

  it("不正な入力は白にフォールバックする", () => {
    expect(hexToRgb("#FFF")).toEqual({ r: 255, g: 255, b: 255 }); // 3桁は不正扱い
    expect(hexToRgb("nope")).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb("")).toEqual({ r: 255, g: 255, b: 255 });
  });
});

describe("fontStack", () => {
  it("本文フォント＋末尾に絵文字フォントを並べる", () => {
    expect(fontStack(48, "HuiFont")).toBe('48px "HuiFont", "Noto Emoji"');
  });
});

describe("getMonospaceCharWidth", () => {
  const ctx = fakeCtx(() => 99); // 絵文字の実測送り幅を99に固定

  it("半角は fontSize*0.5、全角は fontSize", () => {
    expect(getMonospaceCharWidth(ctx, "A", 20)).toBe(10);
    expect(getMonospaceCharWidth(ctx, "あ", 20)).toBe(20);
  });

  it("絵文字は measureText の実測値を使う", () => {
    expect(getMonospaceCharWidth(ctx, "😀", 20)).toBe(99);
  });
});

describe("splitTextIntoLines", () => {
  it("プロポーショナル: 累積幅が maxWidth を超えたら改行", () => {
    // 各文字10px、maxWidth=25
    const ctx = fakeCtx(() => 10);
    const lines = splitTextIntoLines(ctx, "abcde", 25, true, 20);
    expect(lines).toEqual(["ab", "cd", "e"]);
  });

  it("等幅（半角対応）: 半角0.5幅・全角1.0幅で改行判定", () => {
    // fontSize=20 → 全角20px/半角10px、maxWidth=40
    const ctx = fakeCtx(() => 0); // 非絵文字は measureText を使わない
    expect(splitTextIntoLines(ctx, "ＡＢＣ", 40, false, 20, true)).toEqual(["ＡＢ", "Ｃ"]);
    expect(splitTextIntoLines(ctx, "abcd", 25, false, 20, true)).toEqual(["ab", "cd"]);
  });

  it("等幅（半角非対応）: 固定文字数 floor(maxWidth/fontSize) で分割", () => {
    const ctx = fakeCtx(() => 0);
    // fontSize=20, maxWidth=50 → 2文字/行
    expect(splitTextIntoLines(ctx, "abcde", 50, false, 20)).toEqual(["ab", "cd", "e"]);
  });

  it("等幅（半角非対応）: maxWidth < fontSize でも最低1文字/行", () => {
    const ctx = fakeCtx(() => 0);
    expect(splitTextIntoLines(ctx, "abc", 5, false, 20)).toEqual(["a", "b", "c"]);
  });

  it("改行を段落として保持し、空行は空文字列で残す", () => {
    const ctx = fakeCtx(() => 10);
    expect(splitTextIntoLines(ctx, "a\n\nb", 100, true, 20)).toEqual(["a", "", "b"]);
  });
});

describe("splitTextIntoColumns（縦書き列送り）", () => {
  it("charsPerColumn ごとに列へ割り、余りは最終列へ", () => {
    const cols = splitTextIntoColumns("あいうえお", 2, false);
    expect(cols.map((c) => c.map((ci) => ci.char).join(""))).toEqual(["あい", "うえ", "お"]);
  });

  it("段落（\\n）ごとに列を分ける・空段落は空列を生む", () => {
    const cols = splitTextIntoColumns("あ\n\nい", 5, false);
    expect(cols.map((c) => c.map((ci) => ci.char).join(""))).toEqual(["あ", "", "い"]);
  });

  it("括弧・長音は回転対象、句読点は句読点フラグ", () => {
    const [col] = splitTextIntoColumns("（ー。", 10, false);
    const byChar = Object.fromEntries(col.map((ci) => [ci.char, ci]));
    expect(byChar["（"].shouldRotate).toBe(true);
    expect(byChar["ー"].shouldRotate).toBe(true);
    expect(byChar["。"].isPunctuation).toBe(true);
    expect(byChar["。"].shouldRotate).toBe(false);
  });

  it("等幅フォント時のみ半角文字に isHalf が立つ（絵文字・全角は対象外）", () => {
    const half = splitTextIntoColumns("Aあ😀", 10, true)[0];
    const byChar = Object.fromEntries(half.map((ci) => [ci.char, ci]));
    expect(byChar["A"].isHalf).toBe(true);
    expect(byChar["あ"].isHalf).toBe(false);
    expect(byChar["😀"].isHalf).toBe(false);

    // useHalfWidth=false なら半角でも isHalf は立たない
    const noHalf = splitTextIntoColumns("A", 10, false)[0];
    expect(noHalf[0].isHalf).toBe(false);
  });
});

describe("STROKE_COLORS（影の色ルール: 薄い色→黒影 / 濃い色→白影）", () => {
  it("薄い色は黒影(#000000)", () => {
    for (const c of ["white", "green", "yellow", "pink", "orange"] as const) {
      expect(STROKE_COLORS[c]).toBe("#000000");
    }
  });

  it("濃い色は白影(#FFFFFF)", () => {
    for (const c of ["red", "blue", "brown"] as const) {
      expect(STROKE_COLORS[c]).toBe("#FFFFFF");
    }
  });
});
