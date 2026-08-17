import { describe, it, expect } from "vitest";
import { periodRange, periodRangeText } from "./periods";

// 2026-08-17 12:34 JST（= 03:34 UTC）を基準時刻にする
const NOW = new Date("2026-08-17T12:34:00+09:00");

describe("periodRange", () => {
  it("直近7日は7日前のJST 0:00から始まる（先頭日が半端な部分日にならない）", () => {
    const r = periodRange("7d", NOW)!;
    expect(r.from.toISOString()).toBe(new Date("2026-08-10T00:00:00+09:00").toISOString());
    expect(r.to).toEqual(NOW);
  });

  it("直近31日も31日前のJST 0:00から始まる", () => {
    const r = periodRange("31d", NOW)!;
    expect(r.from.toISOString()).toBe(new Date("2026-07-17T00:00:00+09:00").toISOString());
  });

  it("時次のローリング窓は暦日に丸めず now からの経過時間で切る", () => {
    expect(periodRange("24h", NOW)!.from.toISOString()).toBe(
      new Date("2026-08-16T12:34:00+09:00").toISOString()
    );
    expect(periodRange("1h", NOW)!.from.toISOString()).toBe(
      new Date("2026-08-17T11:34:00+09:00").toISOString()
    );
  });

  it("昨日はJSTの暦日1日分 [昨日0:00, 今日0:00)", () => {
    const r = periodRange("yesterday", NOW)!;
    expect(r.from.toISOString()).toBe(new Date("2026-08-16T00:00:00+09:00").toISOString());
    expect(r.to.toISOString()).toBe(new Date("2026-08-17T00:00:00+09:00").toISOString());
  });

  it("全期間はnull（下流がDBの最古〜現在に委ねる）", () => {
    expect(periodRange("all", NOW)).toBeNull();
  });
});

describe("periodRangeText", () => {
  it("直近7日は先頭の暦日から今日までを日付で示す", () => {
    expect(periodRangeText("7d", NOW)).toBe("2026/08/10 〜 2026/08/17");
  });
});
