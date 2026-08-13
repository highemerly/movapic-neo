import { describe, it, expect } from "vitest";
import type { CanvasRenderingContext2D } from "skia-canvas";
import { computeStampLayout, STAMP_GEOM, type StampLayoutInput } from "./layout";

/** 実測（skia）での絵文字の送り幅は全角の約1.27倍。偽 ctx でも同じ比率を再現する。 */
const EMOJI_ADVANCE_RATIO = 1.27;

/**
 * 全角固定幅の偽 ctx（text.test.ts と同じ手法）。
 * レイアウトは measureText と font しか触らないので skia 無しで検証できる。
 */
function fakeCtx(charWidth: number): CanvasRenderingContext2D {
  const ctx = {
    font: "",
    measureText: (text: string) => ({
      width: [...text].reduce(
        (width, char) =>
          width + charWidth * (/\p{Extended_Pictographic}/u.test(char) ? EMOJI_ADVANCE_RATIO : 1),
        0
      ),
    }),
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

const FONT_SIZE = 40;
const MARGIN = 20;

function layout(overrides: Partial<StampLayoutInput> = {}) {
  const input: StampLayoutInput = {
    text: "印",
    position: "top",
    width: 600,
    height: 600,
    fontSize: FONT_SIZE,
    margin: MARGIN,
    fontName: "HuiFont",
    fontFamily: "hui-font",
    ...overrides,
  };
  return computeStampLayout(fakeCtx(FONT_SIZE), input);
}

/** 枠の外形（枠線の太さを含む）。 */
function outer(l: ReturnType<typeof layout>) {
  return {
    left: l.frameX - l.border / 2,
    top: l.frameY - l.border / 2,
    right: l.frameX + l.frameWidth + l.border / 2,
    bottom: l.frameY + l.frameHeight + l.border / 2,
  };
}

describe("computeStampLayout", () => {
  it("枠の外形が margin の内側に収まる", () => {
    for (const position of ["top", "bottom", "left", "right"] as const) {
      const l = layout({ position, text: "あいうえおかきくけこさしすせそたちつてと" });
      const o = outer(l);
      expect(o.left).toBeGreaterThanOrEqual(MARGIN - 0.001);
      expect(o.top).toBeGreaterThanOrEqual(MARGIN - 0.001);
      expect(o.right).toBeLessThanOrEqual(600 - MARGIN + 0.001);
      expect(o.bottom).toBeLessThanOrEqual(600 - MARGIN + 0.001);
    }
  });

  it("bottom は下端・right は右端に寄る", () => {
    expect(outer(layout({ position: "bottom" })).bottom).toBeCloseTo(600 - MARGIN, 5);
    expect(outer(layout({ position: "right", text: "たて" })).right).toBeCloseTo(600 - MARGIN, 5);
  });

  it("文字ブロックは常に枠の中央に置かれる（余白は上下左右に等分）", () => {
    const l = layout({ text: "あ" });
    expect(l.contentX - l.frameX).toBeCloseTo(l.frameX + l.frameWidth - (l.contentX + l.contentWidth), 5);
    expect(l.contentY - l.frameY).toBeCloseTo(l.frameY + l.frameHeight - (l.contentY + l.contentHeight), 5);
  });

  it("文字ブロックは枠からはみ出さない", () => {
    for (const text of ["印", "長めのコメントを入れてみる", "あ\nい\nう"]) {
      const l = layout({ text });
      expect(l.contentX).toBeGreaterThanOrEqual(l.frameX - 0.001);
      expect(l.contentY).toBeGreaterThanOrEqual(l.frameY - 0.001);
      expect(l.contentX + l.contentWidth).toBeLessThanOrEqual(l.frameX + l.frameWidth + 0.001);
      expect(l.contentY + l.contentHeight).toBeLessThanOrEqual(l.frameY + l.frameHeight + 0.001);
    }
  });

  it("細長くなる入力は縦横比が緩和される（上限まで短辺を広げる）", () => {
    // 横一行の長文は放っておくと極端に平たい枠になる。
    const wide = layout({ text: "よこにながいいちぎょう", position: "top" });
    const wideContentAspect = (wide.contentWidth + 0.4 * FONT_SIZE) / (wide.contentHeight + 0.4 * FONT_SIZE);
    expect(wide.frameWidth / wide.frameHeight).toBeLessThan(wideContentAspect);

    // 縦一列の長文はその逆。
    const tall = layout({ text: "たてにながいいちれつ", position: "right" });
    const tallContentAspect = (tall.contentWidth + 0.4 * FONT_SIZE) / (tall.contentHeight + 0.4 * FONT_SIZE);
    expect(tall.frameWidth / tall.frameHeight).toBeGreaterThan(tallContentAspect);
  });

  it("縦横比の補正で短辺が広がりすぎない（枠だけ大きく中身は余白、を防ぐ）", () => {
    // 補正が無ければ枠 = 文字 + padding*2。その短辺が maxAspectGrowth 倍を超えないこと。
    const padding = STAMP_GEOM.padding * FONT_SIZE * 2;
    const wide = layout({ text: "よこにながいいちぎょう", position: "top" });
    expect(wide.frameHeight).toBeLessThanOrEqual(
      (wide.glyphHeight + padding) * STAMP_GEOM.maxAspectGrowth + 0.001
    );

    const tall = layout({ text: "たてにながいいちれつ", position: "right" });
    expect(tall.frameWidth).toBeLessThanOrEqual(
      (tall.glyphWidth + padding) * STAMP_GEOM.maxAspectGrowth + 0.001
    );
  });

  it("補正は枠を広げるだけで文字を縮めない", () => {
    const l = layout({ text: "よこにながいいちぎょう", position: "top" });
    // 文字の高さ（1行）に対して枠は縦横比補正で広がっている。
    expect(l.frameHeight).toBeGreaterThan(l.contentHeight);
    // 1行なら文字ブロックの高さはグリフ高さそのもの（行送りの余りを枠の中に持ち込まない）。
    expect(l.lines.length).toBe(1);
    expect(l.contentHeight).toBeCloseTo(l.glyphHeight, 5);
  });

  it("複数行の高さは (行数-1)×行送り + グリフ高さ", () => {
    const l = layout({ text: "あ\nい\nう", position: "top" });
    expect(l.lines.length).toBe(3);
    expect(l.contentHeight).toBeCloseTo(l.lineHeight * 2 + l.glyphHeight, 5);
  });

  it("横書きは幅を超えたら折り返す", () => {
    const l = layout({ text: "あ".repeat(60), position: "top" });
    expect(l.lines.length).toBeGreaterThan(1);
  });

  it("縦書きは高さを超えたら次の列に送る", () => {
    const l = layout({ text: "あ".repeat(60), position: "right" });
    expect(l.columns.length).toBeGreaterThan(1);
    expect(l.isVertical).toBe(true);
  });

  it("縦書きは改行で列を変える（通常の縦書きと同じ規則）", () => {
    const l = layout({ text: "あい\nう", position: "right" });
    expect(l.columns.map((c) => c.map((info) => info.char).join(""))).toEqual(["あい", "う"]);
  });

  it("縦書きの空段落は空の列を1つ生む", () => {
    const l = layout({ text: "あ\n\nい", position: "right" });
    expect(l.columns.map((c) => c.length)).toEqual([1, 0, 1]);
  });

  it("縦書きは句読点・括弧の回転情報を持つ", () => {
    const l = layout({ text: "「あ」", position: "right" });
    expect(l.columns[0].map((info) => info.shouldRotate)).toEqual([true, false, true]);
  });

  it("絵文字の送り幅を実測ぶん確保する（等幅セルに押し込むと枠を突き抜ける）", () => {
    const plain = layout({ text: "最高", position: "top" });
    const withEmoji = layout({ text: "最高😀", position: "top" });
    // 全角2文字 + 絵文字1文字。絵文字は全角より広いので単純な3セルより広くなる。
    expect(withEmoji.contentWidth).toBeCloseTo(plain.contentWidth + FONT_SIZE * EMOJI_ADVANCE_RATIO, 5);
    expect(withEmoji.contentWidth).toBeGreaterThan(FONT_SIZE * 3);
  });

  it("絵文字を含む行も枠に収まる", () => {
    const l = layout({ text: "絵文字が入る長めのテキスト😀🎉", position: "top", width: 400, height: 400 });
    expect(l.contentX + l.contentWidth).toBeLessThanOrEqual(l.frameX + l.frameWidth + 0.001);
    expect(outer(l).right).toBeLessThanOrEqual(400 - MARGIN + 0.001);
  });

  it("縦書きも絵文字のぶん列幅が広がる", () => {
    const plain = layout({ text: "承認", position: "right" });
    const withEmoji = layout({ text: "承認😀", position: "right" });
    expect(withEmoji.glyphWidth).toBeCloseTo(FONT_SIZE * EMOJI_ADVANCE_RATIO, 5);
    expect(withEmoji.columnWidth).toBeGreaterThanOrEqual(withEmoji.glyphWidth);
    expect(withEmoji.glyphWidth).toBeGreaterThan(plain.glyphWidth);
  });

  it("空文字でも破綻しない", () => {
    const l = layout({ text: "" });
    expect(Number.isFinite(l.frameWidth)).toBe(true);
    expect(l.frameWidth).toBeGreaterThan(0);
    expect(l.frameHeight).toBeGreaterThan(0);
  });

  it("極端に小さい画像でも枠は正の大きさを保つ", () => {
    const l = layout({ width: 60, height: 60, margin: 10, fontSize: 14, text: "あいうえお" });
    expect(l.frameWidth).toBeGreaterThan(0);
    expect(l.frameHeight).toBeGreaterThan(0);
  });

  it("同じ入力なら同じレイアウト（乱数を持たない）", () => {
    expect(layout({ text: "再現" })).toEqual(layout({ text: "再現" }));
  });
});
