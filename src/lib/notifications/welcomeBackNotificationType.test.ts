import { describe, it, expect } from "vitest";
import {
  WELCOME_BACK_MIN_DAYS,
  toWelcomeBackNotificationData,
  welcomeBackDays,
  welcomeBackNotificationLines,
  welcomeBackNotificationText,
} from "./welcomeBackNotificationType";

/** JST の日時（"2026-10-01T12:00"）を Date にする。 */
const jst = (s: string) => new Date(`${s}:00+09:00`);

describe("welcomeBackDays", () => {
  it("前回の投稿が無い（初投稿）なら null", () => {
    expect(welcomeBackDays(null, jst("2026-11-03T12:00"))).toBeNull();
  });

  it(`暦日で ${WELCOME_BACK_MIN_DAYS} 日以上空いたら日数を返す`, () => {
    expect(welcomeBackDays(jst("2026-10-01T12:00"), jst("2026-10-31T12:00"))).toBe(30);
    expect(welcomeBackDays(jst("2026-08-01T12:00"), jst("2026-11-03T12:00"))).toBe(94);
  });

  it(`${WELCOME_BACK_MIN_DAYS} 日未満なら null`, () => {
    expect(welcomeBackDays(jst("2026-10-02T12:00"), jst("2026-10-31T12:00"))).toBeNull();
    expect(welcomeBackDays(jst("2026-11-03T08:00"), jst("2026-11-03T12:00"))).toBeNull();
  });

  it("経過時間ではなく JST の暦日で数える（深夜をまたいでも揺れない）", () => {
    // 経過は 29日と2分だが、暦日では 10/1 → 10/31 の30日
    expect(welcomeBackDays(jst("2026-10-01T23:59"), jst("2026-10-31T00:01"))).toBe(30);
    // 経過は 29日23時間58分だが、暦日では 10/1 → 10/30 の29日
    expect(welcomeBackDays(jst("2026-10-01T00:01"), jst("2026-10-30T23:59"))).toBeNull();
  });

  it("UTC では前日でも JST の日付で数える", () => {
    // 前回は JST 10/1 08:00（UTC では 9/30）
    expect(welcomeBackDays(jst("2026-10-01T08:00"), jst("2026-10-31T08:00"))).toBe(30);
  });
});

describe("toWelcomeBackNotificationData", () => {
  it("days を取り出す", () => {
    expect(toWelcomeBackNotificationData({ days: 45 })).toEqual({ days: 45 });
  });

  it("形が違えば null", () => {
    expect(toWelcomeBackNotificationData(null)).toBeNull();
    expect(toWelcomeBackNotificationData({ days: "45" })).toBeNull();
    expect(toWelcomeBackNotificationData("x")).toBeNull();
  });
});

describe("welcomeBackNotificationText", () => {
  it("日数があれば何日ぶりかを出す", () => {
    expect(welcomeBackNotificationText({ days: 45 })).toBe(
      "おかえりなさい！45日ぶりの投稿です。戻ってきてくれてうれしいです！"
    );
  });

  it("日数が読めなければ日数を出さない", () => {
    expect(welcomeBackNotificationText(null)).toBe("おかえりなさい！戻ってきてくれてうれしいです！");
  });
});

describe("welcomeBackNotificationLines", () => {
  it("1行目で「おかえりなさい！」と言い、2行目では繰り返さない", () => {
    expect(welcomeBackNotificationLines({ days: 45 }, "bell")).toEqual({
      title: "👋おかえりなさい！",
      detail: "45日ぶりの投稿です。",
    });
    expect(welcomeBackNotificationLines({ days: 45 }, "page")).toEqual({
      title: "👋おかえりなさい！",
      detail: "45日ぶりの投稿です。戻ってきてくれてうれしいです！",
    });
  });

  it("日数が読めなければ日数を出さない", () => {
    expect(welcomeBackNotificationLines(null, "bell").detail).toBe("戻ってきてくれてうれしいです！");
    expect(welcomeBackNotificationLines(null, "page").detail).toBe("戻ってきてくれてうれしいです！");
  });
});
