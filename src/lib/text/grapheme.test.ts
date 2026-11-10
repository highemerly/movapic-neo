import { describe, it, expect } from "vitest";
import {
  splitGraphemes,
  countGraphemes,
  truncateGraphemes,
  exceedsGraphemeLimit,
  isEmojiGrapheme,
  hasEmoji,
  hasNonEmojiText,
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

  it("空文字は false", () => {
    expect(isEmojiGrapheme("")).toBe(false);
  });
});

describe("hasEmoji", () => {
  it("絵文字を1つでも含めば true", () => {
    expect(hasEmoji("やった👍")).toBe(true);
    expect(hasEmoji("🇯🇵")).toBe(true); // 国旗（地域指示子）
    expect(hasEmoji("1️⃣")).toBe(true); // キーキャップ
    expect(hasEmoji("👨‍👩‍👧")).toBe(true); // ZWJ結合
  });

  it("絵文字が無ければ false", () => {
    expect(hasEmoji("こんにちは")).toBe(false);
    expect(hasEmoji("abc123!?")).toBe(false);
    expect(hasEmoji("")).toBe(false);
  });
});

describe("hasNonEmojiText", () => {
  it("絵文字・空白以外の文字があれば true", () => {
    expect(hasNonEmojiText("あ")).toBe(true);
    expect(hasNonEmojiText("hello")).toBe(true);
    expect(hasNonEmojiText("猫🐱")).toBe(true);
    expect(hasNonEmojiText("a👍")).toBe(true);
  });

  it("絵文字（＋空白）だけなら false", () => {
    expect(hasNonEmojiText("👍")).toBe(false);
    expect(hasNonEmojiText("😀🎉")).toBe(false);
    expect(hasNonEmojiText("👍 😀")).toBe(false); // 絵文字＋空白
    expect(hasNonEmojiText("   ")).toBe(false); // 空白のみ
    expect(hasNonEmojiText("")).toBe(false);
  });
});

describe("exceedsGraphemeLimit", () => {
  it("書記素で上限ちょうどは通り、1文字でも超えたら超過", () => {
    expect(exceedsGraphemeLimit("あ".repeat(140), 140)).toBe(false);
    expect(exceedsGraphemeLimit("あ".repeat(141), 140)).toBe(true);
  });

  it("絵文字は1文字（長い絵文字だけで上限まで埋めても通る）", () => {
    // 旗のサブディビジョン（14）・肌色付き ZWJ の組み合わせ（15）が正規の絵文字で長い部類
    expect(exceedsGraphemeLimit("🏴󠁧󠁢󠁥󠁮󠁧󠁿".repeat(140), 140)).toBe(false);
    expect(exceedsGraphemeLimit("👩🏽‍❤️‍💋‍👨🏿".repeat(140), 140)).toBe(false);
  });

  it("結合文字を重ねて書記素の数を抑えた巨大な入力は超過（2026-11-10 に compute の CPU を占有した入力）", () => {
    const oneGrapheme = "a" + "\u0301".repeat(100_000);
    expect(countGraphemes(oneGrapheme)).toBe(1);
    expect(exceedsGraphemeLimit(oneGrapheme, 140)).toBe(true);
    expect(exceedsGraphemeLimit(("あ" + "\u0301".repeat(1000)).repeat(140), 140)).toBe(true);
  });

  it("日本語の濁点の結合文字（か+゛）程度は普通に通る", () => {
    expect(exceedsGraphemeLimit("か\u3099".repeat(140), 140)).toBe(false);
  });
});
