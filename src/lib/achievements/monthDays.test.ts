import { describe, it, expect } from "vitest";
import {
  absorbedMonthDaysKeys,
  withoutAbsorbedMonthDays,
  daysLeftToPost,
  monthDaysGoal,
  monthDaysKey,
  parseMonthDaysKey,
  reachedMonthDaysKeys,
} from "./monthDays";

describe("monthDaysKey / parseMonthDaysKey", () => {
  it("キーを組み立てて往復できる", () => {
    expect(monthDaysKey("2026-10", 10)).toBe("month-days:2026-10:10");
    expect(parseMonthDaysKey("month-days:2026-10:20")).toEqual({ ym: "2026-10", tier: 20 });
  });

  it("形式外のキーは null（皆勤賞キーなどと取り違えない）", () => {
    expect(parseMonthDaysKey("perfect-month:2026-10")).toBeNull();
    expect(parseMonthDaysKey("month-days:2026-10")).toBeNull();
  });
});

describe("reachedMonthDaysKeys", () => {
  it("しきい値は >= で到達", () => {
    expect(reachedMonthDaysKeys("2026-10", 9)).toEqual([]);
    expect(reachedMonthDaysKeys("2026-10", 10)).toEqual(["month-days:2026-10:10"]);
    expect(reachedMonthDaysKeys("2026-10", 31)).toEqual([
      "month-days:2026-10:10",
      "month-days:2026-10:20",
    ]);
  });
});

describe("absorbedMonthDaysKeys / withoutAbsorbedMonthDays", () => {
  it("20日の月は10日を吸収し、皆勤賞の月は10日・20日とも吸収する", () => {
    const absorbed = absorbedMonthDaysKeys([
      "month-days:2026-10:10",
      "month-days:2026-10:20",
      "month-days:2026-11:10",
      "month-days:2026-11:20",
      "perfect-month:2026-11",
      "month-days:2026-12:10",
    ]);
    expect([...absorbed].sort()).toEqual([
      "month-days:2026-10:10",
      "month-days:2026-11:10",
      "month-days:2026-11:20",
    ]);
  });

  it("その月の最上段だけ・別の月は独立に残す", () => {
    const items = [
      { key: "month-days:2026-10:10" },
      { key: "month-days:2026-10:20" },
      { key: "month-days:2026-12:10" },
      { key: "first-post" },
    ];
    expect(withoutAbsorbedMonthDays(items).map((i) => i.key)).toEqual([
      "month-days:2026-10:20",
      "month-days:2026-12:10",
      "first-post",
    ]);
  });
});

describe("monthDaysGoal", () => {
  it("月内に届く最も下の未到達段を次の目標にする", () => {
    expect(monthDaysGoal({ postedDays: 4, daysLeft: 20 })).toEqual({
      kind: "next",
      tier: 10,
      remaining: 6,
      reached: null,
    });
  });

  it("10日到達後は20日が次の目標（到達済みの段も返す）", () => {
    expect(monthDaysGoal({ postedDays: 12, daysLeft: 10 })).toEqual({
      kind: "next",
      tier: 20,
      remaining: 8,
      reached: 10,
    });
  });

  it("次の段が月内に届かなければ、到達済みの最上段で止める", () => {
    expect(monthDaysGoal({ postedDays: 12, daysLeft: 7 })).toEqual({ kind: "reached", tier: 10 });
  });

  it("最上段に到達済みなら reached", () => {
    expect(monthDaysGoal({ postedDays: 25, daysLeft: 6 })).toEqual({ kind: "reached", tier: 20 });
  });

  it("1段も届かず月内にも届かなければ none（過去月は daysLeft=0）", () => {
    expect(monthDaysGoal({ postedDays: 3, daysLeft: 6 })).toEqual({ kind: "none" });
    expect(monthDaysGoal({ postedDays: 9, daysLeft: 0 })).toEqual({ kind: "none" });
  });

  it("ちょうど届く日数なら次の目標になる", () => {
    expect(monthDaysGoal({ postedDays: 5, daysLeft: 5 })).toMatchObject({ kind: "next", tier: 10 });
  });
});

describe("daysLeftToPost", () => {
  it("今日未投稿なら今日を含めて数える", () => {
    expect(daysLeftToPost({ daysInMonth: 31, todayDayNum: 20, postedToday: false })).toBe(12);
  });

  it("今日投稿済みなら今日は数えない（同じ日に何枚投稿しても日数は増えない）", () => {
    expect(daysLeftToPost({ daysInMonth: 31, todayDayNum: 20, postedToday: true })).toBe(11);
    expect(daysLeftToPost({ daysInMonth: 31, todayDayNum: 31, postedToday: true })).toBe(0);
  });
});
