import { describe, it, expect } from "vitest";
import { asPostDate } from "@/lib/dayClock";
import {
  WELCOME_BACK_MIN_DAYS,
  toWelcomeBackNotificationData,
  welcomeBackDays,
  welcomeBackNotificationLines,
  welcomeBackNotificationText,
} from "./welcomeBackNotificationType";


describe("welcomeBackDays", () => {
  const d = asPostDate;

  it("前回の投稿が無い（初投稿）なら null", () => {
    expect(welcomeBackDays(null, d("2026-11-03"))).toBeNull();
  });

  it(`記録日で ${WELCOME_BACK_MIN_DAYS} 日以上空いたら日数を返す`, () => {
    expect(welcomeBackDays(d("2026-10-01"), d("2026-10-31"))).toBe(30);
    expect(welcomeBackDays(d("2026-08-01"), d("2026-11-03"))).toBe(94);
  });

  it(`${WELCOME_BACK_MIN_DAYS} 日未満なら null`, () => {
    expect(welcomeBackDays(d("2026-10-02"), d("2026-10-31"))).toBeNull();
    expect(welcomeBackDays(d("2026-11-03"), d("2026-11-03"))).toBeNull();
  });

  it("月またぎ・年またぎも日数で数える", () => {
    expect(welcomeBackDays(d("2026-12-01"), d("2027-01-15"))).toBe(45);
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
