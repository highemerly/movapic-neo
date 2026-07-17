/**
 * 皆勤賞ロジック（perfectMonth.ts）の純粋関数テスト。
 *
 * ここは「割当を決める貪欲ロジック」と「永続割当から達成/進捗を導く判定」の単一ソース。
 * live(投稿時) / backfill / カレンダーAPI / 削除後の自己修復 の4経路がすべて通るため、
 * ここが正しければ表示と👑は食い違わない。
 *
 * とくに削除まわり: 削除後の自己修復 recomputeMonthMakeups は assignMonthMakeups を
 * 「削除後の残り投稿」で丸ごと呼び直す。よって assignMonthMakeups が
 * 「投稿集合が変わったときに割当をどう組み直すか」を厚めに検証する。
 */

import { describe, it, expect } from "vitest";
import {
  perfectMonthKey,
  daysInMonthOf,
  summarizeDayCounts,
  pickMakeupHole,
  assignMonthMakeups,
  isPerfectMonth,
  currentMonthMakeupStatus,
  shouldRemindMakeup,
  MAKEUP_REMINDER_MAX_SKIPPED,
} from "./perfectMonth";

/** 日→枚数のレコードを作る簡易ヘルパ（例: dc([1,1,2]) は 1日目1枚,2日目1枚,3日目2枚）。 */
function dc(perDay: number[]): Record<number, number> {
  const r: Record<number, number> = {};
  perDay.forEach((c, i) => {
    if (c > 0) r[i + 1] = c;
  });
  return r;
}

/** assignMonthMakeups の Map を素の object にして比較しやすくする（grace 既定は上限に達しない大きめの値）。 */
function assignedObj(posts: ReadonlyArray<{ id: string; day: number }>, grace = 31) {
  return Object.fromEntries(assignMonthMakeups(posts, grace));
}

describe("perfectMonthKey", () => {
  it("YYYY-MM に category を前置する", () => {
    expect(perfectMonthKey("2026-06")).toBe("perfect-month:2026-06");
  });
});

describe("daysInMonthOf - month は1始まり", () => {
  it("30日/31日", () => {
    expect(daysInMonthOf(2026, 4)).toBe(30);
    expect(daysInMonthOf(2026, 1)).toBe(31);
    expect(daysInMonthOf(2026, 12)).toBe(31);
  });
  it("うるう年の2月", () => {
    expect(daysInMonthOf(2024, 2)).toBe(29);
    expect(daysInMonthOf(2026, 2)).toBe(28);
    expect(daysInMonthOf(2000, 2)).toBe(29);
    expect(daysInMonthOf(1900, 2)).toBe(28);
  });
});

describe("summarizeDayCounts", () => {
  it("distinctDays=1枚以上の日数 / doubleDays=2枚以上の日数", () => {
    expect(summarizeDayCounts([1, 2, 3, 0, 1])).toEqual({ distinctDays: 4, doubleDays: 2 });
  });
  it("空", () => {
    expect(summarizeDayCounts([])).toEqual({ distinctDays: 0, doubleDays: 0 });
  });
});

describe("pickMakeupHole - 逐次貪欲の割当規則（穴埋めの中核）", () => {
  it("ダブル投稿日でなければ穴を埋めない（count<2 → null）", () => {
    // day3 は1枚。day1 が空いていても埋められない。
    expect(
      pickMakeupHole({ dayCounts: dc([0, 1, 1]), filledHoleDays: [], postDay: 3, postDayHasDonor: false, grace: 3 })
    ).toBeNull();
  });

  it("ダブル投稿日は自分より前の最古の空き日を埋める", () => {
    // day1,day2 が空、day3 がダブル → 最古の day1
    expect(
      pickMakeupHole({ dayCounts: dc([0, 0, 2]), filledHoleDays: [], postDay: 3, postDayHasDonor: false, grace: 3 })
    ).toBe(1);
  });

  it("既に埋め済みの日はスキップして次の空き日を返す", () => {
    // day1 は割当済み → day2 を埋める
    expect(
      pickMakeupHole({ dayCounts: dc([0, 0, 2]), filledHoleDays: [1], postDay: 3, postDayHasDonor: false, grace: 3 })
    ).toBe(2);
  });

  it("その日に既に donor がいれば埋めない（1日1donor）", () => {
    expect(
      pickMakeupHole({ dayCounts: dc([0, 0, 2]), filledHoleDays: [], postDay: 3, postDayHasDonor: true, grace: 3 })
    ).toBeNull();
  });

  it("将来日は埋められない（穴は postDay より前だけ）", () => {
    // day5 がダブルでも day6 の空きは埋められない。自分より前に空きが無いので null。
    expect(
      pickMakeupHole({ dayCounts: dc([1, 1, 1, 1, 2, 0]), filledHoleDays: [], postDay: 5, postDayHasDonor: false, grace: 3 })
    ).toBeNull();
  });

  it("自分より前がすべて投稿済みなら埋める穴が無く null", () => {
    expect(
      pickMakeupHole({ dayCounts: dc([1, 1, 2]), filledHoleDays: [], postDay: 3, postDayHasDonor: false, grace: 3 })
    ).toBeNull();
  });

  it("grace 上限に達していたら埋めない（DBの割当が表示上限 grace を超えないため）", () => {
    // day1..4 が空き、day5 ダブル。既に3件(grace=3)埋め済みなら4件目は割り当てない。
    expect(
      pickMakeupHole({
        dayCounts: dc([0, 0, 0, 0, 2]),
        filledHoleDays: [1, 2, 3],
        postDay: 5,
        postDayHasDonor: false,
        grace: 3,
      })
    ).toBeNull();
    // grace=4 ならまだ埋められる（day4）
    expect(
      pickMakeupHole({
        dayCounts: dc([0, 0, 0, 0, 2]),
        filledHoleDays: [1, 2, 3],
        postDay: 5,
        postDayHasDonor: false,
        grace: 4,
      })
    ).toBe(4);
  });
});

describe("assignMonthMakeups - 月一括の割当（削除後の再計算がこれを呼ぶ）", () => {
  it("2枚目の投稿が donor になって最古の穴を埋める", () => {
    // day1 空, day2 に a,b（bが2枚目）, day3 に c
    const assigned = assignedObj([
      { id: "a", day: 2 },
      { id: "b", day: 2 },
      { id: "c", day: 3 },
    ]);
    expect(assigned).toEqual({ b: 1 });
  });

  it("複数のダブル投稿は最古優先で別々の穴を埋める", () => {
    // day1,day2 が空。day3 と day5 がそれぞれダブル。
    const assigned = assignedObj([
      { id: "c1", day: 3 },
      { id: "c2", day: 3 }, // day1 を埋める
      { id: "e1", day: 5 },
      { id: "e2", day: 5 }, // day2 を埋める
    ]);
    expect(assigned).toEqual({ c2: 1, e2: 2 });
  });

  it("同じ日に3枚投稿しても埋めるのは1穴だけ（1日1donor）", () => {
    // day1,day2 空, day3 に3枚
    const assigned = assignedObj([
      { id: "a", day: 3 },
      { id: "b", day: 3 }, // day1 を埋める
      { id: "c", day: 3 }, // 3枚目は donor にならない
    ]);
    expect(assigned).toEqual({ b: 1 });
  });

  it("将来の穴は埋められない（月末を忘れると後日が無く埋まらない）", () => {
    // day1..day4 に投稿, day5 空(月末想定)。day5 を埋める後日のダブルが無い。
    const assigned = assignedObj([
      { id: "a", day: 1 },
      { id: "b", day: 2 },
      { id: "c", day: 3 },
      { id: "d", day: 4 },
    ]);
    expect(assigned).toEqual({});
  });

  it("grace を超える穴は割り当てない（表示上限と一致・DBに超過割当を残さない）", () => {
    // day1..4 が空き（missing=4）。day5,6,7,8 がそれぞれダブル投稿。
    const posts = [
      { id: "d5a", day: 5 }, { id: "d5b", day: 5 },
      { id: "d6a", day: 6 }, { id: "d6b", day: 6 },
      { id: "d7a", day: 7 }, { id: "d7b", day: 7 },
      { id: "d8a", day: 8 }, { id: "d8b", day: 8 },
    ];
    // grace=3: 古い順に3穴だけ埋め、4つ目のダブル(day8)は donor にならない
    expect(assignedObj(posts, 3)).toEqual({ d5b: 1, d6b: 2, d7b: 3 });
    // grace=4: day8 も4つ目の穴(day4)を埋める
    expect(assignedObj(posts, 4)).toEqual({ d5b: 1, d6b: 2, d7b: 3, d8b: 4 });
  });

  describe("削除シナリオ: 投稿集合が変わったときの組み直し", () => {
    it("donor を削除 → 同じ日の別のダブル投稿が肩代わりして穴を保つ", () => {
      // 元: day2 に a,b,c（bが穴埋め donor で day1 を埋める）。b を削除したと仮定して再計算。
      const before = assignedObj([
        { id: "a", day: 2 },
        { id: "b", day: 2 },
        { id: "c", day: 2 },
      ]);
      expect(before).toEqual({ b: 1 });

      // b 削除後の残り投稿で再計算 → c（残った2枚目）が donor になり day1 を保つ
      const after = assignedObj([
        { id: "a", day: 2 },
        { id: "c", day: 2 },
      ]);
      expect(after).toEqual({ c: 1 });
    });

    it("ダブルが解消される削除 → 穴は埋め直せず空きに戻る", () => {
      // 元: day2 に a,b（b が day1 を埋める）。a を削除すると day2 が1枚になりダブルが消える。
      const after = assignedObj([{ id: "b", day: 2 }]);
      expect(after).toEqual({});
    });

    it("穴の当日投稿を削除 → その穴自体が消え、donor は解放される", () => {
      // 元: day1 に投稿あり, day2 ダブル。day2 の donor は day1 を埋めない（day1 は空きでない）。
      const before = assignedObj([
        { id: "d1", day: 1 },
        { id: "a", day: 2 },
        { id: "b", day: 2 },
      ]);
      expect(before).toEqual({}); // 埋める穴が無い

      // d1 を削除すると day1 が空きになり、day2 のダブルが day1 を埋められるようになる
      const after = assignedObj([
        { id: "a", day: 2 },
        { id: "b", day: 2 },
      ]);
      expect(after).toEqual({ b: 1 });
    });
  });
});

describe("isPerfectMonth - 皆勤賞の達成判定", () => {
  const grace = 3;

  it("完全皆勤（missing=0）は穴埋め無しでも常に達成", () => {
    const dayCounts = dc(Array(30).fill(1));
    expect(isPerfectMonth({ daysInMonth: 30, dayCounts, filledHoleDays: [], grace })).toBe(true);
  });

  it("未投稿が grace 以内かつ全穴が埋まれば達成", () => {
    // 30日中 day1,day2 が未投稿(missing=2)。両方 filledHoleDays で埋まる。
    const dayCounts = dc([0, 0, ...Array(28).fill(1)]);
    expect(
      isPerfectMonth({ daysInMonth: 30, dayCounts, filledHoleDays: [1, 2], grace })
    ).toBe(true);
  });

  it("未投稿はあるが穴が埋まり切らなければ非達成（fills < missing）", () => {
    const dayCounts = dc([0, 0, ...Array(28).fill(1)]);
    expect(
      isPerfectMonth({ daysInMonth: 30, dayCounts, filledHoleDays: [1], grace })
    ).toBe(false);
  });

  it("未投稿が grace を超えたら穴が埋まっていても非達成", () => {
    // missing=4 > grace(3)
    const dayCounts = dc([0, 0, 0, 0, ...Array(26).fill(1)]);
    expect(
      isPerfectMonth({ daysInMonth: 30, dayCounts, filledHoleDays: [1, 2, 3, 4], grace })
    ).toBe(false);
  });

  it("grace=4（ホーム）なら missing=4 でも埋まれば達成", () => {
    const dayCounts = dc([0, 0, 0, 0, ...Array(26).fill(1)]);
    expect(
      isPerfectMonth({ daysInMonth: 30, dayCounts, filledHoleDays: [1, 2, 3, 4], grace: 4 })
    ).toBe(true);
  });

  it("実際には空きでない日を filledHoleDays に混ぜても数えない", () => {
    // day1 は空きだが day3 は投稿済み。filledHoleDays に 3 が混ざっても有効穴は day1 の1件のみ。
    const dayCounts = dc([0, 1, 1, ...Array(27).fill(1)]); // day1 のみ空き, missing=1
    expect(
      isPerfectMonth({ daysInMonth: 30, dayCounts, filledHoleDays: [3], grace })
    ).toBe(false); // day1 が埋まっていない
    expect(
      isPerfectMonth({ daysInMonth: 30, dayCounts, filledHoleDays: [1, 3], grace })
    ).toBe(true);
  });

  it("重複した filledHoleDays は1件として数える", () => {
    const dayCounts = dc([0, 0, ...Array(28).fill(1)]); // missing=2
    // 同じ穴 day1 が2回入っても missing=2 は満たせない
    expect(
      isPerfectMonth({ daysInMonth: 30, dayCounts, filledHoleDays: [1, 1], grace })
    ).toBe(false);
  });
});

describe("currentMonthMakeupStatus - 当月の進捗", () => {
  const grace = 3;

  it("今日より前の空き日数と、未充填の穴を数える", () => {
    // today=day5。day2,day3 が空き(skipped=2)。day3 は埋め済み → unfilled=1。
    const dayCounts = dc([1, 0, 0, 1, 1]);
    const s = currentMonthMakeupStatus({
      daysInMonth: 30,
      todayDayNum: 5,
      dayCounts,
      filledHoleDays: [3],
      grace,
    });
    expect(s.skippedSoFar).toBe(2);
    expect(s.unfilled).toBe(1);
  });

  it("todayUsedMakeup は今日ダブル投稿済みか", () => {
    const dayCounts = dc([1, 1, 1, 1, 2]); // day5=2枚
    const s = currentMonthMakeupStatus({
      daysInMonth: 30,
      todayDayNum: 5,
      dayCounts,
      filledHoleDays: [],
      grace,
    });
    expect(s.todayUsedMakeup).toBe(true);
  });

  it("stillAchievable は skippedSoFar <= grace", () => {
    // today=day6, day1..day4 空き(skipped=4) > grace3 → 手が届かない
    const dayCounts = dc([0, 0, 0, 0, 1]);
    const s = currentMonthMakeupStatus({
      daysInMonth: 30,
      todayDayNum: 6,
      dayCounts,
      filledHoleDays: [],
      grace,
    });
    expect(s.skippedSoFar).toBe(4);
    expect(s.stillAchievable).toBe(false);
  });

  it("今日の穴は skipped に含めない（d < todayDayNum のみ）", () => {
    // today=day3 で day3 が空きでも skipped は day1,day2 のみ対象
    const dayCounts = dc([1, 0, 0]);
    const s = currentMonthMakeupStatus({
      daysInMonth: 30,
      todayDayNum: 3,
      dayCounts,
      filledHoleDays: [],
      grace,
    });
    expect(s.skippedSoFar).toBe(1); // day2 のみ
  });
});

describe("shouldRemindMakeup - 穴埋め通知ゲート", () => {
  it("未投稿があり・未充填の穴があり・多すぎない ときだけ true", () => {
    expect(shouldRemindMakeup(2, 1)).toBe(true);
  });
  it("未充填の穴が無ければ false", () => {
    expect(shouldRemindMakeup(2, 0)).toBe(false);
  });
  it("未投稿ゼロなら false", () => {
    expect(shouldRemindMakeup(0, 0)).toBe(false);
  });
  it("穴が多すぎる（上限超）なら false", () => {
    expect(shouldRemindMakeup(MAKEUP_REMINDER_MAX_SKIPPED + 1, 1)).toBe(false);
    expect(shouldRemindMakeup(MAKEUP_REMINDER_MAX_SKIPPED, 1)).toBe(true); // 境界（上限ちょうどは可）
  });
});
