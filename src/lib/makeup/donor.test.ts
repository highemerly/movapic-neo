/**
 * 月またぎ donor（穴埋めに使える写真の範囲）のテスト。
 *
 * 守るもの:
 * - donor になれるのは「対象月の投稿」と「対象月の翌月1〜10日（＝締切まで）の投稿」だけ。
 * - 月またぎを許すのはポイント制（2026-10〜）の月だけ（旧ルールの月は自動割当と衝突する）。
 * - 1日1donor は月をまたいで共有する＝対象月の中で割当を持つ日は、他月の穴を埋めていても donorDays に入る。
 */

import { describe, it, expect } from "vitest";
import {
  DONOR_PREV_MONTH,
  DONOR_SAME_MONTH,
  buildMonthMakeupState,
  donorDeltaFor,
  donorRange,
  donorTargetYm,
  filledHoleOf,
} from "./donor";

/** JST で YYYY-MM-DD の正午。 */
const jst = (ym: string, day: number) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day, 3, 0, 0));
};
const row = (ym: string, day: number, target?: number, delta = 0) => ({
  createdAt: jst(ym, day),
  makeupTargetDay: target ?? null,
  makeupTargetMonthDelta: delta,
});

describe("donorTargetYm - 割当が指す穴の月", () => {
  it("delta=0 は同じ月・delta=-1 は前月（年またぎも）", () => {
    expect(donorTargetYm("2026-11", DONOR_SAME_MONTH)).toBe("2026-11");
    expect(donorTargetYm("2026-11", DONOR_PREV_MONTH)).toBe("2026-10");
    expect(donorTargetYm("2027-01", DONOR_PREV_MONTH)).toBe("2026-12");
  });
});

describe("donorRange - donor になれる期間", () => {
  it("対象月の1日から締切（翌月11日 0:00 JST）まで＝翌月1〜10日の投稿まで含む", () => {
    const { start, end } = donorRange("2026-10");
    expect(start).toEqual(new Date("2026-09-30T15:00:00Z")); // 10/1 0:00 JST
    expect(end).toEqual(new Date("2026-11-10T15:00:00Z")); // 11/11 0:00 JST
  });
});

describe("donorDeltaFor - その月の写真が対象月の donor になれるか", () => {
  it("同じ月は常に使える", () => {
    expect(donorDeltaFor("2026-10", "2026-10")).toBe(DONOR_SAME_MONTH);
    expect(donorDeltaFor("2026-03", "2026-03")).toBe(DONOR_SAME_MONTH);
  });

  it("ポイント制の月なら、翌月の写真で前月を埋められる", () => {
    expect(donorDeltaFor("2026-11", "2026-10")).toBe(DONOR_PREV_MONTH);
  });

  it("2026-09 以前の月は月またぎを許さない（旧ルールの自動割当と衝突するため）", () => {
    expect(donorDeltaFor("2026-10", "2026-09")).toBeNull();
  });

  it("翌々月以降・前月の写真は donor になれない", () => {
    expect(donorDeltaFor("2026-12", "2026-10")).toBeNull();
    expect(donorDeltaFor("2026-09", "2026-10")).toBeNull();
  });
});

describe("filledHoleOf - その割当が対象月の穴を埋めているか", () => {
  it("月またぎ donor は前月の穴として数え、自分の月では数えない", () => {
    const r = row("2026-11", 3, 31, DONOR_PREV_MONTH);
    expect(filledHoleOf(r, "2026-10")).toBe(31);
    expect(filledHoleOf(r, "2026-11")).toBeNull();
  });

  it("割当が無ければ null", () => {
    expect(filledHoleOf(row("2026-10", 5), "2026-10")).toBeNull();
  });
});

describe("buildMonthMakeupState - 対象月の割当状況", () => {
  it("日別の枚数・有効な穴・donor のいる日を組む", () => {
    const s = buildMonthMakeupState(
      [row("2026-10", 1), row("2026-10", 3), row("2026-10", 3, 2), row("2026-10", 4, 3)],
      "2026-10"
    );
    expect(s.dayCounts).toEqual({ 1: 1, 3: 2, 4: 1 });
    // 3日を指す割当は3日に投稿があるので穴埋めとして数えない
    expect(s.filledHoleDays).toEqual([2]);
    expect(s.donorDays.sort()).toEqual([3, 4]);
  });

  it("翌月の donor が埋めた穴も対象月の filledHoleDays に入る（投稿数には数えない）", () => {
    const s = buildMonthMakeupState(
      [row("2026-10", 1), row("2026-11", 3), row("2026-11", 3, 31, DONOR_PREV_MONTH)],
      "2026-10"
    );
    expect(s.dayCounts).toEqual({ 1: 1 });
    expect(s.filledHoleDays).toEqual([31]);
    expect(s.donorDays).toEqual([]);
  });

  it("前月の穴を埋めた写真の日も、その写真の月では donorDays に入る（1日1donor は月をまたいで共有）", () => {
    const s = buildMonthMakeupState(
      [row("2026-11", 3), row("2026-11", 3, 31, DONOR_PREV_MONTH), row("2026-11", 5)],
      "2026-11"
    );
    expect(s.donorDays).toEqual([3]);
    // 31 は10月の穴なので11月の穴埋めとしては数えない
    expect(s.filledHoleDays).toEqual([]);
  });
});
