import { describe, it, expect } from "vitest";
import {
  monthlyCollageNotificationHref,
  monthlyCollageNotificationId,
  monthlyCollageNotificationLines,
  toMonthlyCollageNotificationData,
} from "./monthlyCollageNotificationType";

describe("monthlyCollageNotificationId", () => {
  it("ユーザー×対象月で決まる（同じ月に2通作らない）", () => {
    expect(monthlyCollageNotificationId("u1", "2026-10")).toBe(
      monthlyCollageNotificationId("u1", "2026-10")
    );
    expect(monthlyCollageNotificationId("u1", "2026-10")).not.toBe(
      monthlyCollageNotificationId("u1", "2026-11")
    );
    expect(monthlyCollageNotificationId("u1", "2026-10")).not.toBe(
      monthlyCollageNotificationId("u2", "2026-10")
    );
  });
});

describe("toMonthlyCollageNotificationData", () => {
  it("ym を取り出す", () => {
    expect(toMonthlyCollageNotificationData({ ym: "2026-10" })).toEqual({ ym: "2026-10" });
  });

  it("形が違えば null", () => {
    expect(toMonthlyCollageNotificationData(null)).toBeNull();
    expect(toMonthlyCollageNotificationData({ ym: "2026-1" })).toBeNull();
    expect(toMonthlyCollageNotificationData({ ym: 202610 })).toBeNull();
  });
});

describe("monthlyCollageNotificationLines", () => {
  it("1行目に対象月（先頭0なし）。2行目はベルは短く、通知ページは説明つきの文章", () => {
    expect(monthlyCollageNotificationLines({ ym: "2026-09" }, "bell")).toEqual({
      title: "🖼️9月のまとめ",
      detail: "月次画像を作れます",
    });
    expect(monthlyCollageNotificationLines({ ym: "2026-12" }, "page")).toEqual({
      title: "🖼️12月のまとめ",
      detail:
        "12月の月次画像を作れます（ひと月の写真を1枚にまとめて、振り返ったり共有したりできます）。",
    });
  });

  it("対象月が読めなければ月を出さない", () => {
    expect(monthlyCollageNotificationLines(null, "bell").title).toBe("🖼️まとめ");
    expect(monthlyCollageNotificationLines(null, "page").detail).toBe(
      "月次画像を作れます（ひと月の写真を1枚にまとめて、振り返ったり共有したりできます）。"
    );
  });
});

describe("monthlyCollageNotificationHref", () => {
  it("対象月のカレンダーをダイアログを開いた状態で開く", () => {
    expect(monthlyCollageNotificationHref("alice", { ym: "2026-10" })).toBe(
      "/u/alice/calendar?year=2026&month=10&collage=1"
    );
  });

  it("対象月が読めなければ当月のカレンダー（ダイアログは開かない）", () => {
    expect(monthlyCollageNotificationHref("alice@example.com", null)).toBe(
      "/u/alice@example.com/calendar"
    );
  });
});
