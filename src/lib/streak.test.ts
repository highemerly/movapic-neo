import { describe, it, expect } from "vitest";
import { asPostDate } from "@/lib/dayClock";
import { toJstDateString, calculateStreak } from "./streak";

describe("toJstDateString", () => {
  it("UTC+9してYYYY-MM-DDを返す", () => {
    expect(toJstDateString(new Date("2024-01-15T00:00:00Z"))).toBe("2024-01-15");
    expect(toJstDateString(new Date("2024-01-15T03:00:00Z"))).toBe("2024-01-15");
  });

  it("JSTの日付境界（UTC 15:00）で日が繰り上がる", () => {
    // JST 00:00 ちょうど = 前日 UTC 15:00
    expect(toJstDateString(new Date("2024-01-14T15:00:00Z"))).toBe("2024-01-15");
    // その1ミリ秒前はまだ前日
    expect(toJstDateString(new Date("2024-01-14T14:59:59.999Z"))).toBe("2024-01-14");
  });

  it("UTCでは前月でもJSTでは翌月になるケース（月跨ぎバグの回帰）", () => {
    // 2024-03-31 20:00 UTC = 2024-04-01 05:00 JST
    expect(toJstDateString(new Date("2024-03-31T20:00:00Z"))).toBe("2024-04-01");
  });

  it("年跨ぎ", () => {
    // 2023-12-31 15:00 UTC = 2024-01-01 00:00 JST
    expect(toJstDateString(new Date("2023-12-31T15:00:00Z"))).toBe("2024-01-01");
  });
});

describe("calculateStreak", () => {
  const d = asPostDate;
  const days = (...xs: string[]) => xs.map(d);

  it("投稿が無ければ0", () => {
    expect(calculateStreak([], d("2024-01-15"))).toBe(0);
  });

  it("今日だけ投稿があれば1", () => {
    expect(calculateStreak(days("2024-01-15"), d("2024-01-15"))).toBe(1);
  });

  it("今日から連続していれば日数を数える", () => {
    expect(calculateStreak(days("2024-01-15", "2024-01-14", "2024-01-13"), d("2024-01-15"))).toBe(3);
  });

  it("今日は未投稿でも昨日があればそこから数える", () => {
    expect(calculateStreak(days("2024-01-14", "2024-01-13"), d("2024-01-15"))).toBe(2);
  });

  it("今日も昨日も無ければ0（連続が途切れている）", () => {
    expect(calculateStreak(days("2024-01-13"), d("2024-01-15"))).toBe(0);
  });

  it("途中に欠けがあればそこで打ち切る", () => {
    // 15,14 は連続、13 が欠け、12 があっても数えない
    expect(calculateStreak(days("2024-01-15", "2024-01-14", "2024-01-12"), d("2024-01-15"))).toBe(2);
  });

  it("同一日の重複はまとめて1日として数える", () => {
    expect(calculateStreak(days("2024-01-15", "2024-01-15", "2024-01-14"), d("2024-01-15"))).toBe(2);
  });

  it("anchor より後の投稿は連続数を水増ししない", () => {
    expect(calculateStreak(days("2024-01-16", "2024-01-15", "2024-01-14"), d("2024-01-15"))).toBe(2);
  });

  it("入力順に依存しない", () => {
    expect(calculateStreak(days("2024-01-13", "2024-01-15", "2024-01-14"), d("2024-01-15"))).toBe(3);
  });

  it("月またぎ・年またぎも続けて数える", () => {
    expect(calculateStreak(days("2023-12-31", "2024-01-01"), d("2024-01-01"))).toBe(2);
  });
});
