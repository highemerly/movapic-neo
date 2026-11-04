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
  makeupNotificationLines,
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

describe("makeupPointReasonLabel", () => {
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
});

describe("makeupNotificationLines", () => {
  const { POINT, NEED_SECOND, READY, LEGACY_REMINDER } = MAKEUP_NOTIFICATION_TYPES;

  it("付与通知は1行目に量、通知ページの2行目だけ理由の表示名を（）で添える", () => {
    const point = { reason: "monthly-catchup", amount: 2, label: "皆勤賞応援プレゼント" };
    expect(makeupNotificationLines(POINT, point, "bell")).toEqual({
      title: "🎫＋2pt",
      detail: "皆勤賞の穴埋めポイントを獲得",
    });
    expect(makeupNotificationLines(POINT, point, "page")).toEqual({
      title: "🎫＋2pt",
      detail: "皆勤賞の穴埋めポイントを獲得しました（理由：皆勤賞応援プレゼント）。",
    });
  });

  it("付与内容が読めない旧通知は量も理由も出さない", () => {
    expect(makeupNotificationLines(POINT, null, "page")).toEqual({
      title: "🎫",
      detail: "皆勤賞の穴埋めポイントを獲得しました。",
    });
  });

  it("促しの通知は1行目で種類を、2行目でやることを出す", () => {
    expect(makeupNotificationLines(NEED_SECOND, null, "bell")).toEqual({
      title: "👑穴埋めのススメ",
      detail: "今日もう1枚投稿しませんか？",
    });
    expect(makeupNotificationLines(NEED_SECOND, null, "page").detail).toBe(
      "投稿を忘れた日の穴埋めとして、今日もう1枚投稿しませんか？皆勤賞に近づきます！"
    );
    expect(makeupNotificationLines(READY, null, "bell")).toEqual({
      title: "👑穴埋め設定",
      detail: "カレンダーから穴埋めできます",
    });
    expect(makeupNotificationLines(READY, null, "page").detail).toBe(
      "皆勤賞に向けて穴埋めできるようになりました。カレンダーの「編集」から埋める日を選べます。"
    );
  });

  it("旧 makeup-reminder も同じ形で出す", () => {
    expect(makeupNotificationLines(LEGACY_REMINDER, null, "bell")).toEqual({
      title: "👑穴埋めのススメ",
      detail: "1日2枚で穴埋めできます",
    });
    expect(makeupNotificationLines(LEGACY_REMINDER, null, "page").detail).toBe(
      "皆勤賞まであと少し！別日に2枚以上投稿すると、未投稿の日を穴埋めできます。"
    );
  });
});
