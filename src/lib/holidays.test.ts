import { describe, it, expect } from "vitest";
import { isJapaneseHoliday } from "./holidays";

describe("isJapaneseHoliday", () => {
  it("固定祝日（元日など）を祝日と判定する", () => {
    expect(isJapaneseHoliday(2024, 1, 1)).toBe(true);
    expect(isJapaneseHoliday(2025, 1, 1)).toBe(true);
    expect(isJapaneseHoliday(2024, 11, 3)).toBe(true); // 文化の日
  });

  it("振替休日・国民の休日（CSVの「休日」）も含む", () => {
    expect(isJapaneseHoliday(2024, 2, 12)).toBe(true); // 建国記念の日の振替
    expect(isJapaneseHoliday(2024, 9, 23)).toBe(true); // 国民の休日
  });

  it("年で変動する春分・秋分を年ごとに正しく判定する", () => {
    expect(isJapaneseHoliday(2024, 3, 20)).toBe(true); // 春分
    expect(isJapaneseHoliday(2025, 3, 20)).toBe(true);
    expect(isJapaneseHoliday(2027, 3, 21)).toBe(true); // 2027は3/21
    expect(isJapaneseHoliday(2027, 3, 20)).toBe(false); // 2027の3/20は平日
  });

  it("平日は祝日ではない", () => {
    expect(isJapaneseHoliday(2024, 1, 2)).toBe(false);
    expect(isJapaneseHoliday(2024, 12, 25)).toBe(false);
  });

  it("ゼロ埋めせず month/day を渡しても一致する（内部でパディング）", () => {
    expect(isJapaneseHoliday(2024, 5, 5)).toBe(true); // "2024/5/5" → "2024-05-05"
  });

  it("データ範囲外の年は false", () => {
    expect(isJapaneseHoliday(2000, 1, 1)).toBe(false);
    expect(isJapaneseHoliday(2100, 1, 1)).toBe(false);
  });
});
