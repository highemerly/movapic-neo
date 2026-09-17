/**
 * 穴埋め系通知の表示ヘルパのテスト。
 *
 * ベルと通知一覧はどちらもここから文言・遷移先を引く（以前は両方にベタ書きで、片方だけ直すと食い違った）。
 * とくに「穴埋め系の通知は achievementKey を持つので、実績通知と取り違えない」ことと、
 * 「通知から対象月のカレンダーへ飛べる」ことを固定する。
 */

import { describe, it, expect } from "vitest";
import {
  MAKEUP_NOTIFICATION_TYPES,
  isMakeupNotificationType,
  makeupNotificationHref,
  makeupNotificationText,
  makeupNotificationYm,
  makeupPointReasonLabel,
  toMakeupPointNotificationData,
} from "./notificationTypes";

describe("isMakeupNotificationType", () => {
  it("穴埋め系の4種（旧 makeup-reminder を含む）を判定する", () => {
    for (const t of Object.values(MAKEUP_NOTIFICATION_TYPES)) {
      expect(isMakeupNotificationType(t)).toBe(true);
    }
  });

  it("実績・リアクションは穴埋め系ではない", () => {
    expect(isMakeupNotificationType("achievement")).toBe(false);
    expect(isMakeupNotificationType("favorite")).toBe(false);
  });
});

describe("makeupNotificationYm / makeupNotificationHref - 対象月のカレンダーへ", () => {
  it("perfect-month:YYYY-MM から対象月を取り出す", () => {
    expect(makeupNotificationYm("perfect-month:2026-10")).toBe("2026-10");
  });

  it("形が違えば null（実績キーや壊れた値）", () => {
    expect(makeupNotificationYm("posts:50")).toBeNull();
    expect(makeupNotificationYm("perfect-month:oops")).toBeNull();
    expect(makeupNotificationYm(null)).toBeNull();
  });

  it("対象月があれば年月つきのカレンダー、無ければ当月のカレンダー", () => {
    expect(makeupNotificationHref("alice", "2026-10")).toBe("/u/alice/calendar?year=2026&month=10");
    expect(makeupNotificationHref("alice", null)).toBe("/u/alice/calendar");
  });
});

describe("toMakeupPointNotificationData", () => {
  it("reason と amount があれば取り出す", () => {
    expect(toMakeupPointNotificationData({ reason: "signup", amount: 4 })).toEqual({ reason: "signup", amount: 4 });
  });

  it("形が違えば null", () => {
    expect(toMakeupPointNotificationData(null)).toBeNull();
    expect(toMakeupPointNotificationData({ reason: "signup" })).toBeNull();
    expect(toMakeupPointNotificationData({ reason: 1, amount: 1 })).toBeNull();
  });
});

describe("makeupNotificationText / makeupPointReasonLabel", () => {
  it("付与通知は月・量・理由の表示名を出す", () => {
    expect(
      makeupNotificationText(MAKEUP_NOTIFICATION_TYPES.POINT, "2026-10", {
        reason: "monthly-catchup",
        amount: 1,
        label: "皆勤賞応援プレゼント",
      })
    ).toBe("10月の穴埋めポイントを1pt獲得しました！（皆勤賞応援プレゼント）");
  });

  it("特典サーバーの付与は、特典サーバー名つきの表示名になる", () => {
    expect(makeupPointReasonLabel("favor-monthly", ["handon.club"])).toBe("handon.club 所属特典");
    // 特典サーバーが未設定の環境では名前を出せない
    expect(makeupPointReasonLabel("favor-monthly", [])).toBe("サーバー特典");
  });

  it("先月皆勤でなかった人への付与は「皆勤賞応援プレゼント」", () => {
    expect(makeupPointReasonLabel("monthly-catchup", ["handon.club"])).toBe("皆勤賞応援プレゼント");
  });

  it("新規登録時の付与は「新規ユーザー特別プレゼント」", () => {
    expect(makeupPointReasonLabel("signup", [])).toBe("新規ユーザー特別プレゼント");
  });

  it("イベント付与はイベント一覧の名前を出す", () => {
    expect(makeupPointReasonLabel("event:launch-2026-10", [])).toBe("穴埋めポイント開始記念");
  });

  it("一覧に無いイベント（dev 用など）は「イベント」", () => {
    expect(makeupPointReasonLabel("event:dev-seed", [])).toBe("イベント");
  });

  it("旧 makeup-reminder の文言は従来のまま", () => {
    expect(makeupNotificationText(MAKEUP_NOTIFICATION_TYPES.LEGACY_REMINDER, null, null)).toBe(
      "皆勤賞まであと少し！1日2枚投稿して、穴埋めしよう。"
    );
  });
});
