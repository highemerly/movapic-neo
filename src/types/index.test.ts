import { describe, it, expect } from "vitest";
import {
  isValidPosition,
  isValidFont,
  isValidColor,
  isValidSize,
  isValidOutput,
  isValidArrangement,
  VALID_POSITIONS,
  VALID_FONTS,
  VALID_COLORS,
  VALID_SIZES,
  VALID_OUTPUTS,
  VALID_ARRANGEMENTS,
  MAX_TEXT_LENGTH,
  MAX_FILE_SIZE,
} from "./index";

describe("isValidPosition", () => {
  it("有効な位置を受け入れる", () => {
    for (const v of VALID_POSITIONS) {
      expect(isValidPosition(v)).toBe(true);
    }
  });

  it("無効な値を拒否する", () => {
    expect(isValidPosition("center")).toBe(false);
    expect(isValidPosition("")).toBe(false);
    expect(isValidPosition(null)).toBe(false);
    expect(isValidPosition(undefined)).toBe(false);
    expect(isValidPosition(123)).toBe(false);
  });
});

describe("isValidFont", () => {
  it("有効なフォントを受け入れる", () => {
    for (const v of VALID_FONTS) {
      expect(isValidFont(v)).toBe(true);
    }
  });

  it("無効な値を拒否する", () => {
    expect(isValidFont("arial")).toBe(false);
    expect(isValidFont("")).toBe(false);
    expect(isValidFont(null)).toBe(false);
  });
});

describe("isValidColor", () => {
  it("有効なカラーを受け入れる", () => {
    for (const v of VALID_COLORS) {
      expect(isValidColor(v)).toBe(true);
    }
  });

  it("無効な値を拒否する", () => {
    expect(isValidColor("purple")).toBe(false);
    expect(isValidColor("#FF0000")).toBe(false);
    expect(isValidColor("")).toBe(false);
    expect(isValidColor(null)).toBe(false);
  });
});

describe("isValidSize", () => {
  it("有効なサイズを受け入れる", () => {
    for (const v of VALID_SIZES) {
      expect(isValidSize(v)).toBe(true);
    }
  });

  it("無効な値を拒否する", () => {
    expect(isValidSize("tiny")).toBe(false);
    expect(isValidSize("xl")).toBe(false);
    expect(isValidSize("")).toBe(false);
    expect(isValidSize(null)).toBe(false);
  });
});

describe("isValidOutput", () => {
  it("有効な出力形式を受け入れる", () => {
    for (const v of VALID_OUTPUTS) {
      expect(isValidOutput(v)).toBe(true);
    }
  });

  it("無効な値を拒否する", () => {
    expect(isValidOutput("twitter")).toBe(false);
    expect(isValidOutput("jpeg")).toBe(false);
    expect(isValidOutput("")).toBe(false);
    expect(isValidOutput(null)).toBe(false);
  });
});

describe("isValidArrangement", () => {
  it("有効なアレンジを受け入れる", () => {
    for (const v of VALID_ARRANGEMENTS) {
      expect(isValidArrangement(v)).toBe(true);
    }
  });

  it("無効な値を拒否する", () => {
    expect(isValidArrangement("blur")).toBe(false);
    expect(isValidArrangement("")).toBe(false);
    expect(isValidArrangement(null)).toBe(false);
  });
});

describe("定数", () => {
  it("MAX_TEXT_LENGTH が 140", () => {
    expect(MAX_TEXT_LENGTH).toBe(140);
  });

  it("MAX_FILE_SIZE が 20MB", () => {
    expect(MAX_FILE_SIZE).toBe(20 * 1024 * 1024);
  });
});
