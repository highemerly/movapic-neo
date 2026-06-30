import { describe, it, expect } from "vitest";
import {
  splitGraphemes,
  countGraphemes,
  truncateGraphemes,
  isEmojiGrapheme,
} from "./grapheme";

describe("splitGraphemes", () => {
  it("通常の日本語・英数字は1コードポイント＝1書記素", () => {
    expect(splitGraphemes("あいうabc")).toEqual(["あ", "い", "う", "a", "b", "c"]);
  });

  it("複数コードポイントの絵文字を1書記素として保持する", () => {
    expect(splitGraphemes("👍")).toEqual(["👍"]); // 単一コードポイント
    expect(splitGraphemes("👍🏽")).toEqual(["👍🏽"]); // 肌色修飾
    expect(splitGraphemes("🇯🇵")).toEqual(["🇯🇵"]); // 国旗（地域指示子2個）
    expect(splitGraphemes("1️⃣")).toEqual(["1️⃣"]); // キーキャップ
    expect(splitGraphemes("👨‍👩‍👧")).toEqual(["👨‍👩‍👧"]); // ZWJ結合
  });

  it("文字と絵文字の混在を正しく分割する", () => {
    expect(splitGraphemes("猫🐱だ")).toEqual(["猫", "🐱", "だ"]);
  });
});

describe("countGraphemes", () => {
  it("絵文字1個を1文字として数える", () => {
    expect(countGraphemes("👍")).toBe(1);
    expect(countGraphemes("🇯🇵")).toBe(1);
    expect(countGraphemes("👨‍👩‍👧")).toBe(1);
    expect(countGraphemes("あ👍い")).toBe(3);
  });

  it("空文字は0", () => {
    expect(countGraphemes("")).toBe(0);
  });
});

describe("truncateGraphemes", () => {
  it("絵文字を途中で割らずに切り詰める", () => {
    expect(truncateGraphemes("あ👨‍👩‍👧い", 2)).toBe("あ👨‍👩‍👧");
    expect(truncateGraphemes("🇯🇵🇺🇸", 1)).toBe("🇯🇵");
  });

  it("上限以下はそのまま返す", () => {
    expect(truncateGraphemes("あいう", 5)).toBe("あいう");
  });

  it("max=0 は空文字", () => {
    expect(truncateGraphemes("あ", 0)).toBe("");
  });
});

describe("isEmojiGrapheme", () => {
  it("各種絵文字を絵文字と判定する", () => {
    expect(isEmojiGrapheme("👍")).toBe(true);
    expect(isEmojiGrapheme("👍🏽")).toBe(true);
    expect(isEmojiGrapheme("🇯🇵")).toBe(true);
    expect(isEmojiGrapheme("1️⃣")).toBe(true);
    expect(isEmojiGrapheme("👨‍👩‍👧")).toBe(true);
    expect(isEmojiGrapheme("🍣")).toBe(true);
  });

  it("通常の文字は絵文字ではない", () => {
    expect(isEmojiGrapheme("あ")).toBe(false);
    expect(isEmojiGrapheme("A")).toBe(false);
    expect(isEmojiGrapheme("1")).toBe(false);
    expect(isEmojiGrapheme("、")).toBe(false);
  });
});
