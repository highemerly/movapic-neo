/**
 * JST ユーティリティのテスト。
 *
 * ここは「サーバの今日/今月は必ず JST」という不変条件の土台。月境界の式は以前
 * resolveMonth.ts / makeupAssign.ts / reevaluate/route.ts の3箇所に重複していて、
 * 片方だけ直しても気づけない構造だった。集約したので、境界の検証もここ1箇所に集める。
 *
 * 日付は「UTC で書くと JST では別日になる」ケースを必ず含める（UTC 15:00 = 翌日 JST 00:00）。
 */

import { describe, it, expect } from "vitest";
import {
  toJstYm,
  jstDayOf,
  parseYm,
  formatYm,
  shiftYm,
  jstMonthRange,
  jstMonthRangeOfYm,
  jstDayStart,
} from "./jst";

describe("toJstYm / jstDayOf - UTCとJSTで日がずれる境界", () => {
  it("UTC 15:00 は JST では翌日になる", () => {
    // 2026-09-30T15:00Z = 2026-10-01 00:00 JST → 月も日も繰り上がる
    const d = new Date("2026-09-30T15:00:00Z");
    expect(toJstYm(d)).toBe("2026-10");
    expect(jstDayOf(d)).toBe(1);
  });

  it("UTC 14:59 はまだ JST の前日", () => {
    const d = new Date("2026-09-30T14:59:59Z");
    expect(toJstYm(d)).toBe("2026-09");
    expect(jstDayOf(d)).toBe(30);
  });

  it("JST の正午（UTC 03:00）はそのままの日付", () => {
    const d = new Date("2026-10-05T03:00:00Z");
    expect(toJstYm(d)).toBe("2026-10");
    expect(jstDayOf(d)).toBe(5);
  });
});

describe("parseYm / formatYm - 文字列と数値の相互変換", () => {
  it("YYYY-MM を year/month(1始まり) に分解する", () => {
    expect(parseYm("2026-10")).toEqual({ year: 2026, month: 10 });
    expect(parseYm("2026-01")).toEqual({ year: 2026, month: 1 });
  });

  it("1桁の月は0埋めする", () => {
    expect(formatYm(2026, 1)).toBe("2026-01");
    expect(formatYm(2026, 12)).toBe("2026-12");
  });

  it("YYYY-MM は辞書順が時系列順になる（era 判定が文字列比較で足りる根拠）", () => {
    expect("2026-09" < "2026-10").toBe(true);
    expect("2026-10" < "2026-11").toBe(true);
    expect("2026-12" < "2027-01").toBe(true);
  });
});

describe("shiftYm - 年またぎ", () => {
  it("月内の増減", () => {
    expect(shiftYm("2026-10", 1)).toBe("2026-11");
    expect(shiftYm("2026-10", -1)).toBe("2026-09");
  });

  it("1月の前月は前年の12月", () => {
    expect(shiftYm("2026-01", -1)).toBe("2025-12");
  });

  it("12月の翌月は翌年の1月", () => {
    expect(shiftYm("2026-12", 1)).toBe("2027-01");
  });

  it("0 は変化しない", () => {
    expect(shiftYm("2026-10", 0)).toBe("2026-10");
  });
});

describe("jstMonthRange - JST月境界をUTC Dateで返す", () => {
  it("10月は UTC 9/30 15:00 以上 10/31 15:00 未満", () => {
    const { start, end } = jstMonthRange(2026, 10);
    expect(start.toISOString()).toBe("2026-09-30T15:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-31T15:00:00.000Z");
  });

  it("12月の end は翌年1月の start になる", () => {
    const { end } = jstMonthRange(2026, 12);
    expect(end.toISOString()).toBe("2026-12-31T15:00:00.000Z");
    expect(end.getTime()).toBe(jstMonthRange(2027, 1).start.getTime());
  });

  it("YYYY-MM 版も同じ範囲を返す", () => {
    const a = jstMonthRange(2026, 10);
    const b = jstMonthRangeOfYm("2026-10");
    expect(b.start.getTime()).toBe(a.start.getTime());
    expect(b.end.getTime()).toBe(a.end.getTime());
  });
});

describe("jstDayStart - その日のJST 00:00", () => {
  it("JST 正午の日の 00:00 は UTC で前日15:00", () => {
    expect(jstDayStart(new Date("2026-10-05T03:00:00Z")).toISOString()).toBe(
      "2026-10-04T15:00:00.000Z"
    );
  });

  it("JST 00:00 ちょうどは自分自身を返す（境界が自分より後ろにずれない）", () => {
    const jstMidnight = new Date("2026-10-04T15:00:00Z");
    expect(jstDayStart(jstMidnight).getTime()).toBe(jstMidnight.getTime());
  });
});
