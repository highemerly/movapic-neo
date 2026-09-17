import { describe, it, expect } from "vitest";
import {
  buildCollageAltText,
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

/**
 * 既定は従来ルールの非特典サーバー（上限3日）。上限は呼び出し側が ledger で解決して渡す設計なので、
 * ここでは数値で直接与える。potentialCap を省略したら cap と同じ（過去月・従来ルールと同じ扱い）。
 */
const resolve = (images: CalendarImageRow[], now: Date, makeupCap = 3, potentialCap = makeupCap) =>
  resolveCalendarMonth({ images, year: Y, month: M, makeupCap, potentialCap, now });

const PAST_NOW = new Date("2024-07-01T03:00:00Z"); // JST 2024-07-01（対象月は過去）

describe("buildCollageCaption", () => {
  it("通常月は枚数とハッシュタグつき", () => {
    expect(
      buildCollageCaption({ year: 2024, month: 6, dayCounts: { 1: 1, 2: 2 }, isPerfect: false })
    ).toBe("2024年6月はSHAMEZOに3枚の写真を投稿しました！ #shamezo");
  });
  it("皆勤月は👑を挟む", () => {
    expect(
      buildCollageCaption({ year: 2024, month: 6, dayCounts: { 1: 1 }, isPerfect: true })
    ).toBe("2024年6月はSHAMEZOに1枚の写真を投稿しました！ 👑 #shamezo");
  });
});

describe("buildCollageAltText", () => {
  const base = { year: 2024, month: 6, daysInMonth: 30 };

  it("投稿した日数を添える", () => {
    expect(buildCollageAltText({ ...base, postedDays: 6 })).toBe(
      "2024年6月に私がSHAMEZOに投稿した写真の一覧です。" +
        "カレンダー形式で、各日にその日の写真が1枚ずつ並んでいます。" +
        "30日のうち6日投稿しました。"
    );
  });

  it("全日投稿した月は「すべて」と言い切る", () => {
    expect(buildCollageAltText({ ...base, postedDays: 30 })).toContain(
      "30日すべて投稿しました。"
    );
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

  it("filledDays は holeDay 昇順で上限（makeupCap=3）件まで", () => {
    // 5,10,15,20 を空けて donor を後日に置く（26日分投稿＋donor4件）
    const posted = [1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];
    const images: CalendarImageRow[] = posted.map((d) => row(d));
    images.push(row(30, { makeupTargetDay: 20 }));
    images.push(row(29, { makeupTargetDay: 15 }));
    images.push(row(28, { makeupTargetDay: 10 }));
    images.push(row(27, { makeupTargetDay: 5 }));
    const r = resolve(images, PAST_NOW, 3);
    expect(r.filledHoleDays.slice().sort((a, b) => a - b)).toEqual([5, 10, 15, 20]);
    expect(r.filledDays.map((f) => f.day)).toEqual([5, 10, 15]); // 昇順・3件で打ち切り
    expect(r.makeupRemaining).toBe(0); // 上限超過でも負にならない
  });

  it("ポイント制の上限0なら穴埋め表示も0件（台帳が空のユーザー）", () => {
    const images = [row(1), row(3, { makeupTargetDay: 2 }), row(3)];
    const r = resolve(images, PAST_NOW, 0);
    expect(r.filledDays).toEqual([]);
  });

  it("makeupRemaining は上限 − 埋めた数", () => {
    const images = [row(1), row(3), row(3, { makeupTargetDay: 2 })];
    expect(resolve(images, PAST_NOW, 3).makeupRemaining).toBe(2);
    expect(resolve(images, PAST_NOW, 1).makeupRemaining).toBe(0);
  });
});

describe("resolveCalendarMonth: まだ埋まっていない未投稿日（unfilledDays）", () => {
  it("過去月は月内の投稿の無い日のうち、穴埋めしていない日を数える", () => {
    // 30日のうち 5・10・15 日が空き。10日は20日のダブル投稿で埋めた
    const posted = Array.from({ length: 30 }, (_, i) => i + 1).filter((d) => ![5, 10, 15].includes(d));
    const images = posted.map((d) => row(d));
    images.push(row(20, { makeupTargetDay: 10 }));
    expect(resolve(images, PAST_NOW).unfilledDays).toBe(2);
  });

  it("当月は昨日までを数え、今日の未投稿は数えない（まだ投稿できる）", () => {
    const NOW = new Date("2024-06-10T03:00:00Z"); // JST 6/10
    const images = [1, 2, 4, 5, 6, 7, 8, 9].map((d) => row(d)); // 3日が空き・今日(10)は未投稿
    expect(resolve(images, NOW).unfilledDays).toBe(1);
  });

  it("未来月は0", () => {
    expect(resolve([], new Date("2024-05-15T03:00:00Z")).unfilledDays).toBe(0);
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
    const r = resolve(posted.map((d) => row(d)), PAST_NOW, 3);
    expect(r.isPerfectAttendance).toBe(false);
  });

  it("上限0（ポイント0）でも完全皆勤なら達成（missing=0 は上限より先に短絡する）", () => {
    const images = Array.from({ length: 30 }, (_, i) => row(i + 1));
    expect(resolve(images, PAST_NOW, 0).isPerfectAttendance).toBe(true);
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

  it("当月・今日2枚投稿したがまだ穴に割り当てていない→ callout=ready（今すぐ埋められる）", () => {
    // pitfall: 以前は「今日2枚＝穴埋め済み」とみなして tomorrow を返していた（自動穴埋め前提）。
    // 手動専用だと「今すぐ穴埋めしよう」が永久に出なくなる
    const NOW = new Date("2024-06-10T03:00:00Z");
    const posted = [1, 2, 3, 4, 6, 7, 8, 9];
    const images = posted.map((d) => row(d));
    images.push(row(10)); // 今日1枚目
    images.push(row(10)); // 今日2枚目（未割当）
    expect(resolve(images, NOW).callout).toBe("ready");
  });

  it("当月・今日の投稿が既に穴を埋めている→ callout=tomorrow（1日1donor）", () => {
    const NOW = new Date("2024-06-10T03:00:00Z");
    // 3日と5日が空き。今日の2枚目で3日を埋めたが、5日がまだ残っている
    const posted = [1, 2, 4, 6, 7, 8, 9];
    const images = posted.map((d) => row(d));
    images.push(row(10));
    images.push(row(10, { makeupTargetDay: 3 }));
    expect(resolve(images, NOW).callout).toBe("tomorrow");
  });

  it("当月・穴はあるが今のポイントが0（付与を待てば達成可能）→ callout=no-points", () => {
    // 月初に cap=0 で1日休んだ。catchup+実績で2pt 見込めるので達成可能のまま
    const NOW = new Date("2024-06-05T03:00:00Z");
    const images = [1, 2, 4, 5].map((d) => row(d));
    expect(resolve(images, NOW, 0, 2).callout).toBe("no-points");
  });

  it("当月・見込みを含めても穴が多すぎて達成不可→ callout=null（つつかない）", () => {
    const NOW = new Date("2024-06-10T03:00:00Z");
    const images = [1, 6, 10].map((d) => row(d)); // 2〜5, 7〜9 の7日欠け
    expect(resolve(images, NOW, 1, 2).callout).toBeNull();
  });
});
