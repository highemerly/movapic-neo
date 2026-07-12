import { describe, it, expect } from "vitest";
import {
  buildCollageCaption,
  calendarMonthRange,
  resolveCalendarMonth,
  type CalendarImageRow,
} from "./resolveMonth";

// テスト対象は 2024年6月（30日）。JST正午 = UTC 03:00 に投稿を置く。
const Y = 2024;
const M = 6;

/** その日の JST 正午（UTC hh:00）の Date。時刻を変えれば同日内の新旧を作れる。 */
const jstNoon = (day: number, utcHour = 3) =>
  new Date(`2024-06-${String(day).padStart(2, "0")}T${String(utcHour).padStart(2, "0")}:00:00Z`);

let seq = 0;
function row(day: number, o: Partial<CalendarImageRow> = {}): CalendarImageRow {
  seq++;
  return {
    id: o.id ?? `i${day}-${seq}`,
    thumbnailKey: o.thumbnailKey ?? null,
    storageKey: o.storageKey ?? `s${day}`,
    position: o.position ?? "bottom",
    createdAt: o.createdAt ?? jstNoon(day),
    calendarPickedAt: o.calendarPickedAt ?? null,
    makeupTargetDay: o.makeupTargetDay ?? null,
  };
}

const resolve = (images: CalendarImageRow[], now: Date, domain: string | null = null) =>
  resolveCalendarMonth({ images, year: Y, month: M, domain, now });

const PAST_NOW = new Date("2024-07-01T03:00:00Z"); // JST 2024-07-01（対象月は過去）

describe("buildCollageCaption", () => {
  it("通常月はハッシュタグつき", () => {
    expect(buildCollageCaption(2024, 6, false)).toBe("2024年6月 #shamezo");
  });
  it("皆勤月は👑を挟む", () => {
    expect(buildCollageCaption(2024, 6, true)).toBe("2024年6月 👑 #shamezo");
  });
});

describe("calendarMonthRange（JST基準のUTC範囲）", () => {
  it("月初JST00:00〜翌月初JST00:00をUTCで返す", () => {
    const { startDate, endDate } = calendarMonthRange(2024, 6);
    // JST 2024-06-01 00:00 = UTC 2024-05-31 15:00
    expect(startDate.toISOString()).toBe("2024-05-31T15:00:00.000Z");
    // JST 2024-07-01 00:00 = UTC 2024-06-30 15:00
    expect(endDate.toISOString()).toBe("2024-06-30T15:00:00.000Z");
  });

  it("年跨ぎ（12月）", () => {
    const { startDate, endDate } = calendarMonthRange(2024, 12);
    expect(startDate.toISOString()).toBe("2024-11-30T15:00:00.000Z");
    expect(endDate.toISOString()).toBe("2024-12-31T15:00:00.000Z"); // JST 2025-01-01 00:00
  });
});

describe("resolveCalendarMonth: 日別集計と代表サムネ", () => {
  it("JSTの日でグルーピングし件数を数える", () => {
    const r = resolve([row(3), row(3), row(7)], PAST_NOW);
    expect(r.dayCounts).toEqual({ 3: 2, 7: 1 });
    expect(r.days[3].count).toBe(2);
    expect(r.days[7].count).toBe(1);
  });

  it("代表はその日の最古の投稿（createdAt昇順の先頭）", () => {
    const images = [
      row(15, { id: "old", createdAt: jstNoon(15, 3) }), // JST 12:00
      row(15, { id: "new", createdAt: jstNoon(15, 6) }), // JST 15:00
    ];
    expect(resolve(images, PAST_NOW).days[15].latest.id).toBe("old");
  });

  it("calendarPickedAt があれば最古より優先し、最新の pickedAt が勝つ", () => {
    const images = [
      row(15, { id: "old", createdAt: jstNoon(15, 3) }),
      row(15, { id: "pickA", createdAt: jstNoon(15, 4), calendarPickedAt: new Date("2024-06-16T00:00:00Z") }),
      row(15, { id: "pickB", createdAt: jstNoon(15, 5), calendarPickedAt: new Date("2024-06-17T00:00:00Z") }),
    ];
    expect(resolve(images, PAST_NOW).days[15].latest.id).toBe("pickB");
  });

  it("入力順に依存しない（createdAt降順を内部で保証）", () => {
    const asc = [row(15, { id: "old", createdAt: jstNoon(15, 3) }), row(15, { id: "new", createdAt: jstNoon(15, 6) })];
    const desc = [...asc].reverse();
    expect(resolve(asc, PAST_NOW).days[15].latest.id).toBe("old");
    expect(resolve(desc, PAST_NOW).days[15].latest.id).toBe("old");
  });
});

describe("resolveCalendarMonth: 穴埋め（makeup）", () => {
  it("makeupTargetDay が実在の空き日を指す donor のみ filledDays/filledHoleDays に載る", () => {
    const images = [
      row(10), // 10日は投稿あり
      row(20, { id: "d10", makeupTargetDay: 10 }), // 投稿済みの10日を指す→無効
      row(21, { id: "d5", makeupTargetDay: 5 }), // 空きの5日を指す→有効
    ];
    const r = resolve(images, PAST_NOW);
    expect(r.filledHoleDays).toEqual([5]);
    expect(r.filledDays).toHaveLength(1);
    expect(r.filledDays[0]).toMatchObject({ day: 5, filledBy: 21 });
    expect(r.filledDays[0].image.id).toBe("d5");
  });

  it("filledDays は holeDay 昇順で grace 件（非home=3）まで", () => {
    // 5,10,15,20 を空けて donor を後日に置く（26日分投稿＋donor4件）
    const posted = [1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];
    const images: CalendarImageRow[] = posted.map((d) => row(d));
    images.push(row(30, { makeupTargetDay: 20 }));
    images.push(row(29, { makeupTargetDay: 15 }));
    images.push(row(28, { makeupTargetDay: 10 }));
    images.push(row(27, { makeupTargetDay: 5 }));
    const r = resolve(images, PAST_NOW, null); // grace=3
    expect(r.filledHoleDays.slice().sort((a, b) => a - b)).toEqual([5, 10, 15, 20]);
    expect(r.filledDays.map((f) => f.day)).toEqual([5, 10, 15]); // 昇順・3件で打ち切り
  });
});

describe("resolveCalendarMonth: 皆勤賞", () => {
  it("全日投稿なら達成", () => {
    const images = Array.from({ length: 30 }, (_, i) => row(i + 1));
    const r = resolve(images, PAST_NOW);
    expect(r.isPerfectAttendance).toBe(true);
    expect(r.daysInMonth).toBe(30);
  });

  it("穴埋め枠を超える欠けは非達成", () => {
    // 5,10,15,20 の4日欠け（grace=3 超）・穴埋めなし
    const posted = Array.from({ length: 30 }, (_, i) => i + 1).filter((d) => ![5, 10, 15, 20].includes(d));
    const r = resolve(posted.map((d) => row(d)), PAST_NOW, null);
    expect(r.isPerfectAttendance).toBe(false);
  });

  it("欠けを donor で埋めれば達成", () => {
    // 10日だけ欠け→20日のダブル投稿(donor)で埋める
    const posted = Array.from({ length: 30 }, (_, i) => i + 1).filter((d) => d !== 10);
    const images = posted.map((d) => row(d));
    images.push(row(20, { makeupTargetDay: 10 })); // 20日を2枚に＝donor
    expect(resolve(images, PAST_NOW).isPerfectAttendance).toBe(true);
  });
});

describe("resolveCalendarMonth: 今月/未来月とコールアウト", () => {
  it("未来月は集計以外を短絡（穴埋め・皆勤・calloutを無効化）", () => {
    const FUTURE_NOW = new Date("2024-05-15T03:00:00Z"); // 6月から見て未来
    const images = [row(3), row(20, { makeupTargetDay: 5 })];
    const r = resolve(images, FUTURE_NOW);
    expect(r.isFutureMonth).toBe(true);
    expect(r.isCurrentMonth).toBe(false);
    expect(r.filledDays).toEqual([]);
    expect(r.filledHoleDays).toEqual([]);
    expect(r.isPerfectAttendance).toBe(false);
    expect(r.callout).toBeNull();
    // 集計自体は行われる
    expect(r.dayCounts[3]).toBe(1);
  });

  it("当月・未投稿の穴があり今日はまだ穴埋めしていない→ callout=today", () => {
    const NOW = new Date("2024-06-10T03:00:00Z"); // JST 6/10
    // 1〜9日のうち5日を空け、今日(10)は1枚だけ
    const posted = [1, 2, 3, 4, 6, 7, 8, 9, 10];
    const r = resolve(posted.map((d) => row(d)), NOW);
    expect(r.isCurrentMonth).toBe(true);
    expect(r.callout).toBe("today");
  });

  it("当月・今日すでにダブル投稿済み→ callout=tomorrow", () => {
    const NOW = new Date("2024-06-10T03:00:00Z");
    const posted = [1, 2, 3, 4, 6, 7, 8, 9];
    const images = posted.map((d) => row(d));
    images.push(row(10)); // 今日1枚目
    images.push(row(10)); // 今日2枚目＝ダブル
    const r = resolve(images, NOW);
    expect(r.callout).toBe("tomorrow");
  });
});
