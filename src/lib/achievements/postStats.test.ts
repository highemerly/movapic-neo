import { describe, it, expect } from "vitest";
import { asPostDate } from "@/lib/dayClock";
import { summarizePostDays, type PostDayRow } from "./postStats";

/** 投稿時刻（JST の "YYYY-MM-DDTHH:mm"）と記録日を持つ行。記録日を省略すると時刻の JST 日付。 */
function row(jstTime: string, o: Partial<Omit<PostDayRow, "postDate">> & { postDate?: string } = {}): PostDayRow {
  return {
    createdAt: new Date(`${jstTime}:00+09:00`),
    postDate: asPostDate(o.postDate ?? jstTime.slice(0, 10)),
    source: o.source ?? "web",
    makeupTargetDay: o.makeupTargetDay ?? null,
    makeupTargetMonthDelta: o.makeupTargetMonthDelta ?? 0,
  };
}

describe("summarizePostDays - 投稿時の評価の「日」の集計", () => {
  it("日は記録日で数える（2時区切りの人の 11/10 1:30 の投稿は 11/9 の2枚目）", () => {
    const rows = [
      row("2026-11-09T21:00"),
      row("2026-11-10T01:30", { postDate: "2026-11-09", source: "email" }),
    ];
    const s = summarizePostDays(rows, asPostDate("2026-11-09"));
    expect(s.todayPosts).toBe(2);
    expect(s.distinctSourcesToday).toBe(2); // web と email（ハットトリックの判定）
    expect(s.postMonthDayCounts).toEqual({ 9: 2 });
    expect(s.distinctDaysInPostMonth).toBe(1);
  });

  it("月も記録日で決まる（11/1 0:30 の投稿が記録日 10/31 なら10月に数える）", () => {
    const rows = [
      row("2026-10-30T12:00"),
      row("2026-11-01T00:30", { postDate: "2026-10-31" }),
    ];
    const s = summarizePostDays(rows, asPostDate("2026-10-31"));
    expect(s.postMonthDayCounts).toEqual({ 30: 1, 31: 1 });
    expect(s.distinctPostMonths).toBe(1);
  });

  it("連続日数は評価中の投稿の記録日で終わる（評価した時点の今日ではない）", () => {
    const rows = [row("2026-11-07T12:00"), row("2026-11-08T12:00"), row("2026-11-09T23:59")];
    expect(summarizePostDays(rows, asPostDate("2026-11-09")).currentStreak).toBe(3);
  });

  it("時間帯は時計どおり（記録日に関係なく投稿時刻の時）", () => {
    const rows = [
      row("2026-11-09T21:00"),
      row("2026-11-10T01:30", { postDate: "2026-11-09" }),
    ];
    expect(summarizePostDays(rows, asPostDate("2026-11-09")).distinctPostHours).toBe(2);
  });

  it("翌月1〜10日の donor が埋めた穴も、投稿月の穴埋めに数える", () => {
    const rows = [
      row("2026-10-30T12:00"),
      row("2026-11-03T12:00"),
      row("2026-11-03T13:00", { makeupTargetDay: 31, makeupTargetMonthDelta: -1 }),
    ];
    const s = summarizePostDays(rows, asPostDate("2026-10-30"));
    expect(s.filledHoleDays).toEqual([31]);
    // 翌月の投稿は10月の日別枚数には数えない
    expect(s.postMonthDayCounts).toEqual({ 30: 1 });
    expect(s.totalPosts).toBe(3);
  });
});
